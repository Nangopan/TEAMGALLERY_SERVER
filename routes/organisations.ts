import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { prisma } from '../db';
import { verifyToken, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

const s3Client = new S3Client({
  region: process.env.AWS_REGION as string,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
});

// 1. POST: Presign URL for Organization Logos
router.post('/presign', verifyToken, async (req: AuthRequest, res) => {
  try {
    if (req.user.role !== 'product_owner') return res.status(403).json({ error: "Unauthorized" });

    const { fileName, fileType } = req.body;
    const fileKey = `logos/${crypto.randomBytes(8).toString('hex')}-${fileName.replace(/\s+/g, '-')}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileKey,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
    res.json({
      uploadUrl,
      url: `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate presigned URL" });
  }
});

// 2. GET: List all Organizations
router.get('/', verifyToken, async (req: AuthRequest, res) => {
  try {
    if (req.user.role !== 'product_owner') return res.status(403).json({ error: "Unauthorized" });
    const orgs = await prisma.organisation.findMany({
      include: { admin: { select: { name: true, email: true } } },
      orderBy: { created_at: 'desc' }
    });
    res.json(orgs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
});

// 3. POST: Create Org and Auto-Generate Admin
router.post('/', verifyToken, async (req: AuthRequest, res) => {
  try {
    if (req.user.role !== 'product_owner') return res.status(403).json({ error: "Unauthorized" });

    const { name, address, phone, logo_url, adminName, adminEmail } = req.body;

    // 🟢 1. Check if organization name is already taken
    const existingOrgName = await prisma.organisation.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } } // Case-insensitive check
    });
    if (existingOrgName) {
      return res.status(400).json({ error: "An organization with this name already exists." });
    }

    // 2. Check if admin email is taken
    const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existingUser) return res.status(400).json({ error: "Admin email already in use." });

    const generateSecurePassword = () => {
      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const specialChars = "!@#$%^&*()_+";
      let password = Array.from(crypto.randomBytes(10))
        .map((byte) => chars[byte % chars.length])
        .join("");
      const randomSpecial = specialChars[crypto.randomInt(0, specialChars.length)];
      return password + randomSpecial;
    };

    const tempPassword = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      const newOrg = await tx.organisation.create({
        data: { name, address, phone, logo_url }
      });

      const newAdmin = await tx.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          password: hashedPassword,
          role: 'admin',
          organization_id: newOrg.id,
        }
      });

      await tx.organisation.update({
        where: { id: newOrg.id },
        data: { admin_id: newAdmin.id }
      });

      return { newOrg, tempPassword };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create organization" });
  }
});

// 4. DELETE: Remove Organization (And cascade delete its users/images)
router.delete('/:id', verifyToken, async (req: AuthRequest, res) => {
  try {
    const orgId=req.params.id as string
    if (req.user.role !== 'product_owner') return res.status(403).json({ error: "Unauthorized" });
    
    // Note: In a production app, you would delete the S3 images here first.
    // For MVP, we will just wipe the database records.
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { organization_id: orgId } }),
      prisma.payment.deleteMany({ where: { organization_id: orgId } }),
      prisma.image.deleteMany({ where: { organization_id: orgId } }),
      prisma.user.deleteMany({ where: { organization_id: orgId } }),
      prisma.organisation.delete({ where: { id: orgId } }),
    ]);

    res.json({ message: "Organization deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete organization" });
  }
});

// GET: Fetch Single Organization by ID
router.get('/:id', verifyToken, async (req: AuthRequest, res) => {
  try {
    if (req.user.role !== 'product_owner') return res.status(403).json({ error: "Unauthorized" });
    
    const org = await prisma.organisation.findUnique({ 
      where: { id: req.params.id as string} 
    });
    
    if (!org) return res.status(404).json({ error: "Organization not found" });
    res.json(org);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch organization details" });
  }
});


// 5. PUT: Edit Organization Details
router.put('/:id', verifyToken, async (req: AuthRequest, res) => {
  try {
    if (req.user.role !== 'product_owner') return res.status(403).json({ error: "Unauthorized" });

    const  id  = req.params.id as string;
    const { name, address, phone, logo_url } = req.body;

    // 🟢 1. Check if the NEW name is taken by ANOTHER organization
    if (name) {
      const nameConflict = await prisma.organisation.findFirst({
        where: { 
          name: { equals: name, mode: 'insensitive' },
          id: { not: id } // Exclude current organization
        }
      });
      if (nameConflict) {
        return res.status(400).json({ error: "Another organization is already using this name." });
      }
    }

    const existingOrg = await prisma.organisation.findUnique({ where: { id } });
    if (!existingOrg) return res.status(404).json({ error: "Organization not found" });

    const updatedOrg = await prisma.organisation.update({
      where: { id },
      data: { name, address, phone, logo_url }
    });

    res.json({ message: "Organization updated successfully", org: updatedOrg });
  } catch (error) {
    console.error("Update Org Error:", error);
    res.status(500).json({ error: "Failed to update organization" });
  }
});

export default router;
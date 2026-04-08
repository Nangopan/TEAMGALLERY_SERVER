import express from 'express';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
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


// POST: Generate MULTIPLE Pre-signed URLs
router.post('/presign', verifyToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const orgId = req.user?.organization_id;
    
    // The frontend will send an array of file objects: [{ name: "pic1.jpg", type: "image/jpeg" }, ...]
    const { files } = req.body; 

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files provided." });
    }

    // 1. Quota Check Math
    const uploadCount = await prisma.image.count({
      where: { uploaded_by: userId },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { image_quota: true }
    });

    const currentQuota = user?.image_quota || 5;

    if (uploadCount + files.length > currentQuota) {
      return res.status(403).json({ 
        error: `Upload rejected. You have ${currentQuota - uploadCount} slots remaining, but tried to upload ${files.length}.` 
      });
    }

    // 2. Generate all S3 links concurrently
    const presignedUrls = await Promise.all(
      files.map(async (file: any) => {
        // Generate a safe, random file name for S3
        const fileKey = `${orgId}/${userId}-${crypto.randomBytes(8).toString('hex')}-${file.name.replace(/\s+/g, '-')}`;

        const command = new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: fileKey,
          ContentType: file.type, 
        });

        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

        return {
          originalName: file.name,
          uploadUrl,
          url: `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`
        };
      })
    );

    res.status(200).json(presignedUrls);

  } catch (error) {
    console.error("Presign Error:", error);
    res.status(500).json({ error: "Failed to generate upload URLs" });
  }
});

// GET: Fetch gallery images
router.get('/', verifyToken, async (req: AuthRequest, res) => {
  try {
    const { tag } = req.query;

    const images = await prisma.image.findMany({
      where: { 
        organization_id: req.user.organization_id,
        ...(tag ? { tags: { has: tag as string } } : {})
      },
      orderBy: { created_at: 'desc' },
      // FIX: Changed "uploader" to "user" to match your schema exactly
      include: { user: { select: { name: true } } } 
    });

    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { image_quota: true }
    });

    res.json({ images, quota: currentUser?.image_quota || 5, used: images.length });
  } catch (error) {
    console.error("Gallery Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch gallery" });
  }
});

// DELETE: Remove image from S3 and Database
router.delete('/:id', verifyToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // 1. Find the image to get the S3 Key
    const image = await prisma.image.findUnique({
      where: { id: id as string }
    });

    if (!image || image.uploaded_by !== req.user.id) {
      return res.status(404).json({ error: "Image not found or unauthorized" });
    }

    // 2. Extract S3 Key from URL
    // URL looks like: https://bucket.s3.region.amazonaws.com/orgId/filename
    const fileKey = image.url.split('.com/')[1];

    // 3. Delete from AWS S3
    const deleteParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileKey,
    };
    await s3Client.send(new DeleteObjectCommand(deleteParams));

    // 4. Delete from Database
    await prisma.image.delete({
      where: { id: id as string }
    });

    res.status(200).json({ message: "Image permanently deleted" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

// GET: Fetch all users in the same organization for tagging
router.get('/members', verifyToken, async (req: AuthRequest, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { 
        organization_id: req.user.organization_id,
        id: { not: req.user.id } // Don't tag yourself
      },
      select: { id: true, name: true, email: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch members" });
  }
});

export default router;
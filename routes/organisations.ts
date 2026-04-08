import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '../db';
import { verifyToken, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();



// DELETE: Remove an organisation
router.delete('/:id', verifyToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'product_owner') {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    await prisma.organisation.delete({
      where: { id: req.params.id as string}
    });

    res.status(200).json({ message: "Organisation deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete organisation. Ensure no active users are attached." });
  }
});

// PUT: Edit an organisation
router.put('/:id', verifyToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'product_owner') {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    const { name } = req.body; // In a full app, you would include address, phone, etc.

    const updatedOrg = await prisma.organisation.update({
      where: { id: req.params.id as string},
      data: { name }
    });

    res.status(200).json(updatedOrg);
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ error: "Failed to update organisation" });
  }
});

// GET: Fetch all organisations
router.get('/', verifyToken, async (req: AuthRequest, res) => {
  try {
    // Security: Only the Product Owner should see all organisations
    if (req.user?.role !== 'product_owner') {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    const orgs = await prisma.organisation.findMany({
      include: {
        admin: { select: { name: true, email: true } } // Fetch the admin's details too
      },
      orderBy: { created_at: 'desc' }
    });

    res.status(200).json(orgs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch organisations" });
  }
});

// POST: Create a new organisation and its default Admin
router.post('/', verifyToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'product_owner') {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    const { name, logo_url, address, phone, admin_name, admin_email } = req.body;
    if (!name || !admin_name || !admin_email) {
      return res.status(400).json({ error: 'name, admin_name and admin_email are required' });
    }

    const orgId = crypto.randomUUID();
    const adminId = crypto.randomUUID();
    const tempPassword = crypto.randomBytes(4).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // We defer FK checks so we can create organisation + default admin in one transaction.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
      await tx.organisation.create({
        data: {
          id: orgId,
          name,
          logo_url,
          address,
          phone,
          admin_id: adminId,
        },
      });
      await tx.user.create({
        data: {
          id: adminId,
          name: admin_name,
          email: admin_email,
          password: hashedPassword,
          role: 'admin',
          organization_id: orgId,
        },
      });
    });
    res.status(201).json({
      message: "Organisation created",
      tempPassword: tempPassword,
      adminEmail: admin_email
    });
  } catch (error) {
    console.error(error);
    if (process.env.NODE_ENV !== 'production') {
      const details = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: 'Failed to create organisation', details });
    }
    return res.status(500).json({ error: 'Failed to create organisation' });
  }
});

export default router;
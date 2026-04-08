import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '../db'; // Using your custom db import
import { verifyToken, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

// GET: Fetch all standard users belonging to the Admin's organisation
router.get('/', verifyToken, async (req: AuthRequest, res) => {
  try {
    // Security: Only Admins can view the user management list
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: "Unauthorized. Only admins can view users." });
    }

    // Fetch users strictly tied to this Admin's org
    const users = await prisma.user.findMany({
      where: { 
        organization_id: req.user.organization_id,
        role: 'user' // Don't fetch other admins or POs
      },
      select: { 
        id: true, 
        name: true, 
        email: true, 
        image_quota: true, 
        created_at: true 
      },
      orderBy: { created_at: 'desc' }
    });

    res.status(200).json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// POST: Admin creates a new standard user
router.post('/', verifyToken, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: "Unauthorized. Only admins can create users." });
    }

    const { name, email, tempPassword } = req.body;

    if (!name || !email || !tempPassword) {
      return res.status(400).json({ error: "Name, email, and temporary password are required." });
    }

    // Hash the password the Admin typed in
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    const userId = crypto.randomUUID();

    // Create the User and automatically link them to the Admin's Organisation
    await prisma.user.create({
      data: {
        id: userId,
        name,
        email,
        password: hashedPassword,
        role: 'user', // Force the role to be a standard user
        organization_id: req.user.organization_id, // Critical: Lock them to this org
        image_quota: 5 // Default quota based on the spec
      },
    });

    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

export default router;
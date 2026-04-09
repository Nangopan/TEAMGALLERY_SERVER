import express from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../db';
import { verifyToken, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

// 1. GET: Fetch all users in the Admin's organization
router.get('/', verifyToken, async (req: AuthRequest, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { organization_id: req.user.organization_id },
      // SECURITY: Never send passwords back to the frontend
      select: { 
        id: true, 
        name: true, 
        email: true, 
        role: true, 
        image_quota: true, 
        created_at: true 
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// 2. POST: Create a new user
router.post('/', verifyToken, async (req: AuthRequest, res) => {
  try {
    // SECURITY: Only admins can create users here
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Unauthorized. Only Admins can add users." });
    }

    const { name, email, tempPassword } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "A user with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'user', // Force role to be a standard user
        organization_id: req.user.organization_id,
      }
    });

    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    console.error("Create User Error:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// 3. PUT: Edit an existing user
router.put('/:id', verifyToken, async (req: AuthRequest, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Unauthorized." });
    }

    const { id } = req.params;
    const { name, email, tempPassword } = req.body;

    // SECURITY: Ensure the target user actually belongs to this Admin's org
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser || targetUser.organization_id !== req.user.organization_id) {
      return res.status(404).json({ error: "User not found in your organization." });
    }

    // Build the update payload dynamically
    const updateData: any = { name, email };
    
    // Only update the password if the Admin generated a new one
    if (tempPassword) {
      updateData.password = await bcrypt.hash(tempPassword, 10);
    }

    await prisma.user.update({
      where: { id },
      data: updateData
    });

    res.json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Update User Error:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// 4. DELETE: Remove a user
router.delete('/:id', verifyToken, async (req: AuthRequest, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Unauthorized." });
    }

    const { id } = req.params;

    // SECURITY: Prevent the Admin from deleting their own account
    if (id === req.user.id) {
      return res.status(400).json({ error: "You cannot delete your own admin account." });
    }

    // SECURITY: Ensure target user is in the Admin's org
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser || targetUser.organization_id !== req.user.organization_id) {
      return res.status(404).json({ error: "User not found in your organization." });
    }

    // Note: If this user has uploaded images, you may need to delete those images 
    // first depending on your Prisma foreign key constraints, but for MVP this will work 
    // for users who haven't uploaded yet.
    await prisma.user.delete({
      where: { id }
    });

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete User Error:", error);
    res.status(500).json({ error: "Failed to delete user. They may have dependent records." });
  }
});

export default router;
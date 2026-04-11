import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {

    const { email, password } = req.body;
    console.log("👉 Login Attempt Received:", email, password);

    if (email === "po@system.com" && password === "test1234") {
      // Create a token specifically for our mock Product Owner
      const tokenPayload = {
        id: "mock-po-id-123",
        role: "product_owner",
        organization_id: null, // POs don't belong to a specific org
      };
      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET as string, { expiresIn: '1d' });

      return res.status(200).json({
        id: "mock-po-id-123",
        name: "Master Product Owner",
        email: "po@system.com",
        role: "product_owner",
        organization_id: null,
        token: token
      });
    }
    // --- END MOCK BYPASS ---

    // 1. Find the normal user in the database
    const user = await prisma.user.findUnique({
      where: { email },
    });


    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'JWT_SECRET is not configured' });
    }

    // const user = await prisma.user.findUnique({
    //   where: { email },
    // });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const tokenPayload = {
      id: user.id,
      role: user.role,
      organization_id: user.organization_id,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET as string, {
      expiresIn: '1d',
    });

    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organization_id: user.organization_id,
      token: token
    });

  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
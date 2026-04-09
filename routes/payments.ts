// server/routes/payments.ts
import Razorpay from 'razorpay';
import express from 'express';
import crypto from 'crypto';
import { prisma } from '../db';
import { verifyToken, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// 1. Create Order & Record Intent
router.post('/order', verifyToken, async (req: AuthRequest, res) => {
  try {
    const options = {
      amount: 100 * 100, // ₹100
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    await prisma.payment.create({
      data: {
        user_id: req.user.id,
        organization_id: req.user.organization_id,
        amount: 100,
        slots_purchased: 5,
        transaction_id: order.id, 
        status: 'pending'
      }
    });

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: "Order creation failed" });
  }
});

// 2. VERIFY PAYMENT (The Missing Route)
router.post('/verify', verifyToken, async (req: AuthRequest, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body.toString())
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    try {
      // Atomic Update: Mark payment success + Increase user quota
      await prisma.$transaction([
        prisma.payment.update({
          where: { transaction_id: razorpay_order_id },
          data: { status: 'success', transaction_id: razorpay_payment_id } // Swap order_id for real payment_id
        }),
        prisma.user.update({
          where: { id: req.user.id },
          data: { image_quota: { increment: 5 } }
        })
      ]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update quota" });
    }
  } else {
    res.status(400).json({ error: "Invalid signature" });
  }
});

router.post('/fail', verifyToken, async (req: AuthRequest, res) => {
  const { order_id } = req.body;
  try {
    await prisma.payment.update({
      where: { transaction_id: order_id },
      data: { status: 'failed' }
    });
    res.json({ message: "Updated" });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
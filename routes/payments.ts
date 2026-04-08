import Razorpay from 'razorpay';
import express from 'express';
import { verifyToken, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

router.post('/order', verifyToken, async (req: AuthRequest, res) => {
  const options = {
    amount: 100 * 100, // ₹100 in paise
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
  };

  try {
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: "Order creation failed" });
  }
});

export default router;
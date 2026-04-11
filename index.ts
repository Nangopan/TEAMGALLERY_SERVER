import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import orgRoutes from './routes/organisations';
import userRoutes from './routes/users';
import imageRoutes from './routes/images';
import paymentRoutes from './routes/payments';
import notificationRoutes from "./routes/notifications"
import nocache from 'nocache';


const app = express();

// CRITICAL: Allow your Next.js frontend to talk to this backend
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());
app.use(nocache());

// Register the Authentication Route
app.use('/api/auth', authRoutes);
app.use('/api/organisations', orgRoutes);
app.use('/api/users', userRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
console.log("✅ Users route registered");

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
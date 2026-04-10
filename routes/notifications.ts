// server/routes/notifications.ts
import express from 'express';
import { prisma } from '../db';
import { verifyToken, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

// 1. GET: Fetch all notifications for the logged-in user
router.get('/', verifyToken, async (req: AuthRequest, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { receiver_ids: { has: req.user.id } }, // ✅ Use 'has' for array field
      include: {
        sender: { select: { name: true } } // Show who sent/tagged you
      },
      orderBy: { created_at: 'desc' },
      take: 20 // Keep the list manageable
    });

    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});


// // 2. PATCH: Mark a specific notification as read
// router.patch('/:id/read', verifyToken, async (req: AuthRequest, res) => {
//   try {
//     await prisma.notification.update({
//       where: { id: req.params.id, receiver_id: req.user.id },
//       data: { is_read: true }
//     });
//     res.json({ message: "Marked as read" });
//   } catch (error) {
//     res.status(500).json({ error: "Update failed" });
//   }
// });

// // 3. PATCH: Mark all as read
// router.patch('/read-all', verifyToken, async (req: AuthRequest, res) => {
//   try {
//     await prisma.notification.updateMany({
//       where: { receiver_id: req.user.id, is_read: false },
//       data: { is_read: true }
//     });
//     res.json({ message: "All cleared" });
//   } catch (error) {
//     res.status(500).json({ error: "Update failed" });
//   }
// });
// 2. DELETE: Remove a notification
router.delete('/:id', verifyToken, async (req: AuthRequest, res) => {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id }
    });

    // Verify current user is in the receiver_ids array
    if (!notification || !notification.receiver_ids.includes(req.user.id)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await prisma.notification.delete({
      where: { id: req.params.id }
    });

    res.json({ message: "Notification deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

export default router;
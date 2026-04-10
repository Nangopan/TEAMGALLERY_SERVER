import express from 'express';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { prisma } from '../db'; 
import { verifyToken, AuthRequest } from '../middleware/authMiddleware';

import webpush from '../utils/pushConfig';

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

    // 1. Fetch ALL images for the organization gallery (Team Photos)
    const allImages = await prisma.image.findMany({
      where: { 
        organization_id: req.user.organization_id,
        ...(tag ? { tags: { has: tag as string } } : {})
      },
      orderBy: { created_at: 'desc' },
      include: { user: { select: { name: true } } } 
    });

    // 2. 🟢 THE FIX: Count ONLY the images uploaded by THIS specific user for quota
    const personalUploadCount = await prisma.image.count({
      where: { 
        uploaded_by: req.user.id 
      }
    });

    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { image_quota: true }
    });

    // 3. Return 'used' as the personal count, but still send 'images' for the gallery
    res.json({ 
      images: allImages, 
      quota: currentUser?.image_quota || 5, 
      used: personalUploadCount // This is now dynamic and accurate per user
    });
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

// POST: Create image records and send notifications
router.post('/', verifyToken, async (req: AuthRequest, res) => {
  try {
    const { uploadedUrls, taggedUserIds } = req.body;
    const userId = req.user.id;
    const orgId = req.user.organization_id;
    const senderName = req.user.name;

    // 1. Transaction Logic
    const result = await prisma.$transaction(async (tx) => {
       // 🟢 FIX: Actually create the image records
       const imageRecords = await Promise.all(
         uploadedUrls.map((url: string) =>
           tx.image.create({
             data: {
               url,
               uploaded_by: userId,
               organization_id: orgId,
               tags: taggedUserIds || [],
             },
           })
         )
       );

       // 🟢 FIX: Create In-App Notifications for the history bell
       let recipientIds: string[] = [];
       if (taggedUserIds && taggedUserIds.length > 0) {
         recipientIds = taggedUserIds;
       } else {
         const members = await tx.user.findMany({
           where: { organization_id: orgId, id: { not: userId } },
           select: { id: true }
         });
         recipientIds = members.map(m => m.id);
       }

       if (recipientIds.length > 0) {
         await tx.notification.createMany({
           data: recipientIds.map(recId => ({
             organization_id: orgId,
             sender_id: userId,
             receiver_id: recId,
             message: taggedUserIds?.length > 0 
               ? `${senderName} tagged you in a new photo!` 
               : `${senderName} added new photos to the vault.`,
             image_id: imageRecords[0].id 
           }))
         });
       }

       return imageRecords;
    });

    // 2. 🟢 PUSH NOTIFICATION DISPATCHER
    let recipients = [];

    if (taggedUserIds && taggedUserIds.length > 0) {
      recipients = await prisma.user.findMany({
        where: { id: { in: taggedUserIds }, organization_id: orgId },
        select: { pushSubscription: true }
      });
    } else {
      recipients = await prisma.user.findMany({
        where: { organization_id: orgId, id: { not: userId } },
        select: { pushSubscription: true }
      });
    }

    const payload = JSON.stringify({
      title: taggedUserIds?.length > 0 ? "You've been tagged!" : "New Team Photos",
      message: `${senderName} added ${uploadedUrls.length} photos to the vault.`,
      image: uploadedUrls[0], 
      url: "/user/gallery"
    });

    recipients.forEach((u: any) => {
      if (u.pushSubscription) {
        webpush.sendNotification(u.pushSubscription, payload)
          .catch(err => console.error("Push delivery failed:", err));
      }
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Upload/Push Error:", error);
    res.status(500).json({ error: "Upload succeeded, but notifications may have failed." });
  }
});


export default router;
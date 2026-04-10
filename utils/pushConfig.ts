
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:nangopan889@example.com', // Replace with your real email
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export default webpush;
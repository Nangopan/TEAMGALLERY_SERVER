import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

// 🚨 CRITICAL: Load the .env variables before initializing Prisma
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('test@1234', 10);

  const productOwner = await prisma.user.create({
    data: {
      name: 'System Admin',
      email: 'po@teamgallery.com', // Your login email
      password: hashedPassword,
      role: 'product_owner', // Must match your backend check exactly
      // Since this is the top-level PO, they usually don't belong to an org
      organization_id: null, 
    },
  });

  console.log('✅ Product Owner created:', productOwner.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
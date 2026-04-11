import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg'; // 🟢 Added adapter
import pg from 'pg'; // 🟢 Added pg
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

// Load the .env variables
dotenv.config();

// 🟢 Initialize Prisma 7 with the adapter
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set in .env");
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const poEmail = 'product_owner@gmail.com';

  const existingPO = await prisma.user.findUnique({
    where: { email: poEmail },
  });

  if (existingPO) {
    console.log('⚡ Product Owner already exists. Skipping seed.');
    return;
  }

  console.log('🌱 Seeding database...');

  const systemOrg = await prisma.organisation.create({
    data: {
      name: 'TeamGallery Administration',
      address: 'System Cloud',
    },
  });

  const hashedPassword = await bcrypt.hash('test@1234', 10);

  const productOwner = await prisma.user.create({
    data: {
      name: 'System Admin',
      email: poEmail,
      password: hashedPassword,
      role: 'product_owner',
      organization_id: systemOrg.id, 
    },
  });

  await prisma.organisation.update({
    where: { id: systemOrg.id },
    data: { admin_id: productOwner.id },
  });

  console.log('✅ Product Owner and System Organization created successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
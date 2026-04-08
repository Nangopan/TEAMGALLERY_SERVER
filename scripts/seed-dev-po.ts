/**
 * Local-only: creates a Product Owner user + org + default admin so you can log in and test Module 3.
 * Run: npx tsx scripts/seed-dev-po.ts
 */
// import bcrypt from "bcrypt";
// import crypto from "crypto";
// import { prisma } from "../db";

// const PO_EMAIL = "product_owner@dev.local";
// const PO_PASSWORD = "dev123456";
// const ADMIN_EMAIL = "org_admin@dev.local";
// const ADMIN_PASSWORD = "dev123456";

// async function main() {
//   const existing = await prisma.user.findUnique({ where: { email: PO_EMAIL } });
//   if (existing) {
//     console.log("Already seeded:", PO_EMAIL);
//     await prisma.$disconnect();
//     return;
//   }

//   const orgId = crypto.randomUUID();
//   const adminId = crypto.randomUUID();
//   const poId = crypto.randomUUID();

//   const [adminHash, poHash] = await Promise.all([
//     bcrypt.hash(ADMIN_PASSWORD, 10),
//     bcrypt.hash(PO_PASSWORD, 10),
//   ]);

//   await prisma.$transaction(async (tx) => {
//     await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
//     await tx.organisation.create({
//       data: {
//         id: orgId,
//         name: "Dev Platform Org",
//         admin_id: adminId,
//       },
//     });
//     await tx.user.create({
//       data: {
//         id: adminId,
//         name: "Dev Org Admin",
//         email: ADMIN_EMAIL,
//         password: adminHash,
//         role: "admin",
//         organization_id: orgId,
//       },
//     });
//     await tx.user.create({
//       data: {
//         id: poId,
//         name: "Dev Product Owner",
//         email: PO_EMAIL,
//         password: poHash,
//         role: "product_owner",
//         organization_id: orgId,
//       },
//     });
//   });

//   console.log("Seed complete. Product Owner login:");
//   console.log("  Email:", PO_EMAIL);
//   console.log("  Password:", PO_PASSWORD);
//   console.log("Org Admin (for later modules):", ADMIN_EMAIL, "/", ADMIN_PASSWORD);
//   await prisma.$disconnect();
// }

// main().catch((e) => {
//   console.error(e);
//   process.exit(1);
// });

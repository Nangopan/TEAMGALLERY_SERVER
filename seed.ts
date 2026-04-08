import bcrypt from "bcrypt";

async function main() {
  const { prisma } = await import("./db");
  try {
    const hashedPassword = await bcrypt.hash("password123", 10);

    const user = await prisma.user.create({
      data: {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Intern Test Admin",
        email: "admin@test.com",
        password: hashedPassword,
        role: "admin",
        organization_id: "00000000-0000-0000-0000-000000000000",
      },
    });

    console.log("Test user created:", user.email);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Seed error:", e);
  process.exit(1);
});

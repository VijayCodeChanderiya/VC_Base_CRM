import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.branch.upsert({
    where: { code: "MAIN" },
    update: {},
    create: { id: "00000000-0000-0000-0000-000000000001", code: "MAIN", name: "Main Branch" },
  });

  const passwordHash = await bcrypt.hash("Admin@123", 10);

  await prisma.user.upsert({
    where: { email: "admin@alphatech.local" },
    update: {},
    create: {
      name: "System Admin",
      email: "admin@alphatech.local",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  console.log("Seeded admin user: admin@alphatech.local / Admin@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

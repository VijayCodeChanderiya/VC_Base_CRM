import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

// One-off bootstrap for a fresh database (e.g. a new Neon instance) that has
// no SUPER_ADMIN yet. Safe to re-run: it never touches an existing account.
const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL ?? "superadmin@alphatech.local";
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!password) {
    console.error("Set SUPER_ADMIN_PASSWORD (and optionally SUPER_ADMIN_EMAIL) before running this script.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`A user with email "${email}" already exists (role: ${existing.role}). Not touching it.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name: "Platform Super Admin",
      email,
      passwordHash,
      role: Role.SUPER_ADMIN,
    },
  });

  console.log(`Created SUPER_ADMIN: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

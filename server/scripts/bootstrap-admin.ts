import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const farmName = process.env.BOOTSTRAP_FARM_NAME ?? "Croxton East";
    const farmId = process.env.BOOTSTRAP_FARM_ID;

    const emailRaw = required("BOOTSTRAP_EMAIL");
    const password = required("BOOTSTRAP_PASSWORD");
    const displayName = process.env.BOOTSTRAP_DISPLAY_NAME ?? "Admin";

    const email = emailRaw.trim().toLowerCase();

    const farm = farmId
      ? await prisma.farm.findUnique({ where: { id: farmId } })
      : await prisma.farm.findFirst({ where: { name: farmName }, orderBy: { createdAt: "asc" } });

    const ensuredFarm =
      farm ??
      (await prisma.farm.create({
        data: {
          name: farmName,
        },
      }));

    const existing = await prisma.user.findFirst({
      where: {
        farmId: ensuredFarm.id,
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
    });

    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`User already exists: ${existing.id} (${existing.email}) farm=${ensuredFarm.id}`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        farmId: ensuredFarm.id,
        email,
        passwordHash,
        displayName,
        role: "manager",
      },
    });

    // eslint-disable-next-line no-console
    console.log(`Created manager user: ${user.id} (${user.email}) farm=${ensuredFarm.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

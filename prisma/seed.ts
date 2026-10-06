// Creates the first ADMIN so a new environment can manage users without editing the database.
// Run with `npx prisma db seed`. Reads ADMIN_EMAIL and ADMIN_PASSWORD from .env.
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';
import { PrismaClient, Rol } from '../src/generated/prisma/client';

const BCRYPT_SALT_ROUNDS = 10;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not defined in .env`);
  }
  return value;
}

async function main() {
  const email = requireEnv('ADMIN_EMAIL').toLowerCase();
  const password = requireEnv('ADMIN_PASSWORD');
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(requireEnv('DATABASE_URL')),
  });

  try {
    // Never overwrite an existing account (its password or role).
    const existing = await prisma.usuario.findUnique({ where: { email } });
    if (existing) {
      console.log(
        `Seed: ${email} already exists (rol ${existing.rol}), skipped.`,
      );
      return;
    }

    await prisma.usuario.create({
      data: {
        nombre: 'Admin',
        apellido: 'CapiLAR',
        email,
        telefono: process.env.ADMIN_TELEFONO?.trim() ?? '',
        contrasena: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS),
        rol: Rol.ADMIN,
      },
    });
    console.log(`Seed: admin ${email} created.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { Prisma } from '../generated/prisma/client';

/**
 * Whether a Prisma error has this code, e.g. P2002 (unique index), P2003 (foreign key) or
 * P2025 (row not found). Used to turn races between a check and a write into a 4xx.
 */
export function esErrorPrisma(error: unknown, codigo: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === codigo
  );
}

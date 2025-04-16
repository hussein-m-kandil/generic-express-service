import { PrismaClient } from '../prisma/generated/client';

export type GlobalWithPrisma = typeof globalThis & {
  prisma: PrismaClient | undefined;
};

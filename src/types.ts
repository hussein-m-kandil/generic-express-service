import { PrismaClient, User } from '../prisma/generated/client';

export type GlobalWithPrisma = typeof globalThis & {
  prisma: PrismaClient | undefined;
};

export type NewDefaultUser = Omit<
  User,
  'id' | 'isAdmin' | 'createdAt' | 'updatedAt'
>;

import { PrismaClient, User } from '../prisma/generated/client';
import { userSchema } from './api/v1/users/user.schema';
import { z } from 'zod';

export type GlobalWithPrisma = typeof globalThis & {
  prisma: PrismaClient | undefined;
};

export type NewDefaultUser = Omit<
  User,
  'id' | 'isAdmin' | 'createdAt' | 'updatedAt'
>;

export type PublicUser = Omit<User, 'password' | 'isAdmin'>;

export type NewUserInput = z.input<typeof userSchema>;

export type NewUserOutput = z.output<typeof userSchema>;

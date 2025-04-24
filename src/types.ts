import { PrismaClient, User } from '../prisma/generated/client';
import { userSchema } from './api/v1/users/user.schema';
import { JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';

export type GlobalWithPrisma = typeof globalThis & {
  prisma: PrismaClient | undefined;
};

export type NewDefaultUser = Omit<
  User,
  'id' | 'isAdmin' | 'createdAt' | 'updatedAt'
>;

export type PublicUser = Omit<User, 'password' | 'isAdmin'>;

export type JwtUser = Omit<PublicUser, 'createdAt' | 'updatedAt'>;

export type NewUserInput = z.input<typeof userSchema>;

export type NewUserOutput = z.output<typeof userSchema>;

export type AppJwtPayload = JwtPayload & JwtUser;

export interface AuthResponse {
  user: PublicUser;
  token: string;
}

export interface AppErrorResponse {
  error: {
    name: string;
    message: string;
  };
}

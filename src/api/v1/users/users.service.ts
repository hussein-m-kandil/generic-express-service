import { Prisma } from '../../../../prisma/generated/client';
import {
  AppInvalidIdError,
  AppUniqueConstraintViolationError,
} from '../../../lib/app-error';
import { NewUserOutput, PublicUser } from '../../../types';
import { SALT } from '../../../lib/config';
import db from '../../../lib/db';
import bcrypt from 'bcryptjs';

const omit = { password: true, isAdmin: true };

const hashPassword = (password: string) => bcrypt.hash(password, SALT);

export default {
  async getAll() {
    return await db.user.findMany();
  },

  async createOne(newUser: NewUserOutput): Promise<PublicUser> {
    try {
      newUser.password = await hashPassword(newUser.password);
      return await db.user.create({ data: newUser, omit });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const targets = error.meta?.target as string[] | undefined;
        throw new AppUniqueConstraintViolationError(
          targets?.at(-1) ?? 'username'
        );
      }
      throw error;
    }
  },

  async findOneById(id: string): Promise<PublicUser | null> {
    try {
      return await db.user.findUnique({ where: { id }, omit });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2023'
      ) {
        throw new AppInvalidIdError();
      }
      throw error;
    }
  },
};

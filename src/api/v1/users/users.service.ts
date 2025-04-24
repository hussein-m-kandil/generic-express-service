import { Prisma } from '../../../../prisma/generated/client';
import { AppInvalidIdError } from '../../../lib/app-error';
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
    newUser.password = await hashPassword(newUser.password);
    return await db.user.create({ data: newUser, omit });
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

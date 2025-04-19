import { NewUserOutput, PublicUser } from '../../../types';
import { SALT } from '../../../lib/config';
import db from '../../../lib/db';
import bcrypt from 'bcryptjs';

const hashPassword = (password: string) => bcrypt.hash(password, SALT);

export default {
  async getAll() {
    return await db.user.findMany();
  },

  async createOne(newUser: NewUserOutput): Promise<PublicUser> {
    newUser.password = await hashPassword(newUser.password);
    return await db.user.create({
      data: newUser,
      omit: { password: true, isAdmin: true },
    });
  },
};

import { NewUser, PublicUser } from '../../../types';
import db from '../../../lib/db';

export default {
  async getAll() {
    return await db.user.findMany();
  },

  async createOne(newUser: NewUser): Promise<PublicUser> {
    return await db.user.create({
      data: newUser,
      omit: { password: true, isAdmin: true },
    });
  },
};

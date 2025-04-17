import db from '../../../lib/db';

export default {
  async getAll() {
    return await db.user.findMany();
  },
};

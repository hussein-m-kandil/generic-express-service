import { User } from '../../../../prisma/generated/client';
import { SECRET, TOKEN_EXP_PERIOD } from '../../../lib/config';
import { AppJwtPayload, PublicUser } from '../../../types';
import jwt from 'jsonwebtoken';
import ms from 'ms';

export default {
  getJwtFromUser(user: PublicUser): string {
    const { id, username, fullname } = user;
    const payload: AppJwtPayload = { id, username, fullname };
    const token = jwt.sign(payload, SECRET, {
      expiresIn: TOKEN_EXP_PERIOD as ms.StringValue,
    });
    return `Bearer ${token}`;
  },
  getPublicUserFromUser(user: User): PublicUser {
    const { id, username, fullname, createdAt, updatedAt } = user;
    return { id, username, fullname, createdAt, updatedAt };
  },
};

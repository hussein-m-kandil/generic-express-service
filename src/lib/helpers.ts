import { User } from '../../prisma/generated/client';
import { SECRET, TOKEN_EXP_PERIOD } from './config';
import { AppJwtPayload, PublicUser } from '../types';
import jwt from 'jsonwebtoken';
import ms from 'ms';

export const createJwtForUser = (user: PublicUser): string => {
  const { id, username, fullname } = user;
  const payload: AppJwtPayload = { id, username, fullname };
  const token = jwt.sign(payload, SECRET, {
    expiresIn: TOKEN_EXP_PERIOD as ms.StringValue,
  });
  return `Bearer ${token}`;
};

export const convertUserToPublicUser = (user: User): PublicUser => {
  const { id, username, fullname, createdAt, updatedAt } = user;
  return { id, username, fullname, createdAt, updatedAt };
};

export default {
  createJwtForUser,
  convertUserToPublicUser,
};

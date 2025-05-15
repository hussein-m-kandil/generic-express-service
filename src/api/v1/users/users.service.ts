import { Prisma } from '../../../../prisma/generated/client';
import { NewUserOutput, PublicUser } from '../../../types';
import { handleDBKnownErrors } from '../../../lib/helpers';
import { AppNotFoundError } from '../../../lib/app-error';
import { SALT } from '../../../lib/config';
import db from '../../../lib/db';
import bcrypt from 'bcryptjs';

const hashPassword = (password: string) => bcrypt.hash(password, SALT);

export const getAllUsers = async () => await db.user.findMany();

export const createUser = async (
  newUser: NewUserOutput
): Promise<PublicUser> => {
  const data = { ...newUser };
  data.password = await hashPassword(data.password);
  const dbQuery = db.user.create({ data });
  const handlerOptions = { uniqueFieldName: 'username' };
  const user = await handleDBKnownErrors(dbQuery, handlerOptions);
  return user;
};

export const findUserById = async (id: string): Promise<PublicUser | null> => {
  const dbQuery = db.user.findUnique({ where: { id } });
  const user = await handleDBKnownErrors(dbQuery);
  return user;
};

export const findUserByIdOrThrow = async (id: string) => {
  const user = await findUserById(id);
  if (!user) throw new AppNotFoundError('User not found');
  return user;
};

export const updateUser = async (
  id: string,
  userData: Prisma.UserUpdateInput
): Promise<void> => {
  const data = { ...userData };
  if (data.password && typeof data.password === 'string') {
    data.password = await hashPassword(data.password);
  }
  const dbQuery = db.user.update({ where: { id }, data });
  const handlerOptions = {
    notFoundErrMsg: 'User not found',
    uniqueFieldName: 'username',
  };
  await handleDBKnownErrors(dbQuery, handlerOptions);
};

export const deleteUser = async (id: string): Promise<void> => {
  const dbQuery = db.user.delete({ where: { id } });
  await handleDBKnownErrors(dbQuery);
};

export default {
  findUserByIdOrThrow,
  findUserById,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
};

import { Prisma } from '../../../../prisma/generated/client';
import { NewUserOutput, PublicUser } from '../../../types';
import { handleDBKnownErrors } from '../../../lib/helpers';
import { SALT } from '../../../lib/config';
import db from '../../../lib/db';
import bcrypt from 'bcryptjs';

const omit = { password: true, isAdmin: true };

const hashPassword = (password: string) => bcrypt.hash(password, SALT);

export const getAll = async () => await db.user.findMany();

export const createOne = async (
  newUser: NewUserOutput
): Promise<PublicUser> => {
  const data = { ...newUser };
  data.password = await hashPassword(data.password);
  const dbQuery = db.user.create({ data, omit });
  const handlerOptions = { uniqueFieldName: 'username' };
  const user = await handleDBKnownErrors(dbQuery, handlerOptions);
  return user;
};

export const findOneById = async (id: string): Promise<PublicUser | null> => {
  const dbQuery = db.user.findUnique({ where: { id }, omit });
  const user = await handleDBKnownErrors(dbQuery);
  return user;
};

export const updateOne = async (
  id: string,
  userData: Prisma.UserUpdateInput
): Promise<void> => {
  const data = { ...userData };
  if (data.password && typeof data.password === 'string') {
    data.password = await hashPassword(data.password);
  }
  const dbQuery = db.user.update({ where: { id }, data, omit });
  const handlerOptions = {
    notFoundErrMsg: 'User not found',
    uniqueFieldName: 'username',
  };
  await handleDBKnownErrors(dbQuery, handlerOptions);
};

export const deleteOne = async (id: string): Promise<void> => {
  const dbQuery = db.user.delete({ where: { id }, omit });
  await handleDBKnownErrors(dbQuery);
};

export default { getAll, createOne, findOneById, updateOne, deleteOne };

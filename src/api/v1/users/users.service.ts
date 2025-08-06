import * as Types from '@/types';
import * as Bcrypt from 'bcryptjs';
import * as Utils from '@/lib/utils';
import * as Config from '@/lib/config';
import * as AppError from '@/lib/app-error';
import { Prisma } from '@/../prisma/client';
import db from '@/lib/db';

const hashPassword = (password: string) => Bcrypt.hash(password, Config.SALT);

export const getAllUsers = async (filters?: Types.PaginationFilters) => {
  return await db.user.findMany({
    ...(filters ? Utils.getPaginationArgs(filters) : {}),
  });
};

export const createUser = async (
  newUser: Types.NewUserOutput
): Promise<Types.PublicUser> => {
  const data = { ...newUser };
  data.password = await hashPassword(data.password);
  const dbQuery = db.user.create({ data });
  const handlerOptions = { uniqueFieldName: 'username' };
  const user = await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
  return user;
};

export const findUserById = async (
  id: string
): Promise<Types.PublicUser | null> => {
  const dbQuery = db.user.findUnique({ where: { id } });
  const user = await Utils.handleDBKnownErrors(dbQuery);
  return user;
};

export const findUserByUsername = async (
  username: string
): Promise<Types.PublicUser | null> => {
  const dbQuery = db.user.findUnique({ where: { username } });
  const user = await Utils.handleDBKnownErrors(dbQuery);
  return user;
};

export const findUserByIdOrUsername = async (
  idOrUsername: string
): Promise<Types.PublicUser | null> => {
  try {
    return await findUserById(idOrUsername);
  } catch (error) {
    if (error instanceof AppError.AppInvalidIdError) {
      // So, the id was not a valid UUID, and could be a username
      return await findUserByUsername(idOrUsername);
    }
    throw error;
  }
};

export const findUserByIdOrByUsernameOrThrow = async (idOrUsername: string) => {
  const user = await findUserByIdOrUsername(idOrUsername);
  if (!user) throw new AppError.AppNotFoundError('User not found');
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
  await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
};

export const deleteUser = async (id: string): Promise<void> => {
  const dbQuery = db.user.delete({ where: { id } });
  await Utils.handleDBKnownErrors(dbQuery);
};

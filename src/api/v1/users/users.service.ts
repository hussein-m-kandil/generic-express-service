import { Prisma } from '../../../../prisma/generated/client';
import {
  AppInvalidIdError,
  AppNotFoundError,
  AppUniqueConstraintViolationError,
} from '../../../lib/app-error';
import { NewUserOutput, PublicUser } from '../../../types';
import { SALT } from '../../../lib/config';
import db from '../../../lib/db';
import bcrypt from 'bcryptjs';
import { catchDBKnownError } from '../../../lib/helpers';

const omit = { password: true, isAdmin: true };

const hashPassword = (password: string) => bcrypt.hash(password, SALT);

export const getAll = async () => await db.user.findMany();

export const createOne = async (
  newUser: NewUserOutput
): Promise<PublicUser> => {
  const data = { ...newUser };
  data.password = await hashPassword(data.password);
  const [user, dbKnownError] = await catchDBKnownError(
    db.user.create({ data, omit })
  );
  if (dbKnownError) {
    if (dbKnownError.code === 'P2002') {
      const targets = dbKnownError.meta?.target as string[] | undefined;
      throw new AppUniqueConstraintViolationError(
        targets?.at(-1) ?? 'username'
      );
    }
    throw dbKnownError;
  }
  return user;
};

export const findOneById = async (id: string): Promise<PublicUser | null> => {
  const [user, dbKnownError] = await catchDBKnownError(
    db.user.findUnique({ where: { id }, omit })
  );
  if (dbKnownError) {
    if (dbKnownError.code === 'P2023') throw new AppInvalidIdError();
    throw dbKnownError;
  }
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
  const dbKnownError = (
    await catchDBKnownError(db.user.update({ where: { id }, data, omit }))
  )[1];
  if (dbKnownError) {
    if (dbKnownError.code === 'P2023') {
      throw new AppInvalidIdError();
    }
    if (dbKnownError.code === 'P2025') {
      throw new AppNotFoundError('user not found');
    }
    if (dbKnownError.code === 'P2002') {
      const targets = dbKnownError.meta?.target as string[] | undefined;
      throw new AppUniqueConstraintViolationError(
        targets?.at(-1) ?? 'username'
      );
    }
    throw dbKnownError;
  }
};

export const deleteOne = async (id: string): Promise<void> => {
  const error = (
    await catchDBKnownError(db.user.delete({ where: { id }, omit }))
  )[1];
  if (error) {
    if (error.code === 'P2023') throw new AppInvalidIdError();
    if (error.code === 'P2025') return;
    throw error;
  }
};

export default { getAll, createOne, findOneById, updateOne, deleteOne };

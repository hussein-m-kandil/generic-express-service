import {
  AppInvalidIdError,
  AppNotFoundError,
  AppUniqueConstraintViolationError,
} from '../lib/app-error';
import { User, Prisma } from '../../prisma/generated/client';
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
  const { id, bio, username, fullname, createdAt, updatedAt } = user;
  return { id, bio, username, fullname, createdAt, updatedAt };
};

export const catchDBKnownError = async <P>(
  dbPromise: Promise<P>
): Promise<[P, null] | [null, Prisma.PrismaClientKnownRequestError]> => {
  try {
    return [await dbPromise, null];
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return [null, error];
    }
    throw error;
  }
};

export interface DBKnownErrorsHandlerOptions {
  notFoundErrMsg?: string;
  uniqueFieldName?: string;
}

export const handleDBKnownErrors = async <T>(
  dbQuery: Promise<T>,
  options?: DBKnownErrorsHandlerOptions
): Promise<T> => {
  const [post, error] = await catchDBKnownError(dbQuery);
  if (error) {
    if (error.code === 'P2023' || error.code === 'P2003') {
      throw new AppInvalidIdError();
    }
    if (error.code === 'P2025') {
      throw new AppNotFoundError(options?.notFoundErrMsg);
    }
    if (error.code === 'P2002') {
      const targets = error.meta?.target as string[] | undefined;
      throw new AppUniqueConstraintViolationError(
        targets?.at(-1) ?? options?.uniqueFieldName ?? 'some fields'
      );
    }
    throw error;
  }
  return post;
};

export default {
  createJwtForUser,
  catchDBKnownError,
  handleDBKnownErrors,
  convertUserToPublicUser,
};

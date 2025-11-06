import * as Types from '@/types';
import * as Bcrypt from 'bcryptjs';
import * as Utils from '@/lib/utils';
import * as AppError from '@/lib/app-error';
import db from '@/lib/db';

const hashPassword = (password: string) => Bcrypt.hash(password, 10);

export const getAllUsers = async (filters?: Types.PaginationFilters) => {
  return await db.user.findMany({
    ...(filters ? Utils.getPaginationArgs(filters) : {}),
    ...Utils.userAggregation,
  });
};

export const createUser = async ({
  avatarId,
  password,
  ...data
}: Types.NewUserOutput): Promise<Types.PublicUser> => {
  const dbQuery = db.user.create({
    data: {
      ...data,
      password: await hashPassword(password),
      profile: { create: { lastSeen: new Date() } },
      ...(avatarId ? { avatar: { create: { imageId: avatarId } } } : {}),
    },
    ...Utils.userAggregation,
  });
  const handlerOptions = { uniqueFieldName: 'username' };
  const user = await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
  return user;
};

export const findUserById = async (id: string): Promise<Types.PublicUser | null> => {
  const dbQuery = db.user.findUnique({
    where: { id },
    ...Utils.userAggregation,
  });
  const user = await Utils.handleDBKnownErrors(dbQuery);
  return user;
};

export const findUserByUsername = async (username: string): Promise<Types.PublicUser | null> => {
  const dbQuery = db.user.findUnique({
    where: { username },
    ...Utils.userAggregation,
  });
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
  { avatarId, password, ...data }: Types.UpdateUserOutput
) => {
  const dbQuery = db.user.update({
    where: { id },
    data: {
      ...data,
      ...(password && typeof password === 'string'
        ? { password: await hashPassword(password) }
        : {}),
      ...(avatarId
        ? {
            avatar: {
              connectOrCreate: {
                where: { userId: id },
                create: { imageId: avatarId },
              },
            },
          }
        : {}),
    },
    ...Utils.userAggregation,
  });
  const handlerOptions = {
    notFoundErrMsg: 'User not found',
    uniqueFieldName: 'username',
  };
  return await Utils.handleDBKnownErrors(dbQuery, handlerOptions);
};

export const deleteUser = async (id: string): Promise<void> => {
  const dbQuery = db.user.delete({ where: { id }, ...Utils.userAggregation });
  await Utils.handleDBKnownErrors(dbQuery);
};

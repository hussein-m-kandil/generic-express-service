import * as Utils from '@/lib/utils';
import * as Schema from './profile.schema';
import { AppNotFoundError, AppUniqueConstraintViolationError } from '@/lib/app-error';
import { Prisma, Profile, User } from '@/../prisma/client';
import db from '@/lib/db';

export const getAllProfiles = async () => {
  return await Utils.handleDBKnownErrors(db.profile.findMany({ ...Utils.profileAggregation }));
};

export const getProfileById = async (id: Profile['id']) => {
  const profile = await Utils.handleDBKnownErrors(
    db.profile.findUnique({ ...Utils.profileAggregation, where: { id } })
  );
  if (profile) return profile;
  throw new AppNotFoundError('Profile not found');
};

export const updateProfileByUserId = async (userId: User['id'], data: Schema.ValidProfile) => {
  return await Utils.handleDBKnownErrors(
    db.profile.update({ ...Utils.profileAggregation, where: { userId }, data })
  );
};

export const createFollowing = async (userId: User['id'], { profileId }: Schema.ValidFollowing) => {
  try {
    await Utils.handleDBKnownErrors(
      db.profile.update({
        ...Utils.profileAggregation,
        where: { userId },
        data: { following: { create: { profileId } } },
      })
    );
  } catch (error) {
    if (error instanceof AppUniqueConstraintViolationError) return;
    throw error;
  }
};

export const deleteFollowing = async (userId: User['id'], { profileId }: Schema.ValidFollowing) => {
  try {
    await Utils.handleDBKnownErrors(
      db.$transaction(async (prismaClient) => {
        const currentProfile = await prismaClient.profile.findUnique({ where: { userId } });
        if (!currentProfile) throw new AppNotFoundError('Profile not found');
        await prismaClient.follows.delete({
          where: { profileId_followerId: { followerId: currentProfile.id, profileId } },
        });
      })
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2017') return;
    throw error;
  }
};

export const getAllFollowing = async (userId: User['id']) => {
  return await Utils.handleDBKnownErrors(
    db.profile.findMany({
      where: { followers: { some: { follower: { userId } } } },
      orderBy: { user: { username: 'asc' } },
      ...Utils.profileAggregation,
    })
  );
};

export const getAllFollowers = async (userId: User['id']) => {
  return await Utils.handleDBKnownErrors(
    db.profile.findMany({
      where: { following: { some: { profile: { userId } } } },
      orderBy: { user: { username: 'asc' } },
      ...Utils.profileAggregation,
    })
  );
};

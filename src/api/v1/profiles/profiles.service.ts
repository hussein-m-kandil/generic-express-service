import * as Utils from '@/lib/utils';
import * as Schema from './profile.schema';
import { AppNotFoundError, AppUniqueConstraintViolationError } from '@/lib/app-error';
import { Profile, User } from '@/../prisma/client';
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

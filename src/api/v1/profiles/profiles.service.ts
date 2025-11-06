import * as Utils from '@/lib/utils';
import { AppNotFoundError } from '@/lib/app-error';
import { Profile } from '@/../prisma/client';
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

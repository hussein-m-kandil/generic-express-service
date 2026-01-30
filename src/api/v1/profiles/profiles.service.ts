import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Schema from './profile.schema';
import { AppNotFoundError, AppUniqueConstraintViolationError } from '@/lib/app-error';
import { Prisma, Profile, User } from '@/../prisma/client';
import db from '@/lib/db';

export const prepareProfileData = (data: Types.PublicProfile | Types.PublicProfile[]) => {
  const arrayGiven = Array.isArray(data);
  const profiles = arrayGiven ? data : [data];
  for (const p of profiles) {
    if (!p.visible) p.lastSeen = p.user.createdAt;
  }
  return arrayGiven ? profiles : profiles[0];
};

const getProfilePaginationArgs = (filters: Types.ProfileFilters, limit = 10) => {
  return {
    orderBy: { user: { username: filters.sort ?? 'asc' } },
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: filters.limit ?? limit,
  };
};

const getNameFilterArgs = (nameFilter: Types.ProfileFilters['name']) => {
  if (nameFilter) {
    const args = { contains: nameFilter, mode: 'insensitive' as const };
    return { OR: [{ username: args }, { fullname: args }] };
  }
  return {};
};

export const getAllProfiles = async (userId: User['id'], filters: Types.ProfileFilters = {}) => {
  return prepareProfileData(
    await Utils.handleDBKnownErrors(
      db.profile.findMany({
        where: { user: getNameFilterArgs(filters.name) },
        ...Utils.profileAggregation,
        ...getProfilePaginationArgs(filters),
      }),
    ),
  );
};

export const getProfileById = async (id: Profile['id']) => {
  const profile = await Utils.handleDBKnownErrors(
    db.profile.findUnique({ ...Utils.profileAggregation, where: { id } }),
  );
  if (profile) return prepareProfileData(profile);
  throw new AppNotFoundError('Profile not found');
};

export const updateProfileByUserId = async (userId: User['id'], data: Schema.ValidProfile) => {
  return prepareProfileData(
    await Utils.handleDBKnownErrors(
      db.profile.update({ ...Utils.profileAggregation, where: { userId }, data }),
    ),
  );
};

export const createFollowing = async (userId: User['id'], { profileId }: Schema.ValidFollowing) => {
  try {
    await Utils.handleDBKnownErrors(
      db.profile.update({
        ...Utils.profileAggregation,
        where: { userId },
        data: { following: { create: { profileId } } },
      }),
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
      }),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2017') return;
    throw error;
  }
};

export const getAllFollowing = async (userId: User['id'], filters: Types.ProfileFilters = {}) => {
  return prepareProfileData(
    await Utils.handleDBKnownErrors(
      db.profile.findMany({
        where: {
          followers: { some: { follower: { userId } } },
          user: getNameFilterArgs(filters.name),
        },
        ...Utils.profileAggregation,
        ...getProfilePaginationArgs(filters),
      }),
    ),
  );
};

export const getAllFollowers = async (userId: User['id'], filters: Types.ProfileFilters = {}) => {
  return prepareProfileData(
    await Utils.handleDBKnownErrors(
      db.profile.findMany({
        where: {
          following: { some: { profile: { userId } } },
          user: getNameFilterArgs(filters.name),
        },
        ...Utils.profileAggregation,
        ...getProfilePaginationArgs(filters),
      }),
    ),
  );
};

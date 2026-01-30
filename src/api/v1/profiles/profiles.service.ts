import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Schema from './profile.schema';
import { AppNotFoundError, AppUniqueConstraintViolationError } from '@/lib/app-error';
import { Prisma, Profile, User } from '@/../prisma/client';
import db from '@/lib/db';

type ProfilePayload = Prisma.ProfileGetPayload<{
  include: typeof Utils.profileAggregation.include & {
    followers: { include: { follower: typeof Utils.profileAggregation } };
  };
}>;

export const prepareProfileData = (
  data: ProfilePayload | ProfilePayload[],
  userId: User['id'],
): Types.PublicProfile | Types.PublicProfile[] => {
  const arrayGiven = Array.isArray(data);
  const profiles = arrayGiven ? data : [data];
  const preparedProfiles = profiles.map(({ followers, ...profile }) => {
    if (!profile.visible) profile.lastSeen = profile.user.createdAt;
    return {
      ...profile,
      followedByCurrentUser: followers.some((f) => f.follower.userId === userId),
    };
  });
  return arrayGiven ? preparedProfiles : preparedProfiles[0];
};

const getProfilePaginationArgs = (filters: Types.ProfileFilters, limit = 10) => {
  return {
    orderBy: { user: { username: filters.sort ?? 'asc' } },
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: filters.limit ?? limit,
  };
};

const getExtendedProfileAggregationArgs = (userId: User['id']) => {
  return {
    include: {
      ...Utils.profileAggregation.include,
      followers: {
        where: { follower: { userId } },
        include: { follower: Utils.profileAggregation },
      },
    },
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
        ...getProfilePaginationArgs(filters),
        ...getExtendedProfileAggregationArgs(userId),
        where: { user: getNameFilterArgs(filters.name) },
      }),
    ),
    userId,
  );
};

export const getProfileById = async (profileId: Profile['id'], userId: User['id']) => {
  const profile = await Utils.handleDBKnownErrors(
    db.profile.findUnique({
      ...getExtendedProfileAggregationArgs(userId),
      where: { id: profileId },
    }),
  );
  if (profile) return prepareProfileData(profile, userId);
  throw new AppNotFoundError('Profile not found');
};

export const updateProfileByUserId = async (userId: User['id'], data: Schema.ValidProfile) => {
  return prepareProfileData(
    await Utils.handleDBKnownErrors(
      db.profile.update({
        ...getExtendedProfileAggregationArgs(userId),
        where: { userId },
        data,
      }),
    ),
    userId,
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
        ...getProfilePaginationArgs(filters),
        ...getExtendedProfileAggregationArgs(userId),
        where: {
          followers: { some: { follower: { userId } } },
          user: getNameFilterArgs(filters.name),
        },
      }),
    ),
    userId,
  );
};

export const getAllFollowers = async (userId: User['id'], filters: Types.ProfileFilters = {}) => {
  return prepareProfileData(
    await Utils.handleDBKnownErrors(
      db.profile.findMany({
        ...getProfilePaginationArgs(filters),
        ...getExtendedProfileAggregationArgs(userId),
        where: {
          following: { some: { profile: { userId } } },
          user: getNameFilterArgs(filters.name),
        },
      }),
    ),
    userId,
  );
};

import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as AppError from '@/lib/app-error';
import { Notification, User } from '@/../prisma/client';
import db from '@/lib/db';

export const prepareNotification = async (
  notificationPayload: Types.NotificationPayload,
  userId: User['id'],
): Promise<Types.PublicNotification> => {
  const { receivers, profile, profileId, ...notification } = notificationPayload;
  const seenAt = receivers.find((r) => r.profile.userId === userId)?.seenAt ?? null;
  if (profile) {
    const followedByCurrentUser = !!(await db.follows.findFirst({
      where: { follower: { userId }, profile: { id: profileId ?? profile.id } },
    }));
    return { ...notification, seenAt, profileId, profile: { ...profile, followedByCurrentUser } };
  }
  return { ...notification, seenAt, profileId, profile };
};

export const getUserNotifications = async (
  userId: User['id'],
  filters: Types.BasePaginationFilters,
) => {
  const notifications = await Utils.handleDBKnownErrors(
    db.notification.findMany({
      where: { receivers: { some: { profile: { userId } } } },
      include: {
        profile: Utils.profileAggregation,
        receivers: {
          where: { profile: { userId } },
          include: { profile: Utils.profileAggregation },
        },
      },
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: filters.sort ?? 'desc' },
      take: filters.limit ?? 10,
    }),
  );
  const preparedNotifications: Awaited<ReturnType<typeof prepareNotification>>[] = [];
  for (const notification of notifications) {
    preparedNotifications.push(await prepareNotification(notification, userId));
  }
  return preparedNotifications;
};

export const getUserNotificationById = async (id: Notification['id'], userId: User['id']) => {
  let notification: Types.NotificationPayload | null = null;
  try {
    notification = await Utils.handleDBKnownErrors(
      db.notification.findUnique({
        where: { id, receivers: { some: { profile: { userId } } } },
        include: {
          profile: Utils.profileAggregation,
          receivers: {
            where: { profile: { userId } },
            include: { profile: Utils.profileAggregation },
          },
        },
      }),
    );
  } catch (error) {
    if (!(error instanceof AppError.AppInvalidIdError)) throw error;
  }
  if (!notification) throw new AppError.AppNotFoundError('Notification not found.');
  return await prepareNotification(notification, userId);
};

export const markUserNotificationsAsSeen = async (userId: User['id']) => {
  await Utils.handleDBKnownErrors(
    db.notificationsReceivers.updateMany({
      where: { profile: { userId }, seenAt: null },
      data: { seenAt: new Date() },
    }),
  );
};

export const deleteUserNotificationById = async (id: Notification['id'], userId: User['id']) => {
  try {
    await Utils.handleDBKnownErrors(
      db.notificationsReceivers.deleteMany({ where: { notificationId: id, profile: { userId } } }),
    );
  } catch (error) {
    if (
      !(error instanceof AppError.AppInvalidIdError || error instanceof AppError.AppNotFoundError)
    )
      throw error;
  }
};

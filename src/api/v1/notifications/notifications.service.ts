import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as AppError from '@/lib/app-error';
import { Notification, User } from '@/../prisma/client';
import db from '@/lib/db';

export const prepareNotification = async (
  notification: Types.NotificationPayload,
  userId: User['id'],
) => {
  const followedByCurrentUser = !!(
    notification.profileId &&
    (await db.follows.findFirst({
      where: { follower: { userId }, profile: { id: notification.profileId } },
    }))
  );
  return { ...notification, profile: { ...notification.profile, followedByCurrentUser } };
};

export const getUserNotifications = async (userId: User['id']) => {
  const notifications = await Utils.handleDBKnownErrors(
    db.notification.findMany({
      where: { receivers: { some: { profile: { userId } } } },
      include: { profile: Utils.profileAggregation },
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
        include: { profile: Utils.profileAggregation },
      }),
    );
  } catch (error) {
    if (!(error instanceof AppError.AppInvalidIdError)) throw error;
  }
  if (!notification) throw new AppError.AppNotFoundError('Notification not found.');
  return await prepareNotification(notification, userId);
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

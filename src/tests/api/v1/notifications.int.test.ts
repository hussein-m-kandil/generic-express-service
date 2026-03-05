import * as Types from '@/types';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { SIGNIN_URL, NOTIFICATIONS_URL } from './utils';
import { Notification } from '@/../prisma/client';
import setup from '../setup';
import db from '@/lib/db';

const assertNotification = (
  notification: Types.PublicNotification,
  dbNotification: Notification,
) => {
  expect(notification.description).toBe(dbNotification.description);
  expect(notification.header).toBe(dbNotification.header);
  expect(notification.url).toBe(dbNotification.url);
  expect(notification.id).toBe(dbNotification.id);
  expect(notification.profile).toBeTruthy();
  expect(notification.profile!.id).toBeTruthy();
  expect(notification.profile!.user).toBeTruthy();
  expect(notification.profile).toHaveProperty('followedByCurrentUser');
  expect(notification).not.toHaveProperty('receivers');
  expect(notification.seenAt).toBeDefined();
};

describe('Notification endpoints', async () => {
  const {
    userOneData,
    dbUserOne,
    dbUserTwo,
    dbXUser,
    api,
    deleteAllUsers,
    prepForAuthorizedTest,
    assertNotFoundErrorRes,
    assertUnauthorizedErrorRes,
  } = await setup(SIGNIN_URL);

  afterEach(async () => {
    await db.notification.deleteMany({});
  });

  afterAll(async () => {
    await deleteAllUsers();
  });

  const createNotifications = async () => {
    const dbNotifications: Notification[] = [];

    const notificationsData = [
      {
        createdAt: new Date(Date.now() - 3 * 24 * 60 ** 2 * 1000),
        header: `${dbUserOne.username} liked your post`,
        profileId: dbUserOne.profile!.id,
        profileName: dbUserOne.username,
        url: '/n1',
      },
      {
        createdAt: new Date(Date.now() - 2 * 24 * 60 ** 2 * 1000),
        header: `${dbUserTwo.username} liked your post`,
        profileId: dbUserTwo.profile!.id,
        profileName: dbUserTwo.username,
        url: '/n2',
      },
      {
        createdAt: new Date(Date.now() - 1 * 24 * 60 ** 2 * 1000),
        header: `${dbXUser.username} added a new comment`,
        profileId: dbXUser.profile!.id,
        profileName: dbXUser.username,
        description: 'Good job!',
        url: '/n3',
      },
    ];

    for (const data of notificationsData) {
      dbNotifications.push(await db.notification.create({ data }));
    }

    await db.notificationsReceivers.createMany({
      data: [
        { notificationId: dbNotifications[0].id, profileId: dbUserTwo.profile!.id },
        { notificationId: dbNotifications[1].id, profileId: dbUserOne.profile!.id },
        { notificationId: dbNotifications[2].id, profileId: dbUserOne.profile!.id },
        { notificationId: dbNotifications[2].id, profileId: dbUserTwo.profile!.id },
      ],
    });

    return dbNotifications;
  };

  describe(`GET ${NOTIFICATIONS_URL}`, () => {
    it('should respond with 401 on an unauthenticated request', async () => {
      const res = await api.get(NOTIFICATIONS_URL);
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with an empty array', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(NOTIFICATIONS_URL);
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with an array of notifications', async () => {
      const dbNotifications = await createNotifications();
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(NOTIFICATIONS_URL);
      const resBody = res.body as Types.PublicNotification[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toHaveLength(2);
      for (const notification of resBody) {
        const dbNotification = dbNotifications.find((n) => n.id === notification.id)!;
        expect(dbNotification).toBeTruthy();
        assertNotification(notification, dbNotification);
      }
    });

    it('should respond array of current user notifications in descending order', async () => {
      const dbNotifications = await createNotifications();
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(NOTIFICATIONS_URL);
      const resBody = res.body as Types.PublicNotification[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toHaveLength(2);
      assertNotification(resBody[0], dbNotifications[2]);
      assertNotification(resBody[1], dbNotifications[1]);
    });

    it('should respond array of the last notification only', async () => {
      const dbNotifications = await createNotifications();
      const cursor = dbNotifications[1].id;
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(`${NOTIFICATIONS_URL}?sort=asc&cursor=${cursor}`);
      const resBody = res.body as Types.PublicNotification[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toHaveLength(1);
      assertNotification(resBody[0], dbNotifications[2]);
    });

    it('should respond array of the first current user notification only', async () => {
      const dbNotifications = await createNotifications();
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(`${NOTIFICATIONS_URL}?sort=asc&limit=1`);
      const resBody = res.body as Types.PublicNotification[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toHaveLength(1);
      assertNotification(resBody[0], dbNotifications[1]);
    });
  });

  describe(`GET ${NOTIFICATIONS_URL}/:id`, () => {
    it('should respond with 401 on an unauthenticated request', async () => {
      const dbNotifications = await createNotifications();
      const res = await api.get(`${NOTIFICATIONS_URL}/${dbNotifications[0].id}`);
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 404 on an invalid id', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(`${NOTIFICATIONS_URL}/invalid_id`);
      assertNotFoundErrorRes(res);
    });

    it('should respond with 404 on a non-existent id', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(`${NOTIFICATIONS_URL}/${crypto.randomUUID()}`);
      assertNotFoundErrorRes(res);
    });

    it('should respond with 404 if the current user is not part of the notification receivers', async () => {
      const dbNotifications = await createNotifications();
      const dbNotification = dbNotifications[0];
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(`${NOTIFICATIONS_URL}/${dbNotification.id}`);
      assertNotFoundErrorRes(res);
    });

    it('should respond with a notification', async () => {
      const dbNotifications = await createNotifications();
      const dbNotification = dbNotifications[1];
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(`${NOTIFICATIONS_URL}/${dbNotification.id}`);
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      assertNotification(res.body as Types.PublicNotification, dbNotification);
    });
  });

  describe(`PATCH ${NOTIFICATIONS_URL}/seen`, () => {
    it('should respond with 401 on an unauthenticated request', async () => {
      const res = await api.get(`${NOTIFICATIONS_URL}/seen`);
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 204 and do nothing if the current user do not have any notifications', async () => {
      const dbNotifications = await db.notification.createManyAndReturn({
        data: [
          {
            header: `${dbUserOne.username} liked your post`,
            profileId: dbUserOne.profile!.id,
            profileName: dbUserOne.username,
            url: '/n1',
          },
        ],
      });

      await db.notificationsReceivers.createMany({
        data: [{ notificationId: dbNotifications[0].id, profileId: dbUserTwo.profile!.id }],
      });
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.patch(`${NOTIFICATIONS_URL}/seen`);
      const dbNotificationsReceivers = await db.notificationsReceivers.findMany({});
      expect(res.type).toBe('');
      expect(res.statusCode).toBe(204);
      expect(res.body).toStrictEqual({});
      expect(dbNotificationsReceivers).toHaveLength(1);
      expect(dbNotificationsReceivers[0].seenAt).toBeNull();
    });

    it('should respond with 204 and mark current user notifications as seen', async () => {
      const userOneProfileId = dbUserOne.profile!.id;
      await createNotifications();
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.patch(`${NOTIFICATIONS_URL}/seen`);
      const dbNotifications = await db.notification.findMany({ include: { receivers: true } });
      expect(res.type).toBe('');
      expect(res.statusCode).toBe(204);
      expect(res.body).toStrictEqual({});
      for (const { profileId, receivers } of dbNotifications) {
        if (profileId === userOneProfileId) {
          expect(receivers.every((r) => !r.seenAt)).toBe(true);
        } else {
          expect(receivers.find((r) => r.profileId === userOneProfileId)!.seenAt).toBeTruthy();
        }
      }
    });

    it('should respond with 204 and mark current user notifications as seen, only if it is not seen yet', async () => {
      const fixedSeenDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const userOneProfileId = dbUserOne.profile!.id;
      await createNotifications();
      await db.notificationsReceivers.updateMany({
        where: { profileId: userOneProfileId },
        data: { seenAt: fixedSeenDate },
      });
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.patch(`${NOTIFICATIONS_URL}/seen`);
      const dbNotificationsAfter = await db.notification.findMany({ include: { receivers: true } });
      expect(res.type).toBe('');
      expect(res.statusCode).toBe(204);
      expect(res.body).toStrictEqual({});
      for (const { profileId, receivers } of dbNotificationsAfter) {
        if (profileId === userOneProfileId) {
          expect(receivers.every((r) => !r.seenAt)).toBe(true);
        } else {
          expect(receivers.find((r) => r.profileId === userOneProfileId)!.seenAt).toStrictEqual(
            fixedSeenDate,
          );
        }
      }
    });
  });

  describe(`DELETE ${NOTIFICATIONS_URL}/:id`, () => {
    it('should respond with 401 on an unauthenticated request', async () => {
      const dbNotifications = await createNotifications();
      const res = await api.delete(`${NOTIFICATIONS_URL}/${dbNotifications[0].id}`);
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 204 on an invalid id', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.delete(`${NOTIFICATIONS_URL}/invalid_id`);
      expect(res.type).toMatch('');
      expect(res.statusCode).toBe(204);
      expect(res.body).toStrictEqual({});
    });

    it('should respond with 204 on a non-existent id', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.delete(`${NOTIFICATIONS_URL}/${crypto.randomUUID()}`);
      expect(res.type).toMatch('');
      expect(res.statusCode).toBe(204);
      expect(res.body).toStrictEqual({});
    });

    it('should respond with 204 if the current user is not part of the notification receivers', async () => {
      const dbNotifications = await createNotifications();
      const dbNotification = dbNotifications[0];
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.delete(`${NOTIFICATIONS_URL}/${dbNotification.id}`);
      expect(res.type).toMatch('');
      expect(res.statusCode).toBe(204);
      expect(res.body).toStrictEqual({});
    });

    it('should delete the current user from the list of notification receivers', async () => {
      const dbNotifications = await createNotifications();
      const dbNotification = dbNotifications[1];
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.delete(`${NOTIFICATIONS_URL}/${dbNotification.id}`);
      expect(res.type).toMatch('');
      expect(res.statusCode).toBe(204);
      expect(res.body).toStrictEqual({});
      expect(await db.notification.findUnique({ where: { id: dbNotification.id } })).toStrictEqual(
        dbNotification,
      );
      expect(
        await db.notification.findUnique({
          where: {
            id: dbNotification.id,
            receivers: { some: { profileId: dbUserOne.profile!.id } },
          },
        }),
      ).toBeNull();
      expect(
        await db.notificationsReceivers.findFirst({
          where: { profileId: dbUserOne.profile!.id, notificationId: dbNotification.id },
        }),
      ).toBeNull();
    });
  });
});

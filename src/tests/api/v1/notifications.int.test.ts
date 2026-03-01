import * as Types from '@/types';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { SIGNIN_URL, NOTIFICATIONS_URL } from './utils';
import setup from '../setup';
import db from '@/lib/db';

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
    const dbNotifications = await db.notification.createManyAndReturn({
      data: [
        {
          header: `${dbUserOne.username} liked your post`,
          profileId: dbUserOne.profile!.id,
          profileName: dbUserOne.username,
          url: '/n1',
        },
        {
          header: `${dbUserTwo.username} liked your post`,
          profileId: dbUserTwo.profile!.id,
          profileName: dbUserTwo.username,
          url: '/n2',
        },
        {
          header: `${dbXUser.username} added a new comment`,
          profileId: dbXUser.profile!.id,
          profileName: dbXUser.username,
          description: 'Good job!',
          url: '/n3',
        },
      ],
    });

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
      const resBody = res.body as Types.NotificationPayload[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toHaveLength(2);
      for (const { id, header, description, url, profile } of resBody) {
        expect(dbNotifications.map(({ id }) => id)).contain(id);
        expect(dbNotifications.map(({ url }) => url)).contain(url);
        expect(dbNotifications.map(({ header }) => header)).contain(header);
        expect(dbNotifications.map(({ description }) => description)).contain(description);
        expect(profile).toBeTruthy();
        expect(profile!.id).toBeTruthy();
        expect(profile!.user).toBeTruthy();
        expect(profile).toHaveProperty('followedByCurrentUser');
      }
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
      const resBody = res.body as Types.NotificationPayload;
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody.description).toBe(dbNotification.description);
      expect(resBody.header).toBe(dbNotification.header);
      expect(resBody.url).toBe(dbNotification.url);
      expect(resBody.id).toBe(dbNotification.id);
      expect(resBody.profile).toBeTruthy();
      expect(resBody.profile!.id).toBeTruthy();
      expect(resBody.profile!.user).toBeTruthy();
      expect(resBody.profile).toHaveProperty('followedByCurrentUser');
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

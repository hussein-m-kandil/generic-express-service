/* eslint-disable security/detect-object-injection */
import * as Types from '@/types';
import { BASE_URL, PROFILES_URL, SIGNIN_URL } from './utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { faker } from '@faker-js/faker';
import setup from '../setup';
import db from '@/lib/db';

const assertPublicProfile = (
  profile: Types.PublicProfile,
  props: Partial<{ tangible: boolean; visible: boolean; followedByCurrentUser: boolean }> = {},
) => {
  props.visible ??= true;
  props.tangible ??= true;
  props.followedByCurrentUser ??= false;
  expect(profile.followedByCurrentUser).toBe(props.followedByCurrentUser);
  expect(profile.tangible).toBe(props.tangible);
  expect(profile.visible).toBe(props.visible);
  expect(profile.userId).toBeTypeOf('string');
  expect(profile.id).toBeTypeOf('string');
  expect(profile.userId).toHaveLength(36);
  expect(profile.id).toHaveLength(36);
  expect(profile.user.id).toHaveLength(36);
  expect(profile.user.id).toBeTypeOf('string');
  if (profile.visible) {
    expect(new Date(profile.lastSeen).getTime()).toBeLessThanOrEqual(Date.now());
  } else {
    expect(profile.lastSeen).toBe(profile.user.createdAt);
  }
};

describe('Profile', async () => {
  const {
    userOneData,
    dbUserOne,
    dbUserTwo,
    dbXUser,
    dbAdmin,
    api,
    deleteAllUsers,
    prepForAuthorizedTest,
    assertNotFoundErrorRes,
    assertInvalidIdErrorRes,
    assertUnauthorizedErrorRes,
    assertResponseWithValidationError,
  } = await setup(SIGNIN_URL);

  const compareString = (a: string, b: string) => {
    for (let i = 0; i < a.length; i++) {
      const result = a.charCodeAt(i) - b.charCodeAt(i);
      if (result !== 0) return result;
    }
    return a.length - b.length;
  };

  const dbAllUsersSorted = [dbUserOne, dbUserTwo, dbXUser, dbAdmin].sort((a, b) =>
    compareString(a.username, b.username),
  );

  afterAll(async () => {
    await deleteAllUsers();
  });

  describe('endpoints', () => {
    describe('GET', () => {
      beforeAll(async () => {
        const dbUserOneProfileId = dbUserOne.profile!.id;
        const data = [
          { profileId: dbUserTwo.profile!.id, followerId: dbUserOneProfileId },
          { profileId: dbXUser.profile!.id, followerId: dbUserOneProfileId },
          { profileId: dbAdmin.profile!.id, followerId: dbUserOneProfileId },
          { profileId: dbUserOneProfileId, followerId: dbUserTwo.profile!.id },
          { profileId: dbUserOneProfileId, followerId: dbXUser.profile!.id },
          { profileId: dbUserOneProfileId, followerId: dbAdmin.profile!.id },
        ];
        await db.follows.createMany({ data });
      });

      afterAll(async () => {
        await db.follows.deleteMany({});
      });

      describe(PROFILES_URL, () => {
        it('should respond with 401 on an unauthenticated request', async () => {
          const res = await api.get(PROFILES_URL);
          assertUnauthorizedErrorRes(res);
        });

        it('should respond with profiles list in ascending order, on an authenticated request', async () => {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(PROFILES_URL);
          const profiles = res.body as Types.PublicProfile[];
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(profiles.length).toBe(dbAllUsersSorted.length);
          for (let i = 0; i < profiles.length; i++) {
            const followedByCurrentUser = profiles[i].id !== dbUserOne.profile!.id;
            assertPublicProfile(profiles[i], { followedByCurrentUser });
            expect(profiles[i].id).toBe(dbAllUsersSorted[i].profile!.id);
          }
        });

        it('should respond with profiles list in descending order, on an authenticated request', async () => {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(`${PROFILES_URL}?sort=desc`);
          const profiles = res.body as Types.PublicProfile[];
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(profiles.length).toBeGreaterThan(1);
          for (let i = 0; i < profiles.length; i++) {
            const followedByCurrentUser = profiles[i].id !== dbUserOne.profile!.id;
            assertPublicProfile(profiles[i], { followedByCurrentUser });
            expect(profiles[i].id).toBe(
              dbAllUsersSorted[dbAllUsersSorted.length - 1 - i].profile!.id,
            );
          }
        });

        it('should respond with a list of the last profile only, on an authenticated request', async () => {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(
            `${PROFILES_URL}?limit=1&cursor=${dbAllUsersSorted.at(-2)!.profile!.id}`,
          );
          const profiles = res.body as Types.PublicProfile[];
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(profiles.length).toBe(1);
          assertPublicProfile(profiles[0], { followedByCurrentUser: true });
          expect(profiles[0].id).toBe(dbAllUsersSorted.at(-1)!.profile!.id);
        });

        it('should respond with a list of profiles that matches the query name, on an authenticated request', async () => {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          for (const user of [dbUserTwo, dbXUser, dbAdmin]) {
            const res = await authorizedApi.get(
              `${PROFILES_URL}?name=${user.username.slice(0, -2)}`,
            );
            const profiles = res.body as Types.PublicProfile[];
            expect(res.statusCode).toBe(200);
            expect(res.type).toMatch(/json/);
            expect(profiles.length).toBe(1);
            assertPublicProfile(profiles[0], { followedByCurrentUser: true });
            expect(profiles[0].id).toBe(user.profile!.id);
          }
        });
      });

      const getProfileTestData = [
        { key: 'id', value: dbUserOne.profile!.id },
        { key: 'username', value: dbUserOne.username },
      ];
      for (const { key, value } of getProfileTestData) {
        describe(`${PROFILES_URL}/:${key}`, () => {
          it('should respond with 401 on an unauthenticated request', async () => {
            const res = await api.get(`${PROFILES_URL}/${value}`);
            assertUnauthorizedErrorRes(res);
          });

          it(`should respond with 404 on an invalid ${key}`, async () => {
            const { authorizedApi } = await prepForAuthorizedTest(userOneData);
            const res = await authorizedApi.get(`${PROFILES_URL}/invalid`);
            assertNotFoundErrorRes(res);
          });

          it('should respond with a profile', async () => {
            const { authorizedApi } = await prepForAuthorizedTest(userOneData);
            const res = await authorizedApi.get(`${PROFILES_URL}/${value}`);
            const profile = res.body as Types.PublicProfile;
            expect(res.statusCode).toBe(200);
            expect(res.type).toMatch(/json/);
            assertPublicProfile(profile);
          });
        });
      }

      describe(`${PROFILES_URL}/following`, () => {
        const sortedUsers = dbAllUsersSorted.filter((u) => u.id !== dbUserOne.id);

        it('should respond with 401 on an unauthenticated request', async () => {
          const res = await api.get(`${PROFILES_URL}/following`);
          assertUnauthorizedErrorRes(res);
        });

        it('should respond with following profiles list in ascending order, on an authenticated request', async () => {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(`${PROFILES_URL}/following`);
          const profiles = res.body as Types.PublicProfile[];
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(profiles.length).toBe(3);
          for (let i = 0; i < profiles.length; i++) {
            assertPublicProfile(profiles[i], { followedByCurrentUser: true });
            expect(profiles[i].id).toBe(sortedUsers[i].profile!.id);
          }
        });

        it('should respond with following profiles list in descending order, on an authenticated request', async () => {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(`${PROFILES_URL}/following?sort=desc`);
          const profiles = res.body as Types.PublicProfile[];
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(profiles.length).toBe(3);
          for (let i = 0; i < profiles.length; i++) {
            assertPublicProfile(profiles[i], { followedByCurrentUser: true });
            expect(profiles[i].id).toBe(sortedUsers[sortedUsers.length - 1 - i].profile!.id);
          }
        });

        it('should respond with a list of the last following profile only, on an authenticated request', async () => {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(
            `${PROFILES_URL}/following?limit=1&cursor=${sortedUsers.at(-2)!.profile!.id}`,
          );
          const profiles = res.body as Types.PublicProfile[];
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(profiles.length).toBe(1);
          assertPublicProfile(profiles[0], { followedByCurrentUser: true });
          expect(profiles[0].id).toBe(sortedUsers.at(-1)!.profile!.id);
        });

        it('should respond with a list of the following profiles that matches the name query, on an authenticated request', async () => {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          for (const user of [dbUserTwo, dbXUser, dbAdmin]) {
            const res = await authorizedApi.get(
              `${PROFILES_URL}/following?name=${user.username.slice(0, -2)}`,
            );
            const profiles = res.body as Types.PublicProfile[];
            expect(res.statusCode).toBe(200);
            expect(res.type).toMatch(/json/);
            expect(profiles.length).toBe(1);
            assertPublicProfile(profiles[0], { followedByCurrentUser: true });
            expect(profiles[0].id).toBe(user.profile!.id);
          }
        });
      });

      describe(`${PROFILES_URL}/followers`, () => {
        const sortedUsers = dbAllUsersSorted.filter((u) => u.id !== dbUserOne.id);

        it('should respond with 401 on an unauthenticated request', async () => {
          const res = await api.get(`${PROFILES_URL}/followers`);
          assertUnauthorizedErrorRes(res);
        });

        it('should respond with followers profiles list in ascending order, on an authenticated request', async () => {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(`${PROFILES_URL}/followers`);
          const profiles = res.body as Types.PublicProfile[];
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(profiles.length).toBe(3);
          for (let i = 0; i < profiles.length; i++) {
            assertPublicProfile(profiles[i], { followedByCurrentUser: true });
            expect(profiles[i].id).toBe(sortedUsers[i].profile!.id);
          }
        });

        it('should respond with followers profiles list in descending order, on an authenticated request', async () => {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(`${PROFILES_URL}/followers?sort=desc`);
          const profiles = res.body as Types.PublicProfile[];
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(profiles.length).toBe(3);
          for (let i = 0; i < profiles.length; i++) {
            assertPublicProfile(profiles[i], { followedByCurrentUser: true });
            expect(profiles[i].id).toBe(sortedUsers[sortedUsers.length - 1 - i].profile!.id);
          }
        });

        it('should respond with a list of the last followers profile only, on an authenticated request', async () => {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.get(
            `${PROFILES_URL}/followers?limit=1&cursor=${sortedUsers.at(-2)!.profile!.id}`,
          );
          const profiles = res.body as Types.PublicProfile[];
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(profiles.length).toBe(1);
          assertPublicProfile(profiles[0], { followedByCurrentUser: true });
          expect(profiles[0].id).toBe(sortedUsers.at(-1)!.profile!.id);
        });

        it('should respond with a list of the followers profiles that matches the name query, on an authenticated request', async () => {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          for (const user of [dbUserTwo, dbXUser, dbAdmin]) {
            const res = await authorizedApi.get(
              `${PROFILES_URL}/followers?name=${user.username.slice(0, -2)}`,
            );
            const profiles = res.body as Types.PublicProfile[];
            expect(res.statusCode).toBe(200);
            expect(res.type).toMatch(/json/);
            expect(profiles.length).toBe(1);
            assertPublicProfile(profiles[0], { followedByCurrentUser: true });
            expect(profiles[0].id).toBe(user.profile!.id);
          }
        });
      });
    });

    describe(`PATCH ${PROFILES_URL}`, () => {
      it('should respond with 401 on an unauthenticated request', async () => {
        const res = await api.patch(PROFILES_URL);
        assertUnauthorizedErrorRes(res);
      });

      it('should respond with 400 on an authenticated request with invalid data', async () => {
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.patch(PROFILES_URL).send({ tangible: '' });
        assertResponseWithValidationError(res, 'tangible');
      });

      it('should respond with 404 on an authenticated request, for non-existent profile', async () => {
        await db.profile.delete({ where: { userId: dbUserOne.id } });
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.patch(PROFILES_URL).send({});
        assertNotFoundErrorRes(res);
        dbUserOne.profile = await db.profile.create({
          data: { userId: dbUserOne.id, lastSeen: new Date() },
        });
      });

      it('should respond with a profile has updated tangibility, on an authenticated request', async () => {
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.patch(PROFILES_URL).send({ tangible: false });
        const profile = res.body as Types.PublicProfile;
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        assertPublicProfile(profile, { tangible: false, visible: true });
        await db.profile.update({ where: { userId: dbUserOne.id }, data: { tangible: true } });
      });

      it('should respond with a profile has updated visibility, on an authenticated request', async () => {
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.patch(PROFILES_URL).send({ visible: false });
        const profile = res.body as Types.PublicProfile;
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        assertPublicProfile(profile, { tangible: true, visible: false });
        await db.profile.update({ where: { userId: dbUserOne.id }, data: { visible: true } });
      });

      it('should respond with an unmodified profile, on an authenticated request', async () => {
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.patch(PROFILES_URL).send({});
        const profile = res.body as Types.PublicProfile;
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        assertPublicProfile(profile);
      });
    });

    describe(`POST ${PROFILES_URL}/following`, () => {
      it('should respond with 401 on an unauthenticated request', async () => {
        const res = await api.post(`${PROFILES_URL}/following/${crypto.randomUUID()}`);
        assertUnauthorizedErrorRes(res);
      });

      it('should respond with 400 on an authenticated request with invalid profile id', async () => {
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.post(`${PROFILES_URL}/following/123`);
        assertResponseWithValidationError(res, 'profileId');
      });

      it('should respond with 400 on an authenticated request, for non-existent profile id', async () => {
        const profileId = crypto.randomUUID();
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.post(`${PROFILES_URL}/following/${profileId}`);
        assertInvalidIdErrorRes(res);
      });

      it('should respond with 201 and empty body, and create new follow', async () => {
        const profileId = dbUserTwo.profile!.id;
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.post(`${PROFILES_URL}/following/${profileId}`);
        const follows = await db.follows.findMany({});
        expect(res.statusCode).toBe(201);
        expect(res.type).toMatch(/json/);
        expect(res.body).toBe('');
        expect(follows).toHaveLength(1);
        expect(follows[0].profileId).toBe(profileId);
        expect(follows[0].followerId).toBe(dbUserOne.profile!.id);
        await db.follows.deleteMany({});
      });

      it('should respond with 201 and empty body, and not create new follow if it exists', async () => {
        const profileId = dbUserTwo.profile!.id;
        await db.follows.create({ data: { profileId, followerId: dbUserOne.profile!.id } });
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.post(`${PROFILES_URL}/following/${profileId}`);
        const follows = await db.follows.findMany({});
        expect(res.statusCode).toBe(201);
        expect(res.type).toMatch(/json/);
        expect(res.body).toBe('');
        expect(follows).toHaveLength(1);
        expect(follows[0].profileId).toBe(profileId);
        expect(follows[0].followerId).toBe(dbUserOne.profile!.id);
        await db.follows.deleteMany({});
      });
    });

    describe(`DELETE ${PROFILES_URL}/following`, () => {
      it('should respond with 401 on an unauthenticated request', async () => {
        const res = await api.delete(`${PROFILES_URL}/following/${crypto.randomUUID()}`);
        assertUnauthorizedErrorRes(res);
      });

      it('should respond with 400 on an authenticated request with invalid profile id', async () => {
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.delete(`${PROFILES_URL}/following/not_id`);
        assertResponseWithValidationError(res, 'profileId');
      });

      it('should respond 404 if the following/profile not exists', async () => {
        const ids = [crypto.randomUUID(), dbUserTwo.profile!.id];
        for (const profileId of ids) {
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          const res = await authorizedApi.delete(`${PROFILES_URL}/following/${profileId}`);
          assertNotFoundErrorRes(res);
          expect(await db.follows.findMany({})).toHaveLength(0);
        }
      });

      it('should respond 204 after deleting an existent following', async () => {
        const profileId = dbUserTwo.profile!.id;
        await db.follows.create({ data: { profileId, followerId: dbUserOne.profile!.id } });
        const { authorizedApi } = await prepForAuthorizedTest(userOneData);
        const res = await authorizedApi.delete(`${PROFILES_URL}/following/${profileId}`);
        const follows = await db.follows.findMany({});
        expect(res.statusCode).toBe(204);
        expect(res.type).toBe('');
        expect(res.body).toStrictEqual({});
        expect(follows).toHaveLength(0);
      });
    });
  });

  describe('middlewares', () => {
    describe('lastSeenUpdater', () => {
      it('should not update the profile last-seen date on any unauthorized request', async () => {
        const methods = ['get', 'put', 'post', 'delete'] as const;
        const lastSeen = faker.date.past({ years: 10 });
        for (const m of methods) {
          await db.profile.update({ where: { userId: dbUserOne.id }, data: { lastSeen } });
          await api[m](BASE_URL);
          const dbProfile = await db.profile.findUnique({ where: { userId: dbUserOne.id } });
          expect(dbProfile!.lastSeen.getTime()).toBe(lastSeen.getTime());
        }
      });

      it('should update the profile last-seen date on any authorized request', async () => {
        const methods = ['get', 'put', 'post', 'delete'] as const;
        const lastSeen = faker.date.past({ years: 10 });
        for (const m of methods) {
          await db.profile.update({ where: { userId: dbUserOne.id }, data: { lastSeen } });
          const { authorizedApi } = await prepForAuthorizedTest(userOneData);
          await authorizedApi[m](BASE_URL);
          const dbProfile = await db.profile.findUnique({ where: { userId: dbUserOne.id } });
          expect(dbProfile!.lastSeen.getTime()).toBeGreaterThan(lastSeen.getTime());
        }
      });
    });
  });
});

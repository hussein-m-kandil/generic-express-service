import * as Types from '@/types';
import { afterAll, describe, expect, it } from 'vitest';
import { PROFILES_URL, SIGNIN_URL } from './utils';
import setup from '../setup';
import db from '@/lib/db';

const assertPublicProfile = (
  profile: Types.PublicProfile,
  props = { tangible: true, visible: true }
) => {
  expect(profile.tangible).toBe(props.tangible);
  expect(profile.visible).toBe(props.visible);
  expect(profile.userId).toBeTypeOf('string');
  expect(profile.id).toBeTypeOf('string');
  expect(profile.userId).toHaveLength(36);
  expect(profile.id).toHaveLength(36);
  expect(profile.user.id).toHaveLength(36);
  expect(profile.user.id).toBeTypeOf('string');
  expect(new Date(profile.lastSeen).getTime()).toBeLessThanOrEqual(Date.now());
};

describe('Profile endpoints', async () => {
  const {
    userOneData,
    dbUserOne,
    api,
    deleteAllUsers,
    prepForAuthorizedTest,
    assertNotFoundErrorRes,
    assertUnauthorizedErrorRes,
    assertResponseWithValidationError,
  } = await setup(SIGNIN_URL);

  const resetDB = async () => {
    await deleteAllUsers();
  };

  afterAll(resetDB);

  describe(`GET ${PROFILES_URL}`, () => {
    it('should respond with 401 on an unauthenticated request', async () => {
      const res = await api.get(PROFILES_URL);
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with profiles list, on an authenticated request', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(PROFILES_URL);
      const profiles = res.body as Types.PublicProfile[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(profiles.length).toBeGreaterThan(1);
      for (const p of profiles) {
        assertPublicProfile(p);
      }
    });
  });

  describe(`GET ${PROFILES_URL}/:id`, () => {
    it('should respond with 401 on an unauthenticated request', async () => {
      const res = await api.get(`${PROFILES_URL}/${dbUserOne.profile!.id}`);
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with a profile, on an authenticated request', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(`${PROFILES_URL}/${dbUserOne.profile!.id}`);
      const profile = res.body as Types.PublicProfile;
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      assertPublicProfile(profile);
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
      await db.profile.create({ data: { userId: dbUserOne.id, lastSeen: new Date() } });
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
});

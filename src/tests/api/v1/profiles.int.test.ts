import * as Types from '@/types';
import { afterAll, describe, expect, it } from 'vitest';
import { PROFILES_URL, SIGNIN_URL } from './utils';
import setup from '../setup';

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
    assertUnauthorizedErrorRes,
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
});

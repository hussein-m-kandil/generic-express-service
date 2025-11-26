import { it, expect, describe, afterAll, beforeAll, vi } from 'vitest';
import { SIGNIN_URL, VERIFY_URL, SIGNED_IN_USER_URL } from './utils';
import { AppErrorResponse, AuthResponse, PublicUser } from '@/types';
import { User } from '@/../prisma/client';
import jwt from 'jsonwebtoken';
import setup from '../setup';

describe('Authentication endpoint', async () => {
  const {
    api,
    userData,
    createUser,
    deleteAllUsers,
    prepForAuthorizedTest,
    assertUnauthorizedErrorRes,
  } = await setup(SIGNIN_URL);

  let dbUser: User;

  beforeAll(async () => {
    await deleteAllUsers();
    dbUser = await createUser(userData);
  });

  afterAll(deleteAllUsers);

  describe(`POST ${SIGNIN_URL}`, () => {
    it('should not sign in with wrong username', async () => {
      const res = await api
        .post(SIGNIN_URL)
        .send({ username: 'blah...', password: userData.password });
      const resBody = res.body as AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(400);
      expect(resBody.error).toBeTypeOf('object');
      expect(resBody.error.message).toMatch(/incorrect/i);
      expect(resBody.error.message).toMatch(/username/i);
      expect(resBody.error.message).toMatch(/password/i);
    });

    it('should not sign in with wrong password', async () => {
      const res = await api
        .post(SIGNIN_URL)
        .send({ username: userData.username, password: 'blah...' });
      const resBody = res.body as AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(400);
      expect(resBody.error).toBeTypeOf('object');
      expect(resBody.error.message).toMatch(/incorrect/i);
      expect(resBody.error.message).toMatch(/username/i);
      expect(resBody.error.message).toMatch(/password/i);
    });

    it('should sign in and response with JWT and user insensitive-info', async () => {
      const res = await api.post(SIGNIN_URL).send(userData);
      const resBody = res.body as AuthResponse;
      const resUser = resBody.user;
      const resJwtPayload = jwt.decode(resBody.token.replace(/^Bearer /, '')) as User;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(Object.keys(resUser)).not.toContain('password');
      expect(resUser.username).toBe(userData.username);
      expect(resUser.fullname).toBe(userData.fullname);
      expect(resUser.isAdmin).toStrictEqual(false);
      expect(resUser.profile).toBeTruthy();
      expect(resBody.token).toMatch(/^Bearer /i);
      expect(resJwtPayload.id).toStrictEqual(dbUser.id);
      expect(resJwtPayload.isAdmin).toStrictEqual(false);
      expect(resJwtPayload.username).toBeUndefined();
      expect(resJwtPayload.fullname).toBeUndefined();
      expect(resJwtPayload.password).toBeUndefined();
      expect(resJwtPayload.createdAt).toBeUndefined();
      expect(resJwtPayload.updatedAt).toBeUndefined();
    });
  });

  describe(`GET ${VERIFY_URL}`, () => {
    it('should verify a valid, fresh token and respond with `true`', async () => {
      const signinResBody = (await api.post(SIGNIN_URL).send(userData)).body as AuthResponse;
      const res = await api.get(VERIFY_URL).set('Authorization', signinResBody.token);
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe(true);
    });

    it('should not verify an invalid token and respond 401', async () => {
      const signinResBody = (await api.post(SIGNIN_URL).send(userData)).body as AuthResponse;
      const res = await api
        .get(VERIFY_URL)
        .set('Authorization', signinResBody.token.replace(/\../, '.x'));
      expect(res.statusCode).toBe(401);
    });

    it('should not verify an expired token and respond 401', async () => {
      const signinResBody = (await api.post(SIGNIN_URL).send(userData)).body as AuthResponse;
      vi.useFakeTimers();
      const now = new Date();
      const future = new Date(now.setFullYear(now.getFullYear() + 3));
      vi.setSystemTime(future);
      const res = await api.get(VERIFY_URL).set('Authorization', signinResBody.token);
      expect(res.statusCode).toBe(401);
    });
  });

  describe(`GET ${SIGNED_IN_USER_URL}`, () => {
    it('should respond with 401 if the user is not found', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      await deleteAllUsers();
      const res = await authorizedApi.get(SIGNED_IN_USER_URL);
      dbUser = await createUser(userData); // All tests expects this user to be exist
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 401 if the JWT is invalid', async () => {
      const res = await api.get(SIGNED_IN_USER_URL).set('Authorization', 'blah');
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with current signed in user data base on the JWT', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      const res = await authorizedApi.get(SIGNED_IN_USER_URL);
      const resBody = res.body as User & PublicUser;
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody.password).toBeUndefined();
      expect(resBody.id).toStrictEqual(dbUser.id);
      expect(resBody.isAdmin).toStrictEqual(false);
      expect(resBody.username).toBe(dbUser.username);
      expect(resBody.fullname).toBe(dbUser.fullname);
      expect(resBody.profile).toBeTruthy();
    });
  });
});

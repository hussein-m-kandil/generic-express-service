import { AppErrorResponse, AppJwtPayload, AuthResponse } from '../../../types';
import { it, expect, describe, afterAll, beforeAll, vi } from 'vitest';
import { User } from '../../../../prisma/generated/client';
import { SIGNIN_URL, VERIFY_URL } from './utils';
import jwt from 'jsonwebtoken';
import setup from '../setup';

describe('Authentication endpoint', async () => {
  const { api, userData, createUser, deleteAllUsers } = await setup(SIGNIN_URL);

  beforeAll(async () => {
    await deleteAllUsers();
    await createUser(userData);
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
      const resUser = resBody.user as User;
      const resJwtPayload = jwt.decode(
        resBody.token.replace(/^Bearer /, '')
      ) as AppJwtPayload;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(resUser.username).toBe(userData.username);
      expect(resUser.fullname).toBe(userData.fullname);
      expect(resUser.password).toBeUndefined();
      expect(resUser.isAdmin).toBeUndefined();
      expect(resBody.token).toMatch(/^Bearer /i);
      expect(resJwtPayload.id).toBeTypeOf('string');
      expect(resJwtPayload.username).toBe(userData.username);
      expect(resJwtPayload.fullname).toBe(userData.fullname);
      expect(resJwtPayload.password).toBeUndefined();
      expect(resJwtPayload.isAdmin).toBeUndefined();
    });
  });

  describe(`GET ${VERIFY_URL}`, () => {
    it('should verify a valid, fresh token and respond with `true`', async () => {
      const signinResBody = (await api.post(SIGNIN_URL).send(userData))
        .body as AuthResponse;
      const res = await api
        .get(VERIFY_URL)
        .set('Authorization', signinResBody.token);
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe(true);
    });

    it('should not verify an invalid token and respond 401', async () => {
      const signinResBody = (await api.post(SIGNIN_URL).send(userData))
        .body as AuthResponse;
      const res = await api
        .get(VERIFY_URL)
        .set('Authorization', signinResBody.token.replace(/\../, '.x'));
      expect(res.statusCode).toBe(401);
    });

    it('should not verify an expired token and respond 401', async () => {
      const signinResBody = (await api.post(SIGNIN_URL).send(userData))
        .body as AuthResponse;
      vi.useFakeTimers();
      const now = new Date();
      const future = new Date(now.setFullYear(now.getFullYear() + 3));
      vi.setSystemTime(future);
      const res = await api
        .get(VERIFY_URL)
        .set('Authorization', signinResBody.token);
      expect(res.statusCode).toBe(401);
    });
  });
});

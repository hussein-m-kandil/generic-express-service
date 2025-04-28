import { it, expect, describe, afterAll, beforeAll, vi } from 'vitest';
import { SALT } from '../../../lib/config';
import {
  AppErrorResponse,
  AppJwtPayload,
  NewDefaultUser,
  AuthResponse,
} from '../../../types';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../../../app';
import request from 'supertest';
import db from '../../../lib/db';
import { User } from '../../../../prisma/generated/client';

describe('Authentication endpoint', () => {
  const BASE_URL = '/api/v1/auth';
  const SIGNIN_URL = `${BASE_URL}/signin`;
  const VERIFY_URL = `${BASE_URL}/verify`;

  const userData: NewDefaultUser = {
    fullname: 'Clark Kent/Kal-El',
    username: 'superman',
    password: 'Ss@12312',
  };

  const signInData = {
    username: userData.username,
    password: userData.password,
  };

  const api = request(app);

  const deleteAllUsers = async () => {
    await db.user.deleteMany();
  };

  const createUser = async () => {
    await db.user.create({
      data: {
        ...userData,
        password: await bcrypt.hash(userData.password, SALT),
      },
    });
  };

  beforeAll(async () => {
    await deleteAllUsers();
    await createUser();
  });

  afterAll(deleteAllUsers);

  describe(`POST ${SIGNIN_URL}`, () => {
    it('should not sign in with wrong username', async () => {
      const res = await api
        .post(SIGNIN_URL)
        .send({ ...signInData, username: 'blah...' });
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
        .send({ ...signInData, password: 'blah...' });
      const resBody = res.body as AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(400);
      expect(resBody.error).toBeTypeOf('object');
      expect(resBody.error.message).toMatch(/incorrect/i);
      expect(resBody.error.message).toMatch(/username/i);
      expect(resBody.error.message).toMatch(/password/i);
    });

    it('should sign in and response with JWT and user insensitive-info', async () => {
      const res = await api.post(SIGNIN_URL).send(signInData);
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
      const signinResBody = (await api.post(SIGNIN_URL).send(signInData))
        .body as AuthResponse;
      const res = await api
        .get(VERIFY_URL)
        .set('Authorization', signinResBody.token);
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe(true);
    });

    it('should not verify an invalid token and respond 401', async () => {
      const signinResBody = (await api.post(SIGNIN_URL).send(signInData))
        .body as AuthResponse;
      const res = await api
        .get(VERIFY_URL)
        .set('Authorization', signinResBody.token.replace(/\../, '.x'));
      expect(res.statusCode).toBe(401);
    });

    it('should not verify an expired token and respond 401', async () => {
      const signinResBody = (await api.post(SIGNIN_URL).send(signInData))
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

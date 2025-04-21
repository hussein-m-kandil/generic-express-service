import { it, expect, describe, afterAll, beforeAll } from 'vitest';
import { SALT } from '../../../lib/config';
import {
  AppErrorResponse,
  AppJwtPayload,
  NewDefaultUser,
  SignInResponse,
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
      const resBody = res.body as SignInResponse;
      console.log(resBody);
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
    });
  });
});

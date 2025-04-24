import {
  AppJwtPayload,
  NewDefaultUser,
  NewUserInput,
  AuthResponse,
  AppErrorResponse,
} from '../../../types';
import { User } from '../../../../prisma/generated/client';
import {
  it,
  expect,
  describe,
  afterAll,
  beforeEach,
  TestFunction,
} from 'vitest';
import { ZodIssue } from 'zod';
import jwt from 'jsonwebtoken';
import app from '../../../app';
import db from '../../../lib/db';
import request, { Response } from 'supertest';

describe('Users endpoint', () => {
  const BASE_URL = '/api/v1/users';

  const userData: NewDefaultUser = {
    fullname: 'Clark Kent/Kal-El',
    username: 'superman',
    password: 'Ss@12312',
  };

  const newUserData: NewUserInput = { ...userData, confirm: userData.password };

  const api = request(app);

  const deleteAllUsers = async () => {
    await db.user.deleteMany();
  };

  beforeEach(deleteAllUsers);

  afterAll(deleteAllUsers);

  describe(`GET ${BASE_URL}`, () => {
    it('should return an empty list', async () => {
      const res = await api.get(BASE_URL);
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(expect.arrayContaining([]));
      expect(res.body).toHaveLength(0);
    });

    it('should return the correct user list', async () => {
      const dbUser = await db.user.create({ data: userData });
      const res = await api.get(BASE_URL);
      const users = res.body as User[];
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(users[0].username).toBe(userData.username);
      expect(users[0].fullname).toBe(userData.fullname);
      await db.user.delete({ where: { id: dbUser.id } });
    });
  });

  describe(`GET ${BASE_URL}/:id`, () => {
    it('should respond with 400 if given an invalid id', async () => {
      const res = await api.get(`${BASE_URL}/foo`);
      const resBody = res.body as AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(400);
      expect(resBody.error.message).toMatch(/id/i);
      expect(resBody.error.message).toMatch(/invalid/i);
    });

    it('should respond with 404 if user does not exit', async () => {
      const { id } = await db.user.create({ data: userData });
      await db.user.delete({ where: { id } });
      const res = await api.get(`${BASE_URL}/${id}`);
      const resBody = res.body as AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(404);
      expect(resBody.error.message).toMatch(/not found/i);
    });

    it('should respond with the found user', async () => {
      const dbUser = await db.user.create({ data: userData });
      const res = await api.get(`${BASE_URL}/${dbUser.id}`);
      const resUser = res.body as User;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(resUser.id).toBe(dbUser.id);
      expect(resUser.username).toBe(dbUser.username);
      expect(resUser.password).toBeUndefined();
      expect(resUser.isAdmin).toBeUndefined();
    });
  });

  describe(`POST ${BASE_URL}`, () => {
    const assertResponseWithValidationError = async (
      res: Response,
      issueField: string
    ) => {
      const issues = res.body as ZodIssue[];
      const dbUsers = await db.user.findMany();
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(400);
      expect(dbUsers).toHaveLength(0);
      expect(issues).toHaveLength(1);
      expect(issues[0].path).toContain(issueField);
    };

    for (const field of Object.keys(newUserData)) {
      it(`should not create a user without ${field}`, async () => {
        const res = await api
          .post(BASE_URL)
          .send({ ...newUserData, [field]: undefined });
        await assertResponseWithValidationError(res, field);
      });
    }

    it(`should not create a user with wrong password confirmation`, async () => {
      const res = await api
        .post(BASE_URL)
        .send({ ...userData, confirm: 'blah' });
      await assertResponseWithValidationError(res, 'confirm');
    });

    it('should not create a user if the username is already exist', async () => {
      const { id } = await db.user.create({ data: userData });
      const res = await api.post(BASE_URL).send(newUserData);
      const resBody = res.body as AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(400);
      expect(resBody.error.message).toMatch(/already exist/i);
      await db.user.delete({ where: { id } });
    });

    it('should not create an admin user', async () => {
      const res = await api
        .post(BASE_URL)
        .send({ ...newUserData, secret: 'not_admin' });
      await assertResponseWithValidationError(res, 'secret');
    });

    const createPostNewUserTest = (isAdmin: boolean): TestFunction => {
      return async () => {
        const res = await api.post(BASE_URL).send(
          isAdmin
            ? {
                ...newUserData,
                secret: process.env.ADMIN_SECRET, // Must be defined
              }
            : newUserData
        );
        const resBody = res.body as AuthResponse;
        // Pretend that the user is a `User` and tests should prove that it is a `PublicUser`
        const resUser = resBody.user as User;
        const dbUser = await db.user.findUniqueOrThrow({
          where: { id: resUser.id },
        });
        const resJwtPayload = jwt.decode(
          resBody.token.replace(/^Bearer /, '')
        ) as AppJwtPayload;
        expect(res.type).toMatch(/json/);
        expect(res.statusCode).toBe(201);
        expect(resUser.username).toBe(newUserData.username);
        expect(resUser.fullname).toBe(newUserData.fullname);
        expect(resUser.password).toBeUndefined();
        expect(resUser.isAdmin).toBeUndefined();
        expect(dbUser.password).toMatch(/^\$2[a|b|x|y]\$.{56}/);
        expect(dbUser.isAdmin).toBe(isAdmin);
        expect(resBody.token).toMatch(/^Bearer /i);
        expect(resJwtPayload.id).toBeTypeOf('string');
        expect(resJwtPayload.username).toBe(userData.username);
        expect(resJwtPayload.fullname).toBe(userData.fullname);
      };
    };

    it('should create a normal user (not admin)', createPostNewUserTest(false));

    it('should create an admin user', createPostNewUserTest(true));
  });
});

import { NewDefaultUser, NewUserInput } from '../../../types';
import {
  it,
  expect,
  describe,
  afterAll,
  beforeEach,
  TestFunction,
} from 'vitest';
import { User } from '../../../../prisma/generated/client';
import { ZodIssue } from 'zod';
import app from '../../../app';
import request, { Response } from 'supertest';
import db from '../../../lib/db';

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
        await db.user.deleteMany();
        const res = await api
          .post(BASE_URL)
          .send({ ...newUserData, [field]: undefined });
        await assertResponseWithValidationError(res, field);
      });
    }

    it(`should not create a user with wrong password confirmation`, async () => {
      await db.user.deleteMany();
      const res = await api
        .post(BASE_URL)
        .send({ ...userData, confirm: 'blah' });
      await assertResponseWithValidationError(res, 'confirm');
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
        const resUser = res.body as User;
        const dbUser = await db.user.findUniqueOrThrow({
          where: { id: resUser.id },
        });
        expect(res.type).toMatch(/json/);
        expect(res.statusCode).toBe(201);
        expect(resUser.username).toBe(newUserData.username);
        expect(resUser.fullname).toBe(newUserData.fullname);
        expect(resUser.password).toBeUndefined();
        expect(resUser.isAdmin).toBeUndefined();
        expect(dbUser.password).toMatch(/^\$2[a|b|x|y]\$.{56}/);
        expect(dbUser.isAdmin).toBe(isAdmin);
      };
    };

    it('should create a normal user (not admin)', createPostNewUserTest(false));

    it('should create an admin user', createPostNewUserTest(true));
  });
});

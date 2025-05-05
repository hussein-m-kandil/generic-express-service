import {
  AppJwtPayload,
  NewDefaultUser,
  NewUserInput,
  AuthResponse,
  AppErrorResponse,
} from '../../../types';
import { Prisma, User } from '../../../../prisma/generated/client';
import {
  it,
  expect,
  describe,
  afterAll,
  afterEach,
  beforeEach,
  TestFunction,
} from 'vitest';
import { ZodIssue } from 'zod';
import { ADMIN_SECRET, SALT } from '../../../lib/config';
import request, { Response } from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../app';
import db from '../../../lib/db';
import bcrypt from 'bcryptjs';

describe('Users endpoint', () => {
  const BASE_URL = '/api/v1';
  const USERS_ENDPOINT = `${BASE_URL}/users`;

  const userData: NewDefaultUser = {
    fullname: 'Clark Kent/Kal-El',
    username: 'superman',
    password: 'Ss@12312',
  };

  const newUserData: NewUserInput = { ...userData, confirm: userData.password };

  const adminData = {
    username: 'admin',
    fullname: 'Administrator',
    password: 'Aa@12312',
    isAdmin: true,
  };

  const api = request(app);

  const deleteAllUsers = async () => {
    await db.user.deleteMany();
  };

  const createUser = async (data: NewDefaultUser) => {
    const password = bcrypt.hashSync(data.password, SALT);
    return await db.user.create({ data: { ...data, password } });
  };

  const signin = async (username: string, password: string) => {
    const signinRes = await api
      .post(`${BASE_URL}/auth/signin`)
      .send({ username, password });
    return signinRes.body as AuthResponse;
  };

  const createAndSigninAdmin = async () => {
    await createUser(adminData);
    return await signin(adminData.username, adminData.password);
  };

  beforeEach(deleteAllUsers);

  afterAll(deleteAllUsers);

  describe(`POST ${USERS_ENDPOINT}`, () => {
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
          .post(USERS_ENDPOINT)
          .send({ ...newUserData, [field]: undefined });
        await assertResponseWithValidationError(res, field);
      });
    }

    it(`should not create a user with wrong password confirmation`, async () => {
      const res = await api
        .post(USERS_ENDPOINT)
        .send({ ...userData, confirm: 'blah' });
      await assertResponseWithValidationError(res, 'confirm');
    });

    it('should not create a user if the username is already exist', async () => {
      const { id } = await createUser(userData);
      const res = await api.post(USERS_ENDPOINT).send(newUserData);
      const resBody = res.body as AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(400);
      expect(resBody.error.message).toMatch(/already exist/i);
      await db.user.delete({ where: { id } });
    });

    it('should not create an admin user', async () => {
      const res = await api
        .post(USERS_ENDPOINT)
        .send({ ...newUserData, secret: 'not_admin' });
      await assertResponseWithValidationError(res, 'secret');
    });

    const createPostNewUserTest = (isAdmin: boolean): TestFunction => {
      return async () => {
        const res = await api.post(USERS_ENDPOINT).send(
          isAdmin
            ? {
                ...newUserData,
                secret: ADMIN_SECRET, // Must be defined
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

  describe(`GET ${USERS_ENDPOINT}`, () => {
    it('should respond with 401 on request without JWT', async () => {
      const res = await api.get(USERS_ENDPOINT);
      expect(res.statusCode).toBe(401);
      expect(res.body).toStrictEqual({});
    });

    it('should respond with 401 on request with non-admin JWT', async () => {
      await createUser(userData);
      const { token } = await signin(userData.username, userData.password);
      const res = await api.get(USERS_ENDPOINT).set('Authorization', token);
      expect(res.statusCode).toBe(401);
      expect(res.body).toStrictEqual({});
    });

    it('should respond with users list, on request with admin JWT', async () => {
      const { token } = await createAndSigninAdmin();
      const dbUser = await createUser(userData);
      const res = await api.get(USERS_ENDPOINT).set('Authorization', token);
      const users = res.body as User[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(res.body).toHaveLength(2);
      expect(users[1].username).toBe(userData.username);
      expect(users[1].fullname).toBe(userData.fullname);
      await db.user.delete({ where: { id: dbUser.id } });
    });
  });

  describe(`GET ${USERS_ENDPOINT}/:id`, () => {
    it('should respond with 401 on request without JWT', async () => {
      const dbUser = await createUser(userData);
      const res = await api.get(`${USERS_ENDPOINT}/${dbUser.id}`);
      expect(res.statusCode).toBe(401);
      expect(res.body).toStrictEqual({});
    });

    it('should respond with 401 on request with non-admin/owner JWT', async () => {
      const anotherUserData = {
        username: 'another_user',
        fullname: 'Another user',
        password: 'Aa@12312',
      };
      await createUser(anotherUserData);
      const { token } = await signin(
        anotherUserData.username,
        anotherUserData.password
      );
      const dbUser = await createUser(userData);
      const res = await api
        .get(`${USERS_ENDPOINT}/${dbUser.id}`)
        .set('Authorization', token);
      expect(res.statusCode).toBe(401);
      expect(res.body).toStrictEqual({});
    });

    it('should respond with 401, on request with owner JWT', async () => {
      await createUser(userData);
      const { token } = await signin(userData.username, userData.password);
      const res = await api
        .get(`${USERS_ENDPOINT}/foo`)
        .set('Authorization', token);
      expect(res.statusCode).toBe(401);
      expect(res.body).toStrictEqual({});
    });

    it('should respond with 400 if given an invalid id, on request with admin JWT', async () => {
      const { token } = await createAndSigninAdmin();
      const res = await api
        .get(`${USERS_ENDPOINT}/foo`)
        .set('Authorization', token);
      const resBody = res.body as AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(400);
      expect(resBody.error.message).toMatch(/id/i);
      expect(resBody.error.message).toMatch(/invalid/i);
    });

    it('should respond with 404 if user does not exit, on request with owner JWT', async () => {
      const dbUser = await createUser(userData);
      const { token } = await signin(userData.username, userData.password);
      await db.user.delete({ where: { id: dbUser.id } });
      const res = await api
        .get(`${USERS_ENDPOINT}/${dbUser.id}`)
        .set('Authorization', token);
      const resBody = res.body as AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(404);
      expect(resBody.error.message).toMatch(/not found/i);
    });

    it('should respond with 404 if user does not exit, on request with admin JWT', async () => {
      const dbUser = await createUser(userData);
      const { token } = await createAndSigninAdmin();
      await db.user.delete({ where: { id: dbUser.id } });
      const res = await api
        .get(`${USERS_ENDPOINT}/${dbUser.id}`)
        .set('Authorization', token);
      const resBody = res.body as AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(404);
      expect(resBody.error.message).toMatch(/not found/i);
    });

    it('should respond with the found user, on request with owner JWT', async () => {
      const dbUser = await createUser(userData);
      const { token } = await signin(userData.username, userData.password);
      const res = await api
        .get(`${USERS_ENDPOINT}/${dbUser.id}`)
        .set('Authorization', token);
      const resUser = res.body as User;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(resUser.id).toBe(dbUser.id);
      expect(resUser.username).toBe(dbUser.username);
      expect(resUser.password).toBeUndefined();
      expect(resUser.isAdmin).toBeUndefined();
    });

    it('should respond with the found user, on request with admin JWT', async () => {
      const { token } = await createAndSigninAdmin();
      const dbUser = await createUser(userData);
      const res = await api
        .get(`${USERS_ENDPOINT}/${dbUser.id}`)
        .set('Authorization', token);
      const resUser = res.body as User;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(resUser.id).toBe(dbUser.id);
      expect(resUser.username).toBe(dbUser.username);
      expect(resUser.password).toBeUndefined();
      expect(resUser.isAdmin).toBeUndefined();
    });
  });

  describe(`PATCH ${USERS_ENDPOINT}/:id`, () => {
    let longString = '';
    for (let i = 0; i < 1000; i++) longString += 'x';

    let dbUser: User;
    beforeEach(async () => {
      await createUser(adminData);
      dbUser = await createUser(userData);
    });

    afterEach(deleteAllUsers);

    const createTestForUpdateField = (
      data: Prisma.UserUpdateInput & { confirm?: string; secret?: string },
      credentials: { username: string; password: string }
    ) => {
      return async () => {
        const { token } = await signin(
          credentials.username,
          credentials.password
        );
        const res = await api
          .patch(`${USERS_ENDPOINT}/${dbUser.id}`)
          .set('Authorization', token)
          .send(data);
        const updatedDBUser = await db.user.findUnique({
          where: { id: dbUser.id },
        });
        expect(res.statusCode).toBe(204);
        expect(updatedDBUser).toBeTruthy();
        if (updatedDBUser) {
          const updatedFields = Object.keys(data);
          if (updatedFields.includes('username')) {
            expect(updatedDBUser.username).toBe(data.username);
          } else {
            expect(updatedDBUser.username).toBe(dbUser.username);
          }
          if (updatedFields.includes('fullname')) {
            expect(updatedDBUser.fullname).toBe(data.fullname);
          } else {
            expect(updatedDBUser.fullname).toBe(dbUser.fullname);
          }
          if (updatedFields.includes('password')) {
            expect(
              bcrypt.compareSync(
                data.password as string,
                updatedDBUser.password
              )
            ).toBe(true);
          } else {
            expect(updatedDBUser.password).toBe(dbUser.password);
          }
          if (updatedFields.includes('secret')) {
            expect(updatedDBUser.isAdmin).toBe(data.secret === ADMIN_SECRET);
          }
          expect(+updatedDBUser.createdAt).toBe(+dbUser.createdAt);
          expect(+updatedDBUser.updatedAt).toBeGreaterThan(+dbUser.updatedAt);
        }
      };
    };

    const createTestForNotUpdateInvalidField = (
      data: Prisma.UserUpdateInput & { confirm?: string; secret?: string },
      expectedErrMsgRegex: RegExp,
      credentials: { username: string; password: string }
    ) => {
      return async () => {
        const { token } = await signin(
          credentials.username,
          credentials.password
        );
        const res = await api
          .patch(`${USERS_ENDPOINT}/${dbUser.id}`)
          .set('Authorization', token)
          .send(data);
        const issues = res.body as ZodIssue[];
        expect(res.type).toMatch(/json/);
        expect(res.statusCode).toBe(400);
        expect(issues[0].message).toMatch(expectedErrMsgRegex);
      };
    };

    it('should respond with 401, on a request without JWT', async () => {
      const res = await api
        .patch(`${USERS_ENDPOINT}/${dbUser.id}`)
        .send({ username: 'foobar' });
      expect(res.statusCode).toBe(401);
      expect(res.body).toStrictEqual({});
    });

    it('should respond with 401, on a request with non-owner/admin JWT', async () => {
      const otherUserData = {
        username: 'other_user',
        fullname: 'Other User',
        password: 'Oo@12312',
      };
      await createUser(otherUserData);
      const { token } = await signin(
        otherUserData.username,
        otherUserData.password
      );
      const res = await api
        .patch(`${USERS_ENDPOINT}/${dbUser.id}`)
        .set('Authorization', token)
        .send({ username: 'foobar' });
      expect(res.statusCode).toBe(401);
      expect(res.body).toStrictEqual({});
    });

    it('should not change username if the given is already exists, on request with owner JWT', async () => {
      const username = 'foobar';
      await createUser({ ...userData, username });
      const { token } = await signin(userData.username, userData.password);
      const res = await api
        .patch(`${USERS_ENDPOINT}/${dbUser.id}`)
        .set('Authorization', token)
        .send({ username });
      const resBody = res.body as AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(400);
      expect(resBody.error.message).toMatch(/username/i);
      expect(resBody.error.message).toMatch(/already exist/i);
    });

    it(
      'should change username, on request with owner/admin JWT',
      createTestForUpdateField({ username: 'new_username' }, userData)
    );

    it(
      'should not change username if the given is too short, on request with owner/admin JWT',
      createTestForNotUpdateInvalidField(
        { username: 'x' },
        /username/i,
        userData
      )
    );

    it(
      'should not change username if the given is too long, on request with owner/admin JWT',
      createTestForNotUpdateInvalidField(
        { username: longString },
        /username/i,
        adminData
      )
    );

    it(
      'should change fullname, on request with owner/admin JWT',
      createTestForUpdateField({ fullname: 'new_fullname' }, adminData)
    );

    it(
      'should not change fullname if the given is too short, on request with owner/admin JWT',
      createTestForNotUpdateInvalidField(
        { fullname: 'x' },
        /fullname/i,
        userData
      )
    );

    it(
      'should not change fullname if the given is too long, on request with owner/admin JWT',
      createTestForNotUpdateInvalidField(
        { fullname: longString },
        /fullname/i,
        adminData
      )
    );

    it(
      'should change password, on request with owner/admin JWT',
      createTestForUpdateField(
        { password: 'aB@32121', confirm: 'aB@32121' },
        userData
      )
    );

    it(
      'should not change password if given a malformed one, on request with owner/admin JWT',
      createTestForNotUpdateInvalidField(
        { password: '12345678', confirm: '12345678' },
        /password/i,
        userData
      )
    );

    it(
      'should not change password if not given a the confirmation, on request with owner/admin JWT',
      createTestForNotUpdateInvalidField(
        { password: 'aB@32121' },
        /password confirmation/i,
        adminData
      )
    );

    it(
      'should not change password if given not matched confirmation, on request with owner/admin JWT',
      createTestForNotUpdateInvalidField(
        { password: 'aB@32121', confirm: '12345678' },
        /passwords does not match/i,
        userData
      )
    );

    it(
      'should change admin state, on request with owner/admin JWT',
      createTestForUpdateField({ secret: ADMIN_SECRET }, adminData)
    );

    it(
      'should not change admin state if given a wrong secret, on request with owner/admin JWT',
      createTestForNotUpdateInvalidField(
        { secret: 'not_admin' },
        /secret/i,
        adminData
      )
    );
  });

  describe(`DELETE ${USERS_ENDPOINT}/:id`, () => {
    it('should respond with 401 on request without JWT', async () => {
      const dbUser = await createUser(userData);
      const res = await api.delete(`${USERS_ENDPOINT}/${dbUser.id}`);
      expect(res.statusCode).toBe(401);
      expect(res.body).toStrictEqual({});
    });

    it('should respond with 401 on request with non-owner/admin JWT', async () => {
      await createUser(userData);
      const { token } = await signin(userData.username, userData.password);
      const userDataToDel = {
        username: 'to_delete',
        fullname: 'To Delete',
        password: 'Dd@12312',
      };
      const dbUser = await createUser(userDataToDel);
      const res = await api
        .delete(`${USERS_ENDPOINT}/${dbUser.id}`)
        .set('Authorization', token);
      expect(res.statusCode).toBe(401);
      expect(res.body).toStrictEqual({});
    });

    it('should respond with 204 if found a user and deleted it, on request with owner JWT', async () => {
      const dbUser = await createUser(userData);
      const { token } = await signin(userData.username, userData.password);
      const res = await api
        .delete(`${USERS_ENDPOINT}/${dbUser.id}`)
        .set('Authorization', token);
      expect(res.statusCode).toBe(204);
    });

    it('should respond with 204 if found a user and deleted it, on request with admin JWT', async () => {
      const dbUser = await createUser(userData);
      const { token } = await createAndSigninAdmin();
      const res = await api
        .delete(`${USERS_ENDPOINT}/${dbUser.id}`)
        .set('Authorization', token);
      expect(res.statusCode).toBe(204);
    });

    it('should respond with 204 if not found a user, on request with owner JWT', async () => {
      const dbUser = await createUser(userData);
      const { token } = await signin(userData.username, userData.password);
      await db.user.delete({ where: { id: dbUser.id } });
      const res = await api
        .delete(`${USERS_ENDPOINT}/${dbUser.id}`)
        .set('Authorization', token);
      expect(res.statusCode).toBe(204);
    });

    it('should respond with 204 if not found a user, on request with admin JWT', async () => {
      const dbUser = await createUser(userData);
      await db.user.delete({ where: { id: dbUser.id } });
      const { token } = await createAndSigninAdmin();
      const res = await api
        .delete(`${USERS_ENDPOINT}/${dbUser.id}`)
        .set('Authorization', token);
      expect(res.statusCode).toBe(204);
    });

    it('should respond with 401 if the id is invalid', async () => {
      await createUser(userData);
      const { token } = await signin(userData.username, userData.password);
      const res = await api
        .delete(`${USERS_ENDPOINT}/foo`)
        .set('Authorization', token);
      expect(res.statusCode).toBe(401);
      expect(res.body).toStrictEqual({});
    });
  });
});

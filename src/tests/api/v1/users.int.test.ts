import { it, expect, describe, afterAll, afterEach, beforeEach, TestFunction } from 'vitest';
import { AppErrorResponse, AuthResponse, PublicUser } from '@/types';
import { Image, Prisma, Profile, User } from '@/../prisma/client';
import { SIGNIN_URL, USERS_URL, ADMIN_SECRET } from './utils';
import { z } from 'zod';
import db from '@/lib/db';
import setup from '../setup';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

describe('User endpoints', async () => {
  const {
    newUserData,
    xUserData,
    adminData,
    userData,
    imgData,
    api,
    createUser,
    createImage,
    deleteAllUsers,
    deleteAllPosts,
    prepForAuthorizedTest,
    assertNotFoundErrorRes,
    assertUnauthorizedErrorRes,
    assertResponseWithValidationError,
  } = await setup(SIGNIN_URL);

  const resetDB = async () => {
    await deleteAllPosts();
    await deleteAllUsers();
  };

  beforeEach(resetDB);
  afterAll(resetDB);

  describe(`POST ${USERS_URL}`, () => {
    for (const field of Object.keys(newUserData).filter((k) => k !== 'bio')) {
      it(`should not create a user without ${field}`, async () => {
        const res = await api.post(USERS_URL).send({ ...newUserData, [field]: undefined });
        assertResponseWithValidationError(res, field);
        expect(await db.user.findMany()).toHaveLength(0);
      });
    }

    it(`should not create a user with wrong password confirmation`, async () => {
      const res = await api.post(USERS_URL).send({ ...userData, confirm: 'blah' });
      assertResponseWithValidationError(res, 'confirm');
      expect(await db.user.findMany()).toHaveLength(0);
    });

    const invalidUsernames = ['user-x', 'user x', 'user@x', 'user(x)'];
    for (const username of invalidUsernames) {
      it(`should not create a user while the username having a space`, async () => {
        const res = await api.post(USERS_URL).send({ ...newUserData, username });
        assertResponseWithValidationError(res, 'username');
        expect(await db.user.findMany()).toHaveLength(0);
      });
    }

    it('should not create a user if the username is already exist', async () => {
      const { id } = await createUser(userData);
      const res = await api.post(USERS_URL).send(newUserData);
      const resBody = res.body as AppErrorResponse;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(400);
      expect(resBody.error.message).toMatch(/already exist/i);
      await db.user.delete({ where: { id } });
    });

    it('should not create an admin user', async () => {
      const res = await api.post(USERS_URL).send({ ...newUserData, secret: 'not_admin' });
      assertResponseWithValidationError(res, 'secret');
      expect(await db.user.findMany()).toHaveLength(0);
    });

    const createPostNewUserTest = (isAdmin: boolean): TestFunction => {
      return async () => {
        const res = await api.post(USERS_URL).send({
          ...newUserData,
          ...(isAdmin ? { secret: ADMIN_SECRET } : {}),
        });
        const resBody = res.body as AuthResponse;
        // Pretend that the user is a `User` and tests should prove that it is a `PublicUser`
        const resUser = resBody.user;
        const dbUser = await db.user.findUniqueOrThrow({
          where: { id: resUser.id },
          omit: { password: false },
        });
        const resJwtPayload = jwt.decode(resBody.token.replace(/^Bearer /, '')) as User;
        expect(res.type).toMatch(/json/);
        expect(res.statusCode).toBe(201);
        expect(resUser.avatar).toBeDefined();
        expect(resUser.isAdmin).toStrictEqual(isAdmin);
        expect(resUser.username).toBe(newUserData.username);
        expect(resUser.fullname).toBe(newUserData.fullname);
        expect(resUser.profile!.id).toBeTypeOf('string');
        expect(resBody.token).toMatch(/^Bearer /i);
        expect(resJwtPayload.isAdmin).toStrictEqual(isAdmin);
        expect(resJwtPayload.id).toStrictEqual(dbUser.id);
        expect(resJwtPayload.createdAt).toBeUndefined();
        expect(resJwtPayload.updatedAt).toBeUndefined();
        expect(resJwtPayload.username).toBeUndefined();
        expect(resJwtPayload.fullname).toBeUndefined();
        expect(Object.keys(resUser)).not.toContain('password');
        expect(dbUser.password).toMatch(/^\$2[a|b|x|y]\$.{56}/);
        expect(dbUser.isAdmin).toBe(isAdmin);
        expect(dbUser.bio).toBe(newUserData.bio);
        expect(resUser.bio).toBe(newUserData.bio);
      };
    };

    it('should create a normal user (not admin)', createPostNewUserTest(false));

    it('should create an admin user', createPostNewUserTest(true));
  });

  describe(`POST ${USERS_URL}/guest`, () => {
    it('should create a random user and sign it in', async () => {
      const res = await api.post(`${USERS_URL}/guest`);
      const resBody = res.body as AuthResponse;
      const resUser = resBody.user;
      const dbUser = (await db.user.findMany({ omit: { password: false } })).at(-1) as User;
      const resJwtPayload = jwt.decode(resBody.token.replace(/^Bearer /, '')) as User;
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(201);
      expect(resUser.avatar).toBeDefined();
      expect(resBody.token).toMatch(/^Bearer /i);
      expect(resUser.isAdmin).toStrictEqual(false);
      expect(resJwtPayload.fullname).toBeUndefined();
      expect(resJwtPayload.username).toBeUndefined();
      expect(resJwtPayload.createdAt).toBeUndefined();
      expect(resJwtPayload.updatedAt).toBeUndefined();
      expect(resJwtPayload.id).toStrictEqual(dbUser.id);
      expect(resJwtPayload.isAdmin).toStrictEqual(false);
      expect(Object.keys(resUser)).not.toContain('password');
      expect(dbUser.password).toMatch(/^\$2[a|b|x|y]\$.{56}/);
      expect(resUser.profile!.id).toBeTypeOf('string');
      expect(resUser.bio).toBe(resUser.bio);
      expect(dbUser.bio).toBe(resUser.bio);
      expect(dbUser.isAdmin).toBe(false);
    });
  });

  describe(`GET ${USERS_URL}`, () => {
    it('should respond with 401 on request without JWT', async () => {
      const res = await api.get(USERS_URL);
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 401 on request with non-admin JWT', async () => {
      await createUser(userData);
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      const res = await authorizedApi.get(USERS_URL);
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with users list, on request with admin JWT', async () => {
      await createUser(adminData);
      const dbUser = await createUser(userData);
      const { authorizedApi } = await prepForAuthorizedTest(adminData);
      const res = await authorizedApi.get(USERS_URL);
      const users = res.body as PublicUser[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(res.body).toHaveLength(2);
      expect(users[1].avatar).toBeDefined();
      expect(users[1].username).toBe(userData.username);
      expect(users[1].fullname).toBe(userData.fullname);
      for (const { profile } of users) expect(profile!.id).toBeTypeOf('string');
      await db.user.delete({ where: { id: dbUser.id } });
    });
  });

  describe(`GET ${USERS_URL}/:idOrUsername`, () => {
    it('should respond with 404 on request with id, if user does not exit', async () => {
      await createUser(adminData);
      const dbUser = await createUser(userData);
      await db.user.delete({ where: { id: dbUser.id } });
      const res = await api.get(`${USERS_URL}/${dbUser.id}`);
      assertNotFoundErrorRes(res);
    });

    it('should respond with 404 on request with username, if user does not exit', async () => {
      await createUser(adminData);
      const res = await api.get(`${USERS_URL}/not_user`);
      assertNotFoundErrorRes(res);
    });

    it('should find a user by id/username', async () => {
      const dbUser = await createUser(userData);
      for (const param of [dbUser.id, dbUser.username]) {
        const res = await api.get(`${USERS_URL}/${param}`);
        const resUser = res.body as PublicUser;
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(resUser.id).toBe(dbUser.id);
        expect(resUser.avatar).toBeDefined();
        expect(resUser.isAdmin).toStrictEqual(false);
        expect(resUser.username).toBe(dbUser.username);
        expect(resUser.fullname).toBe(dbUser.fullname);
        expect(resUser.profile!.id).toBeTypeOf('string');
        expect(Object.keys(resUser)).not.toContain('password');
      }
    });

    it('should respond with the found user on owner request with id or username', async () => {
      const dbUser = await createUser(userData);
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      for (const param of [dbUser.id, dbUser.username]) {
        const res = await authorizedApi.get(`${USERS_URL}/${param}`);
        const resUser = res.body as PublicUser;
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(resUser.id).toBe(dbUser.id);
        expect(resUser.avatar).toBeDefined();
        expect(resUser.isAdmin).toStrictEqual(false);
        expect(resUser.username).toBe(dbUser.username);
        expect(resUser.fullname).toBe(dbUser.fullname);
        expect(resUser.profile!.id).toBeTypeOf('string');
        expect(Object.keys(resUser)).not.toContain('password');
      }
    });
  });

  describe(`PATCH ${USERS_URL}/:id`, () => {
    let longString = '';
    for (let i = 0; i < 1000; i++) longString += 'x';

    let dbXImg: Omit<Image, 'storageId' | 'storageFullPath'>;
    let dbUser: User;

    const getAllFields = () => {
      return Object.entries({
        ...xUserData,
        bio: 'Test bio',
        avatarId: dbXImg.id,
      }).map((k, v) => ({ k: v }));
    };

    beforeEach(async () => {
      await createUser(adminData);
      dbUser = await createUser(userData);
      const dbXUser = await createUser(xUserData);
      await createImage({
        ...imgData,
        ownerId: dbUser.id,
        avatars: { create: { userId: dbUser.id } },
      });
      dbXImg = await createImage({ ...imgData, ownerId: dbXUser.id });
    });

    afterEach(deleteAllUsers);

    const createTestForUpdateField = (
      data: Prisma.UserUpdateInput & {
        confirm?: string;
        secret?: string;
        avatarId?: string;
      },
      credentials: { username: string; password: string }
    ) => {
      return async () => {
        const {
          authorizedApi,
          signedInUserData: { token },
        } = await prepForAuthorizedTest(credentials);
        const res = await authorizedApi
          .patch(`${USERS_URL}/${dbUser.id}`)
          .send({ ...data, avatarId: dbXImg.id });
        const updatedDBUser = (await db.user.findUnique({
          where: { id: dbUser.id },
          omit: { password: false },
          include: { avatar: { select: { image: true } }, profile: true },
        })) as User & { avatar: { image: Image } | null } & { profile: Profile | null };
        expect(res.statusCode).toBe(200);
        expect(JSON.stringify((res.body as AuthResponse).user)).toBe(
          JSON.stringify({
            ...updatedDBUser,
            password: undefined,
          })
        );
        expect((res.body as AuthResponse).token).toBe(token);
        expect((res.body as AuthResponse).user.avatar?.image.id).toBe(dbXImg.id);
        expect(updatedDBUser.avatar?.image.id).toBe(dbXImg.id);
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
          expect(bcrypt.compareSync(data.password as string, updatedDBUser.password)).toBe(true);
        } else {
          expect(updatedDBUser.password).toBe(dbUser.password);
        }
        if (updatedFields.includes('secret')) {
          expect(updatedDBUser.isAdmin).toBe(data.secret === ADMIN_SECRET);
        }
        expect(+updatedDBUser.createdAt).toBe(+dbUser.createdAt);
        expect(+updatedDBUser.updatedAt).toBeGreaterThan(+dbUser.updatedAt);
      };
    };

    const createTestForNotUpdateInvalidField = (
      data: Prisma.UserUpdateInput & { confirm?: string; secret?: string },
      expectedErrMsgRegex: RegExp,
      credentials: { username: string; password: string }
    ) => {
      return async () => {
        const { authorizedApi } = await prepForAuthorizedTest(credentials);
        const res = await authorizedApi.patch(`${USERS_URL}/${dbUser.id}`).send(data);
        const issues = res.body as z.ZodIssue[];
        expect(res.type).toMatch(/json/);
        expect(res.statusCode).toBe(400);
        expect(issues[0].message).toMatch(expectedErrMsgRegex);
      };
    };

    it('should respond with 401, on a request without JWT', async () => {
      for (const field of getAllFields()) {
        const res = await api.patch(`${USERS_URL}/${dbUser.id}`).send(field);
        assertUnauthorizedErrorRes(res);
      }
    });

    it('should respond with 401, on a request with non-owner/admin JWT', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(xUserData);
      for (const field of getAllFields()) {
        const res = await authorizedApi.patch(`${USERS_URL}/${dbUser.id}`).send(field);
        assertUnauthorizedErrorRes(res);
      }
    });

    it('should not change username if the given is already exists, on request with owner JWT', async () => {
      const username = 'foobar';
      await createUser({ ...userData, username });
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      const res = await authorizedApi.patch(`${USERS_URL}/${dbUser.id}`).send({ username });
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
      createTestForNotUpdateInvalidField({ username: 'x' }, /username/i, userData)
    );

    it(
      'should not change username if the given is too long, on request with owner/admin JWT',
      createTestForNotUpdateInvalidField({ username: longString }, /username/i, adminData)
    );

    it(
      'should change fullname, on request with owner/admin JWT',
      createTestForUpdateField({ fullname: 'new_fullname' }, adminData)
    );

    it(
      'should not change fullname if the given is too short, on request with owner/admin JWT',
      createTestForNotUpdateInvalidField({ fullname: 'x' }, /fullname/i, userData)
    );

    it(
      'should not change fullname if the given is too long, on request with owner/admin JWT',
      createTestForNotUpdateInvalidField({ fullname: longString }, /fullname/i, adminData)
    );

    it(
      'should change password, on request with owner/admin JWT',
      createTestForUpdateField({ password: 'aB@32121', confirm: 'aB@32121' }, userData)
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
      createTestForNotUpdateInvalidField({ secret: 'not_admin' }, /secret/i, adminData)
    );

    it(
      'should change bio, on request with owner JWT',
      createTestForUpdateField({ bio: 'Test bio' }, userData)
    );
  });

  describe(`DELETE ${USERS_URL}/:id`, () => {
    it('should respond with 401 on request without JWT', async () => {
      const dbUser = await createUser(userData);
      const res = await api.delete(`${USERS_URL}/${dbUser.id}`);
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 401 on request with non-owner/admin JWT', async () => {
      await createUser(userData);
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      const dbUser = await createUser(xUserData);
      const res = await authorizedApi.delete(`${USERS_URL}/${dbUser.id}`);
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 204 if found a user and deleted it, on request with owner JWT', async () => {
      const dbUser = await createUser(userData);
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      const res = await authorizedApi.delete(`${USERS_URL}/${dbUser.id}`);
      expect(res.statusCode).toBe(204);
      expect(await db.user.findUnique({ where: { id: dbUser.id } })).toBeNull();
      expect(await db.profile.findUnique({ where: { id: dbUser.profile!.id } })).toBeNull();
    });

    it('should respond with 204 if found a user and deleted it, on request with admin JWT', async () => {
      await createUser(adminData);
      const dbUser = await createUser(userData);
      const { authorizedApi } = await prepForAuthorizedTest(adminData);
      const res = await authorizedApi.delete(`${USERS_URL}/${dbUser.id}`);
      expect(res.statusCode).toBe(204);
      expect(await db.user.findUnique({ where: { id: dbUser.id } })).toBeNull();
      expect(await db.profile.findUnique({ where: { id: dbUser.profile!.id } })).toBeNull();
    });

    it('should respond with 401 if not found a user, on request with owner JWT', async () => {
      const dbUser = await createUser(userData);
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      await db.user.delete({ where: { id: dbUser.id } });
      const res = await authorizedApi.delete(`${USERS_URL}/${dbUser.id}`);
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 404 if not found a user, on request with admin JWT', async () => {
      await createUser(adminData);
      const dbUser = await createUser(userData);
      await db.user.delete({ where: { id: dbUser.id } });
      const { authorizedApi } = await prepForAuthorizedTest(adminData);
      const res = await authorizedApi.delete(`${USERS_URL}/${dbUser.id}`);
      assertNotFoundErrorRes(res);
    });

    it('should respond with 401 if the id is invalid', async () => {
      await createUser(userData);
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      const res = await authorizedApi.delete(`${USERS_URL}/foo`);
      assertUnauthorizedErrorRes(res);
    });
  });
});

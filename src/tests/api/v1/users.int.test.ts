import { AppErrorResponse, AuthResponse, PostFullData } from '../../../types';
import {
  it,
  expect,
  describe,
  afterAll,
  afterEach,
  beforeEach,
  TestFunction,
} from 'vitest';
import {
  Comment,
  Prisma,
  User,
  VoteOnPost,
} from '../../../../prisma/generated/client';
import { SIGNIN_URL, USERS_URL, ADMIN_SECRET } from './utils';
import { ZodIssue } from 'zod';
import setup from '../setup';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../../../lib/db';

describe('Users endpoint', async () => {
  const {
    postDataOutput,
    newUserData,
    xUserData,
    adminData,
    userData,
    api,
    createUser,
    createPost,
    deleteAllUsers,
    deleteAllPosts,
    assertPostData,
    prepForAuthorizedTest,
    assertNotFoundErrorRes,
    assertInvalidIdErrorRes,
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
        const res = await api
          .post(USERS_URL)
          .send({ ...newUserData, [field]: undefined });
        assertResponseWithValidationError(res, field);
        expect(await db.user.findMany()).toHaveLength(0);
      });
    }

    it(`should not create a user with wrong password confirmation`, async () => {
      const res = await api
        .post(USERS_URL)
        .send({ ...userData, confirm: 'blah' });
      assertResponseWithValidationError(res, 'confirm');
      expect(await db.user.findMany()).toHaveLength(0);
    });

    const invalidUsernames = ['user-x', 'user x', 'user@x', 'user(x)'];
    for (const username of invalidUsernames) {
      it(`should not create a user while the username having a space`, async () => {
        const res = await api
          .post(USERS_URL)
          .send({ ...newUserData, username });
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
      const res = await api
        .post(USERS_URL)
        .send({ ...newUserData, secret: 'not_admin' });
      assertResponseWithValidationError(res, 'secret');
      expect(await db.user.findMany()).toHaveLength(0);
    });

    const createPostNewUserTest = (isAdmin: boolean): TestFunction => {
      return async () => {
        const res = await api.post(USERS_URL).send(
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
          omit: { password: false },
        });
        const resJwtPayload = jwt.decode(
          resBody.token.replace(/^Bearer /, '')
        ) as User;
        expect(res.type).toMatch(/json/);
        expect(res.statusCode).toBe(201);
        expect(resUser.password).toBeUndefined();
        expect(resUser.isAdmin).toStrictEqual(isAdmin);
        expect(resUser.username).toBe(newUserData.username);
        expect(resUser.fullname).toBe(newUserData.fullname);
        expect(resBody.token).toMatch(/^Bearer /i);
        expect(resJwtPayload.isAdmin).toStrictEqual(isAdmin);
        expect(resJwtPayload.id).toStrictEqual(dbUser.id);
        expect(resJwtPayload.createdAt).toBeUndefined();
        expect(resJwtPayload.updatedAt).toBeUndefined();
        expect(resJwtPayload.username).toBeUndefined();
        expect(resJwtPayload.fullname).toBeUndefined();
        expect(dbUser.password).toMatch(/^\$2[a|b|x|y]\$.{56}/);
        expect(dbUser.isAdmin).toBe(isAdmin);
        expect(dbUser.bio).toBe(newUserData.bio);
        expect(resUser.bio).toBe(newUserData.bio);
      };
    };

    it('should create a normal user (not admin)', createPostNewUserTest(false));

    it('should create an admin user', createPostNewUserTest(true));
  });

  describe(`GET ${USERS_URL}`, () => {
    it('should respond with users list, on request with admin JWT', async () => {
      await createUser(adminData);
      const dbUser = await createUser(userData);
      const { authorizedApi } = await prepForAuthorizedTest(adminData);
      const res = await authorizedApi.get(USERS_URL);
      const users = res.body as User[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(res.body).toHaveLength(2);
      expect(users[1].username).toBe(userData.username);
      expect(users[1].fullname).toBe(userData.fullname);
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

    it('should respond with the found user on request with id or username', async () => {
      await createUser(adminData);
      const dbUser = await createUser(userData);
      for (const param of [dbUser.id, dbUser.username]) {
        const res = await api.get(`${USERS_URL}/${param}`);
        const resUser = res.body as User;
        expect(res.type).toMatch(/json/);
        expect(res.statusCode).toBe(200);
        expect(resUser.id).toBe(dbUser.id);
        expect(resUser.isAdmin).toStrictEqual(false);
        expect(resUser.username).toBe(dbUser.username);
        expect(resUser.fullname).toBe(dbUser.fullname);
        expect(resUser.password).toBeUndefined();
      }
    });
  });

  describe(`PATCH ${USERS_URL}/:id`, () => {
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
        const { authorizedApi } = await prepForAuthorizedTest(credentials);
        const res = await authorizedApi
          .patch(`${USERS_URL}/${dbUser.id}`)
          .send(data);
        const updatedDBUser = await db.user.findUnique({
          where: { id: dbUser.id },
          omit: { password: false },
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
        const { authorizedApi } = await prepForAuthorizedTest(credentials);
        const res = await authorizedApi
          .patch(`${USERS_URL}/${dbUser.id}`)
          .send(data);
        const issues = res.body as ZodIssue[];
        expect(res.type).toMatch(/json/);
        expect(res.statusCode).toBe(400);
        expect(issues[0].message).toMatch(expectedErrMsgRegex);
      };
    };

    it('should respond with 401, on a request without JWT', async () => {
      const res = await api
        .patch(`${USERS_URL}/${dbUser.id}`)
        .send({ username: 'foobar' });
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 401, on a request with non-owner/admin JWT', async () => {
      await createUser(xUserData);
      const { authorizedApi } = await prepForAuthorizedTest(xUserData);
      const res = await authorizedApi
        .patch(`${USERS_URL}/${dbUser.id}`)
        .send({ username: 'foobar' });
      assertUnauthorizedErrorRes(res);
    });

    it('should not change username if the given is already exists, on request with owner JWT', async () => {
      const username = 'foobar';
      await createUser({ ...userData, username });
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      const res = await authorizedApi
        .patch(`${USERS_URL}/${dbUser.id}`)
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
    });

    it('should respond with 204 if found a user and deleted it, on request with admin JWT', async () => {
      await createUser(adminData);
      const dbUser = await createUser(userData);
      const { authorizedApi } = await prepForAuthorizedTest(adminData);
      const res = await authorizedApi.delete(`${USERS_URL}/${dbUser.id}`);
      expect(res.statusCode).toBe(204);
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

  describe(`GET ${USERS_URL}/:id/posts`, () => {
    const populateUsersAndPosts = async () => {
      const dbUser = await createUser(userData);
      const dbXUser = await createUser(xUserData);
      const userPosts = [
        { ...postDataOutput, authorId: dbUser.id, published: false },
        { ...postDataOutput, authorId: dbUser.id },
      ];
      const allUsersPosts = [
        { ...postDataOutput, authorId: dbXUser.id },
        ...userPosts,
      ];
      for (const postData of allUsersPosts) {
        await createPost(postData);
      }
      return { dbUser, dbXUser, userPosts, allUsersPosts };
    };

    it('should respond with 400 if the user id is invalid', async () => {
      const res = await api.get(`${USERS_URL}/123/posts`);
      assertInvalidIdErrorRes(res);
    });

    it('should respond with and empty array if the user is not found', async () => {
      const dbUser = await createUser(userData);
      await db.user.delete({ where: { id: dbUser.id } });
      const res = await api.get(`${USERS_URL}/${dbUser.id}/posts`);
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with an empty array of posts', async () => {
      const dbUser = await createUser(userData);
      const res = await api.get(`${USERS_URL}/${dbUser.id}/posts`);
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with an array of user public posts on request without JWT', async () => {
      const { dbUser, userPosts } = await populateUsersAndPosts();
      const res = await api.get(`${USERS_URL}/${dbUser.id}/posts`);
      const resBody = res.body as PostFullData[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody.length).toBe(1);
      assertPostData(resBody[0], userPosts[1]);
    });

    it('should respond with an array of user public posts on request with non-post-author JWT', async () => {
      const { dbUser, userPosts } = await populateUsersAndPosts();
      const { authorizedApi } = await prepForAuthorizedTest(xUserData);
      const res = await authorizedApi.get(`${USERS_URL}/${dbUser.id}/posts`);
      const resBody = res.body as PostFullData[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody.length).toBe(1);
      assertPostData(resBody[0], userPosts[1]);
    });

    it('should respond with an array of user all posts on request with post-author JWT', async () => {
      const { dbUser, userPosts } = await populateUsersAndPosts();
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      const res = await authorizedApi.get(`${USERS_URL}/${dbUser.id}/posts`);
      const resBody = res.body as PostFullData[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody.length).toBe(2);
      assertPostData(resBody[0], userPosts[0]);
      assertPostData(resBody[1], userPosts[1]);
    });
  });

  describe(`GET ${USERS_URL}/:id/comments`, () => {
    const populateDBForCommentSearch = async (published = true) => {
      const dbUser = await createUser(userData);
      const dbXUser = await createUser(xUserData);
      const authorId = dbUser.id;
      const commentOne = { authorId: dbXUser.id, content: 'Nice blog' };
      const commentTwo = { authorId, content: 'Thanks a lot' };
      const commentThree = { authorId: dbXUser.id, content: 'You are welcome' };
      const comments = [commentOne, commentTwo, commentThree];
      const postData = { ...postDataOutput, published, authorId, comments };
      const dbPost = await createPost(postData);
      return { dbPost, dbUser, dbXUser, commentOne, commentTwo, commentThree };
    };

    it('should respond with an array of comments', async () => {
      const { dbXUser, commentOne, commentThree } =
        await populateDBForCommentSearch();
      const res = await api.get(`${USERS_URL}/${dbXUser.id}/comments`);
      const resBody = res.body as Comment[];
      const commentContents = resBody.map((c) => c.content);
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(2);
      expect(commentContents).toContain(commentOne.content);
      expect(commentContents).toContain(commentThree.content);
    });

    it('should respond with an empty array if the request without JWT and the post is private', async () => {
      const { dbXUser } = await populateDBForCommentSearch(false);
      const res = await api.get(`${USERS_URL}/${dbXUser.id}/comments`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with an empty array if the request without JWT and the post is private', async () => {
      const { dbXUser } = await populateDBForCommentSearch(false);
      const { authorizedApi } = await prepForAuthorizedTest(xUserData);
      const res = await authorizedApi.get(
        `${USERS_URL}/${dbXUser.id}/comments`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with the comment array if the request wit a post author JWT and the post is private', async () => {
      const { dbXUser, commentOne, commentThree } =
        await populateDBForCommentSearch(false);
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      const res = await authorizedApi.get(
        `${USERS_URL}/${dbXUser.id}/comments`
      );
      const resBody = res.body as Comment[];
      const commentContents = resBody.map((c) => c.content);
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(2);
      expect(commentContents).toContain(commentOne.content);
      expect(commentContents).toContain(commentThree.content);
    });

    it('should respond with an array of comments based on search by full text', async () => {
      const { dbUser, commentTwo } = await populateDBForCommentSearch();
      const res = await api.get(
        `${USERS_URL}/${dbUser.id}/comments?q=${encodeURI('thanks a lot')}`
      );
      const resBody = res.body as Comment[];
      const commentContents = resBody.map((c) => c.content);
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      expect(commentContents).toContain(commentTwo.content);
    });

    it('should respond with an array of comments based on search by part of the text', async () => {
      const { dbXUser, commentThree } = await populateDBForCommentSearch();
      const res = await api.get(
        `${USERS_URL}/${dbXUser.id}/comments?q=welcome`
      );
      const resBody = res.body as Comment[];
      const commentContents = resBody.map((c) => c.content);
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      expect(commentContents).toContain(commentThree.content);
    });

    it('should respond with an empty comment array if post comment is private and there is no JWT', async () => {
      const { dbXUser } = await populateDBForCommentSearch(false);
      const res = await api.get(`${USERS_URL}/${dbXUser.id}/comments?q=thanks`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with an empty comment array if post comment is private and there is non-post-author JWT', async () => {
      const { dbXUser } = await populateDBForCommentSearch(false);
      const { authorizedApi } = await prepForAuthorizedTest(xUserData);
      const res = await authorizedApi.get(
        `${USERS_URL}/${dbXUser.id}/comments?q=thanks`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with a comment array if post comment is private and there is post-author JWT', async () => {
      const { dbUser, commentTwo } = await populateDBForCommentSearch(false);
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      const res = await authorizedApi.get(
        `${USERS_URL}/${dbUser.id}/comments?q=thanks`
      );
      const resBody = res.body as Comment[];
      const commentContents = resBody.map((c) => c.content);
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      expect(commentContents).toContain(commentTwo.content);
    });
  });

  describe(`GET ${USERS_URL}/:id/votes`, () => {
    const populateDBForVoteSearch = async (published = true) => {
      const dbUser = await createUser(userData);
      const dbXUser = await createUser(xUserData);
      const dbAdmin = await createUser(adminData);
      const voteOne = { userId: dbXUser.id, isUpvote: false };
      const voteTwo = { userId: dbUser.id, isUpvote: true };
      const voteThree = { userId: dbAdmin.id, isUpvote: true };
      const votes = [voteOne, voteTwo, voteThree];
      const postData = {
        ...postDataOutput,
        authorId: dbUser.id,
        published,
        votes,
      };
      const dbPost = await createPost(postData);
      return { dbUser, dbXUser, dbAdmin, dbPost, voteOne, voteTwo, voteThree };
    };

    it('should respond with an upvote array', async () => {
      const { dbXUser } = await populateDBForVoteSearch();
      const res = await api.get(`${USERS_URL}/${dbXUser.id}/votes`);
      const resBody = res.body as VoteOnPost[];
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      expect(resBody[0].isUpvote).toBe(false);
    });

    it('should respond with an upvote array based on search by vote type', async () => {
      const { dbAdmin } = await populateDBForVoteSearch();
      const res = await api.get(
        `${USERS_URL}/${dbAdmin.id}/votes?upvote=truthy`
      );
      const resBody = res.body as VoteOnPost[];
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      expect(resBody[0].isUpvote).toBe(true);
    });

    it('should respond with an upvote array based on search by vote type', async () => {
      const { dbXUser } = await populateDBForVoteSearch();
      const res = await api.get(
        `${USERS_URL}/${dbXUser.id}/votes?downvote=truthy`
      );
      const resBody = res.body as VoteOnPost[];
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      expect(resBody[0].isUpvote).toBe(false);
    });

    it('should respond with an empty vote array if the post is private and there is no JWT', async () => {
      const { dbXUser } = await populateDBForVoteSearch(false);
      const res = await api.get(`${USERS_URL}/${dbXUser.id}/votes`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with an empty vote array if the post is private and there is non-post-author JWT', async () => {
      const { dbXUser } = await populateDBForVoteSearch(false);
      const { authorizedApi } = await prepForAuthorizedTest(xUserData);
      const res = await authorizedApi.get(`${USERS_URL}/${dbXUser.id}/votes`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with a upvote array if the post is private and there is post-author JWT', async () => {
      const { dbAdmin } = await populateDBForVoteSearch(false);
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      const res = await authorizedApi.get(
        `${USERS_URL}/${dbAdmin.id}/votes?upvote=truthy`
      );
      const resBody = res.body as VoteOnPost[];
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      expect(resBody[0].isUpvote).toBe(true);
    });

    it('should respond with a downvote array if the post is private and there is post-author JWT', async () => {
      const { dbXUser } = await populateDBForVoteSearch(false);
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      const res = await authorizedApi.get(
        `${USERS_URL}/${dbXUser.id}/votes?downvote=true`
      );
      const resBody = res.body as VoteOnPost[];
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      expect(resBody[0].isUpvote).toBe(false);
    });
  });
});

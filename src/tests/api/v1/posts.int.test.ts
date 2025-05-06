import { describe, it, afterAll, beforeEach, expect } from 'vitest';
import { Comment, VotesOnPosts } from '../../../../prisma/generated/client';
import { SALT } from '../../../lib/config';
import { ZodIssue } from 'zod';
import {
  AppErrorResponse,
  AuthResponse,
  NewDefaultUser,
  PostFullData,
} from '../../../types';
import bcrypt from 'bcryptjs';
import app from '../../../app';
import db from '../../../lib/db';
import request, { Response } from 'supertest';

describe('Posts endpoint', async () => {
  const BASE_URL = '/api/v1';
  const POSTS_URL = `${BASE_URL}/posts`;

  const api = request(app);

  const deleteAllPosts = async () => await db.post.deleteMany({});
  const deleteAllUsers = async () => await db.user.deleteMany({});

  beforeEach(async () => await deleteAllPosts());

  afterAll(async () => {
    await deleteAllPosts();
    await deleteAllUsers();
  });

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

  const userOneData = {
    username: 'superman',
    fullname: 'clark kent',
    password: 'Ss@12312',
  };
  const userTwoData = {
    username: 'batman',
    fullname: 'Bruce Wayne',
    password: 'Bb@12312',
  };
  const adminData = {
    username: 'admin',
    fullname: 'Administrator',
    password: 'Aa@12312',
    isAdmin: true,
  };
  const xUserData = {
    username: 'unknown',
    fullname: 'Unknown',
    password: 'Uu@12312',
  };

  await deleteAllPosts();
  await deleteAllUsers();
  const dbUserOne = await createUser(userOneData);
  const dbUserTwo = await createUser(userTwoData);
  await createUser(adminData);
  await createUser(xUserData);

  const postDataInput = {
    title: 'Test Post',
    content: 'Test post content...',
    categories: ['comedy', 'fantasy'],
  };

  const postFullData = {
    ...postDataInput,
    authorId: dbUserOne.id,
    comments: [
      { authorId: dbUserTwo.id, content: 'Nice blog' },
      { authorId: dbUserOne.id, content: 'Thanks a lot' },
    ],
    votes: [{ userId: dbUserOne.id }, { userId: dbUserTwo.id, isUpvote: true }],
  };

  const postDataOutput: Omit<typeof postFullData, 'authorId'> = {
    ...postDataInput,
    comments: [],
    votes: [],
  };

  const commentData = { content: 'Keep it up' };

  const createPost = async (data: typeof postFullData) => {
    return await db.post.create({
      data: {
        title: data.title,
        content: data.content,
        authorId: data.authorId,
        votes: { create: data.votes },
        comments: { create: data.comments },
        categories: {
          create: data.categories.map((name) => ({
            category: {
              connectOrCreate: { where: { name }, create: { name } },
            },
          })),
        },
      },
      include: {
        comments: { include: { author: true } },
        votes: { include: { user: true } },
        categories: true,
        author: true,
      },
    });
  };

  const assertPostData = (
    actualPost: PostFullData,
    expectedPost: typeof postFullData
  ) => {
    expect(actualPost.title).toBe(expectedPost.title);
    expect(actualPost.content).toBe(expectedPost.content);
    expect(actualPost.authorId).toBe(expectedPost.authorId);
    expect(actualPost.comments.length).toBe(expectedPost.comments.length);
    expect(actualPost.categories.length).toBe(expectedPost.categories.length);
    expect(
      actualPost.categories.map(({ categoryName }) => categoryName)
    ).toStrictEqual(expectedPost.categories);
    expect(
      actualPost.comments.map(({ authorId, content }) => ({
        authorId,
        content,
      }))
    ).toStrictEqual(expectedPost.comments);
  };

  const assertInvalidIdErrorRes = (res: Response) => {
    const resBody = res.body as AppErrorResponse;
    expect(res.statusCode).toBe(400);
    expect(res.type).toMatch(/json/);
    expect(resBody.error.message).toMatch(/^.* ?id ?.*$/i);
    expect(resBody.error.message).toMatch(/invalid/i);
  };

  describe(`GET ${POSTS_URL}`, () => {
    it('should respond with an empty array', async () => {
      const res = await api.get(POSTS_URL);
      const resBody = res.body as [];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toBeTypeOf('object');
      expect(Array.isArray(resBody)).toBe(true);
      expect(resBody.length).toBe(0);
    });

    it('should respond with an array of posts', async () => {
      const POST_COUNT = 2;
      for (let i = 0; i < POST_COUNT; i++) {
        await createPost(postFullData);
      }
      const res = await api.get(POSTS_URL);
      const resBody = res.body as PostFullData[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toBeTypeOf('object');
      expect(Array.isArray(resBody)).toBe(true);
      expect(resBody.length).toBe(POST_COUNT);
      for (const post of resBody) {
        assertPostData(post, postFullData);
      }
    });
  });

  describe(`GET ${POSTS_URL}/:id`, () => {
    it('should respond with a 400', async () => {
      const res = await api.get(`${POSTS_URL}/123`);
      assertInvalidIdErrorRes(res);
    });

    it('should respond with a 404', async () => {
      const dbPost = await createPost(postFullData);
      await db.post.delete({ where: { id: dbPost.id } });
      const res = await api.get(`${POSTS_URL}/${dbPost.id}`);
      expect(res.statusCode).toBe(404);
    });

    it('should respond with a post', async () => {
      const dbPost = await createPost(postFullData);
      const res = await api.get(`${POSTS_URL}/${dbPost.id}`);
      const resBody = res.body as PostFullData;
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toBeTypeOf('object');
      assertPostData(resBody, postFullData);
    });
  });

  const createTestsForCreatingOrUpdatingPost = (forUpdating = false) => {
    return async () => {
      const { token, user: signedInUser } = await signin(
        userOneData.username,
        userOneData.password
      );

      const authorizedApi = request.agent(app).set('Authorization', token);

      const postDataToUpdate = {
        ...postDataOutput,
        authorId: signedInUser.id,
        content: 'foobar',
        title: 'foo',
      };

      const sendRequest = async (
        data: string | object | undefined,
        authorized = true
      ) => {
        if (forUpdating) {
          const dbPost = await createPost(postDataToUpdate);
          return (authorized ? authorizedApi : api)
            .put(`${POSTS_URL}/${dbPost.id}`)
            .send(data);
        } else {
          return (authorized ? authorizedApi : api).post(POSTS_URL).send(data);
        }
      };

      const SUCCESS_CODE = forUpdating ? 200 : 201;
      const VERB = forUpdating ? 'update' : 'create';

      it('should respond with 401 on a request without valid JWT', async () => {
        const res = await sendRequest(postDataInput, false);
        expect(res.statusCode).toBe(401);
        expect(res.body).toStrictEqual({});
      });

      if (forUpdating) {
        it('should respond with 400 on invalid id', async () => {
          const res = await api
            .put(`${POSTS_URL}/123`)
            .set('Authorization', token)
            .send(postDataInput);
          assertInvalidIdErrorRes(res);
        });

        it('should respond with 401 with non-owner credentials', async () => {
          const dbPost = await createPost({
            ...postDataToUpdate,
            authorId: dbUserTwo.id,
          });
          const res = await authorizedApi
            .put(`${POSTS_URL}/${dbPost.id}`)
            .send(postDataInput);
          expect(res.statusCode).toBe(401);
          expect(res.body).toStrictEqual({});
        });

        it('should update the categories', async () => {
          const categories = ['misty'];
          const res = await sendRequest({ ...postDataToUpdate, categories });
          const resBody = res.body as PostFullData;
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(
            await db.post.findUnique({ where: { id: resBody.id } })
          ).not.toBeNull();
          assertPostData(resBody, { ...postDataToUpdate, categories });
        });
      }

      it(`should not ${VERB} a post without title`, async () => {
        const res = await sendRequest({ ...postDataInput, title: '' });
        const resBody = res.body as ZodIssue[];
        expect(res.statusCode).toBe(400);
        expect(resBody[0].path).toContain('title');
        expect(resBody[0].message).toMatch(/title/i);
      });

      it(`should not ${VERB} a post without content`, async () => {
        const res = await sendRequest({ ...postDataInput, content: '' });
        const resBody = res.body as ZodIssue[];
        expect(res.statusCode).toBe(400);
        expect(resBody[0].path).toContain('content');
        expect(resBody[0].message).toMatch(/content|body/i);
      });

      it(`should ${VERB} a post even with duplicated categories`, async () => {
        const res = await sendRequest({
          ...postDataInput,
          categories: [
            ...postDataInput.categories,
            ...postDataInput.categories,
          ],
        });
        const resBody = res.body as PostFullData;
        expect(res.statusCode).toBe(SUCCESS_CODE);
        expect(res.type).toMatch(/json/);
        expect(
          await db.post.findUnique({ where: { id: resBody.id } })
        ).not.toBeNull();
        assertPostData(resBody, {
          ...postDataOutput,
          authorId: signedInUser.id,
        });
      });

      it(`should ${VERB} a post even without categories`, async () => {
        const res = await sendRequest({
          ...postDataInput,
          categories: undefined,
        });
        const resBody = res.body as PostFullData;
        expect(res.statusCode).toBe(SUCCESS_CODE);
        expect(res.type).toMatch(/json/);
        expect(
          await db.post.findUnique({ where: { id: resBody.id } })
        ).not.toBeNull();
        assertPostData(resBody, {
          ...postDataOutput,
          authorId: signedInUser.id,
          categories: [],
        });
      });

      it(`should ${VERB} a published post`, async () => {
        const res = await sendRequest({ ...postDataInput, published: true });
        const resBody = res.body as PostFullData;
        expect(res.statusCode).toBe(SUCCESS_CODE);
        expect(res.type).toMatch(/json/);
        expect(
          await db.post.findUnique({ where: { id: resBody.id } })
        ).not.toBeNull();
        expect(resBody.published).toBe(true);
        assertPostData(resBody, {
          ...postDataOutput,
          authorId: signedInUser.id,
        });
      });

      it(`should ${VERB} a post with all categories converted to lowercase`, async () => {
        const res = await sendRequest({
          ...postDataInput,
          categories: postDataInput.categories.map((c) => c.toUpperCase()),
        });
        const resBody = res.body as PostFullData;
        expect(res.statusCode).toBe(SUCCESS_CODE);
        expect(res.type).toMatch(/json/);
        expect(
          await db.post.findUnique({ where: { id: resBody.id } })
        ).not.toBeNull();
        assertPostData(resBody, {
          ...postDataOutput,
          authorId: signedInUser.id,
          categories: postDataOutput.categories.map((c) => c.toLowerCase()),
        });
      });
    };
  };

  describe(`POST ${POSTS_URL}`, createTestsForCreatingOrUpdatingPost());

  describe(`PUT ${POSTS_URL}/:id`, createTestsForCreatingOrUpdatingPost(true));

  const createTestsForDeletingPostOrComment = (forComment = false) => {
    return async () => {
      const { token, user: signedInUser } = await signin(
        userOneData.username,
        userOneData.password
      );

      const authorizedApi = request.agent(app).set('Authorization', token);

      const postDataToDelete = { ...postFullData, authorId: signedInUser.id };

      const getSignedInUserCommentId = (post: PostFullData) => {
        return post.comments.find((c) => c.authorId === signedInUser.id)?.id;
      };

      it('should respond with 401 on a request without JWT', async () => {
        const dbPost = await createPost(postDataToDelete);
        const res = await api.delete(
          forComment
            ? `${POSTS_URL}/${dbPost.id}/comments/${getSignedInUserCommentId(
                dbPost
              )}`
            : `${POSTS_URL}/${dbPost.id}`
        );
        expect(res.statusCode).toBe(401);
        expect(res.body).toStrictEqual({});
      });

      it(`should respond with 401 on request with non-post${
        forComment ? '/comment' : ''
      }-owner JWT`, async () => {
        const xUserSigninData = await signin(
          xUserData.username,
          xUserData.password
        );
        const dbPost = await createPost(postDataToDelete);
        const res = await api
          .delete(
            forComment
              ? `${POSTS_URL}/${dbPost.id}/comments/${getSignedInUserCommentId(
                  dbPost
                )}`
              : `${POSTS_URL}/${dbPost.id}`
          )
          .set('Authorization', xUserSigninData.token);
        expect(res.statusCode).toBe(401);
        expect(res.body).toStrictEqual({});
      });

      it(`should admin be able delete a normal user ${
        forComment ? 'comment' : 'post'
      }`, async () => {
        const adminSigninData = await signin(
          adminData.username,
          adminData.password
        );
        const dbPost = await createPost(postDataToDelete);
        const res = await api
          .delete(
            forComment
              ? `${POSTS_URL}/${dbPost.id}/comments/${getSignedInUserCommentId(
                  dbPost
                )}`
              : `${POSTS_URL}/${dbPost.id}`
          )
          .set('Authorization', adminSigninData.token);
        expect(res.statusCode).toBe(204);
        expect(res.body).toStrictEqual({});
      });

      it(`should respond with 204 if the ${
        forComment ? 'comment' : 'post'
      } is not found`, async () => {
        const dbPost = await createPost(postDataToDelete);
        const res = await authorizedApi.delete(
          forComment
            ? `${POSTS_URL}/${dbPost.id}/comments/${getSignedInUserCommentId(
                dbPost
              )}`
            : `${POSTS_URL}/${dbPost.id}`
        );
        expect(res.statusCode).toBe(204);
        expect(res.body).toStrictEqual({});
      });

      it(`should delete a ${
        forComment ? 'comment' : 'post'
      } and respond with 204`, async () => {
        const dbPost = await createPost(postDataToDelete);
        const res = await authorizedApi.delete(
          forComment
            ? `${POSTS_URL}/${dbPost.id}/comments/${getSignedInUserCommentId(
                dbPost
              )}`
            : `${POSTS_URL}/${dbPost.id}`
        );
        expect(res.statusCode).toBe(204);
        expect(res.body).toStrictEqual({});
        if (forComment) {
          expect(
            await db.comment.findUnique({
              where: { id: getSignedInUserCommentId(dbPost) },
            })
          ).toBeNull();
        } else {
          expect(
            await db.post.findUnique({ where: { id: dbPost.id } })
          ).toBeNull();
        }
      });

      if (forComment) {
        it('should respond with 400 on invalid post id', async () => {
          const dbPost = await createPost(postDataToDelete);
          const res = await authorizedApi.delete(
            `${POSTS_URL}/123/comments/${getSignedInUserCommentId(dbPost)}`
          );
          assertInvalidIdErrorRes(res);
        });

        it('should respond with 400 on invalid comment id', async () => {
          const dbPost = await createPost(postDataToDelete);
          const res = await authorizedApi.delete(
            `${POSTS_URL}/${dbPost.id}/comments/321`
          );
          assertInvalidIdErrorRes(res);
        });

        it(`should respond with 204 if the comment is not found`, async () => {
          const dbPost = await createPost(postDataToDelete);
          const notPostOwnerSigninData = await signin(
            userTwoData.username,
            userTwoData.password
          );
          const cId = dbPost.comments.find(
            (c) => c.authorId === notPostOwnerSigninData.user.id
          )?.id;
          await db.comment.delete({ where: { id: cId } });
          const res = await api
            .delete(`${POSTS_URL}/${dbPost.id}/comments/${cId}`)
            .set('Authorization', token);
          expect(res.statusCode).toBe(204);
          expect(res.body).toStrictEqual({});
        });

        it(`should delete a comment and respond with 204`, async () => {
          const dbPost = await createPost(postDataToDelete);
          const notPostOwnerSigninData = await signin(
            userTwoData.username,
            userTwoData.password
          );
          const cId = dbPost.comments.find(
            (c) => c.authorId === notPostOwnerSigninData.user.id
          )?.id;
          const res = await api
            .delete(`${POSTS_URL}/${dbPost.id}/comments/${cId}`)
            .set('Authorization', token);
          expect(res.statusCode).toBe(204);
          expect(res.body).toStrictEqual({});
          expect(
            await db.comment.findUnique({ where: { id: cId } })
          ).toBeNull();
        });
      } else {
        it('should respond with 400 on invalid id', async () => {
          const res = await authorizedApi.delete(`${POSTS_URL}/321`);
          assertInvalidIdErrorRes(res);
        });
      }
    };
  };

  describe(`DELETE ${POSTS_URL}/:id`, createTestsForDeletingPostOrComment());

  describe(`GET ${POSTS_URL}/:id/comments`, () => {
    it('should respond with 400 on invalid postId', async () => {
      const res = await api.get(`${POSTS_URL}/123/comments`);
      assertInvalidIdErrorRes(res);
    });

    it('should respond with 404 on id of non-existent post', async () => {
      const dbPost = await createPost(postFullData);
      await db.post.delete({ where: { id: dbPost.id } });
      const res = await api.get(`${POSTS_URL}/${dbPost.id}/comments`);
      expect(res.statusCode).toBe(404);
    });

    it('should respond with an empty array', async () => {
      const dbPost = await createPost({
        ...postDataOutput,
        authorId: dbUserOne.id,
      });
      const res = await api.get(`${POSTS_URL}/${dbPost.id}/comments`);
      const resBody = res.body as Comment[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(Array.isArray(resBody)).toBe(true);
      expect(resBody).toStrictEqual([]);
    });

    it('should respond with an array of comments', async () => {
      const dbPost = await createPost(postFullData);
      const res = await api.get(`${POSTS_URL}/${dbPost.id}/comments`);
      const resBody = res.body as Comment[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(Array.isArray(resBody)).toBe(true);
      expect(resBody.every((c) => c.postId === dbPost.id)).toBe(true);
      expect(
        resBody.map(({ authorId, content }) => ({ authorId, content }))
      ).toStrictEqual(postFullData.comments);
      for (const comment of resBody) {
        expect(new Date(comment.createdAt)).lessThan(new Date());
        expect(new Date(comment.updatedAt)).lessThan(new Date());
      }
    });
  });

  describe(`GET ${POSTS_URL}/:pId/comments/:cId`, () => {
    it('should respond with 400 on invalid post id', async () => {
      const dbPost = await createPost(postFullData);
      const res = await api.get(
        `${POSTS_URL}/321/comments/${dbPost.comments[0].id}`
      );
      assertInvalidIdErrorRes(res);
    });

    it('should respond with 400 on invalid comment id', async () => {
      const dbPost = await createPost(postFullData);
      const res = await api.get(`${POSTS_URL}/${dbPost.id}/comments/321`);
      assertInvalidIdErrorRes(res);
    });

    it('should respond with 404 on id of non-existent post', async () => {
      const dbPost = await createPost(postFullData);
      await db.post.delete({ where: { id: dbPost.id } });
      const res = await api.get(
        `${POSTS_URL}/${dbPost.id}/comments/${dbPost.comments[0].id}`
      );
      expect(res.statusCode).toBe(404);
    });

    it('should respond with 404 on id of non-existent comment', async () => {
      const dbPost = await createPost(postFullData);
      await db.comment.delete({ where: { id: dbPost.comments[0].id } });
      const res = await api.get(
        `${POSTS_URL}/${dbPost.id}/comments/${dbPost.comments[0].id}`
      );
      expect(res.statusCode).toBe(404);
    });

    it('should respond with a comment', async () => {
      const dbPost = await createPost(postFullData);
      const expectedComment = dbPost.comments[0];
      const res = await api.get(
        `${POSTS_URL}/${dbPost.id}/comments/${expectedComment.id}`
      );
      const actualComment = res.body as Comment;
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(actualComment).toBeTypeOf('object');
      expect(actualComment.postId).toStrictEqual(dbPost.id);
      expect(actualComment.content).toStrictEqual(expectedComment.content);
      expect(actualComment.authorId).toStrictEqual(expectedComment.authorId);
      expect(new Date(actualComment.createdAt)).lessThan(new Date());
      expect(new Date(actualComment.updatedAt)).lessThan(new Date());
    });
  });

  const createTestsForCreatingOrUpdatingComment = (forUpdating = false) => {
    return async () => {
      const { token, user: signedInUser } = await signin(
        userOneData.username,
        userOneData.password
      );

      const authorizedApi = request.agent(app).set('Authorization', token);

      let dbPost: PostFullData;

      const populateDB = async () => {
        if (forUpdating) {
          dbPost = await createPost(postFullData);
        } else {
          dbPost = await createPost({
            ...postDataOutput,
            authorId: dbUserTwo.id,
          });
        }
      };

      const sendRequest = async (
        data: string | object | undefined,
        authorized = true
      ) => {
        await populateDB();
        if (forUpdating) {
          return (authorized ? authorizedApi : api)
            .put(
              `${POSTS_URL}/${dbPost.id}/comments/${
                dbPost.comments.find((c) => c.authorId === signedInUser.id)?.id
              }`
            )
            .send(data);
        } else {
          return (authorized ? authorizedApi : api)
            .post(`${POSTS_URL}/${dbPost.id}/comments`)
            .send(data);
        }
      };

      const SUCCESS_CODE = forUpdating ? 200 : 201;
      const VERB = forUpdating ? 'update' : 'create';

      it('should respond with 401 on a request without valid JWT', async () => {
        const res = await sendRequest(postDataInput, false);
        expect(res.statusCode).toBe(401);
        expect(res.body).toStrictEqual({});
      });

      it('should respond with 400 on invalid post id', async () => {
        await populateDB();
        const res = await authorizedApi[forUpdating ? 'put' : 'post'](
          `${POSTS_URL}/321/comments/${
            forUpdating ? dbPost.comments[0].id : ''
          }`
        ).send(commentData);
        assertInvalidIdErrorRes(res);
      });

      it(`should respond with ${
        forUpdating ? 404 : 400
      } on id of non-existent post`, async () => {
        await populateDB();
        await db.post.delete({ where: { id: dbPost.id } });
        const res = await authorizedApi[forUpdating ? 'put' : 'post'](
          `${POSTS_URL}/${dbPost.id}/comments/${
            forUpdating ? dbPost.comments[0].id : ''
          }`
        ).send(commentData);
        expect(res.statusCode).toBe(forUpdating ? 404 : 400);
      });

      if (forUpdating) {
        it('should respond with 400 on invalid comment id', async () => {
          await populateDB();
          const res = await authorizedApi
            .put(`${POSTS_URL}/${dbPost.id}/comments/321`)
            .send(commentData);
          assertInvalidIdErrorRes(res);
        });

        it('should respond with 404 on id of non-existent comment', async () => {
          await populateDB();
          await db.comment.delete({ where: { id: dbPost.comments[0].id } });
          const res = await authorizedApi
            .put(`${POSTS_URL}/${dbPost.id}/comments/${dbPost.comments[0].id}`)
            .send(commentData);
          expect(res.statusCode).toBe(404);
        });

        it('should respond with 401 on a non-comment-owner JWT', async () => {
          await populateDB();
          const res = await authorizedApi
            .put(
              `${POSTS_URL}/${dbPost.id}/comments/${
                dbPost.comments.find((c) => c.id !== signedInUser.id)?.id
              }`
            )
            .set('authorization', token)
            .send(commentData);
          expect(res.statusCode).toBe(401);
          expect(res.body).toStrictEqual({});
        });
      }

      it('should respond with 400 on a comment without content field', async () => {
        const res = await sendRequest({});
        const resBody = res.body as ZodIssue[];
        expect(res.statusCode).toBe(400);
        expect(res.type).toMatch(/json/);
        expect(Array.isArray(resBody)).toBe(true);
        expect(resBody[0].path).toContain('content');
        expect(resBody[0].message).toMatch(/content|body/i);
      });

      it('should respond with 400 on an empty comment', async () => {
        const res = await sendRequest({ content: '' });
        const resBody = res.body as ZodIssue[];
        expect(res.statusCode).toBe(400);
        expect(res.type).toMatch(/json/);
        expect(Array.isArray(resBody)).toBe(true);
        expect(resBody[0].path).toContain('content');
        expect(resBody[0].message).toMatch(/content|body/i);
      });

      it(`should ${VERB} comment and respond with ${SUCCESS_CODE}`, async () => {
        const res = await sendRequest(commentData);
        const resBody = res.body as Comment;
        expect(res.statusCode).toBe(SUCCESS_CODE);
        expect(res.type).toMatch(/json/);
        expect(resBody).toBeTypeOf('object');
        expect(resBody.postId).toStrictEqual(dbPost.id);
        expect(resBody.authorId).toStrictEqual(signedInUser.id);
        expect(resBody.content).toStrictEqual(commentData.content);
        expect(new Date(resBody.createdAt)).lessThan(new Date());
        expect(new Date(resBody.updatedAt)).lessThan(new Date());
      });
    };
  };

  describe(
    `POST ${POSTS_URL}/:pId/comments/`,
    createTestsForCreatingOrUpdatingComment()
  );

  describe(
    `PUT ${POSTS_URL}/:pId/comments/:cId`,
    createTestsForCreatingOrUpdatingComment(true)
  );

  describe(
    `DELETE ${POSTS_URL}/:pId/comments/:cId`,
    createTestsForDeletingPostOrComment(true)
  );

  const createTestsForUpAndDownVoting = (forDownVoting = false) => {
    return async () => {
      const signedInUser = await signin(
        userOneData.username,
        userOneData.password
      );

      const authorizedApi = request
        .agent(app)
        .set('Authorization', signedInUser.token);

      const postDataToVote = forDownVoting
        ? {
            ...postDataOutput,
            authorId: dbUserTwo.id,
            votes: [{ userId: signedInUser.user.id }],
          }
        : { ...postDataOutput, authorId: dbUserTwo.id };

      const VERB = forDownVoting ? 'downvote' : 'upvote';

      it(`should not ${VERB} the post and respond with 401 on a request without JWT`, async () => {
        const dbPost = await createPost(postDataToVote);
        const res = await api.post(`${POSTS_URL}/${dbPost.id}/${VERB}`);
        const votedDBPost = await db.post.findUnique({
          where: { id: dbPost.id },
          include: { votes: true },
        });
        expect(res.statusCode).toBe(401);
        expect(res.body).toStrictEqual({});
        expect(votedDBPost?.votes.length).toBe(forDownVoting ? 1 : 0);
      });

      it('should respond with 400 on invalid post id', async () => {
        const res = await authorizedApi.post(`${POSTS_URL}/123/${VERB}`);
        assertInvalidIdErrorRes(res);
      });

      it('should respond with 404 if the post does not exist', async () => {
        const dbPost = await createPost(postDataToVote);
        await db.post.delete({ where: { id: dbPost.id } });
        const res = await authorizedApi.post(
          `${POSTS_URL}/${dbPost.id}/${VERB}`
        );
        expect(res.statusCode).toBe(404);
        expect(res.type).toMatch(/json/);
      });

      it(`should ${VERB} the post and respond with 200`, async () => {
        const dbPost = await createPost(postDataToVote);
        const res = await authorizedApi.post(
          `${POSTS_URL}/${dbPost.id}/${VERB}`
        );
        const resBody = res.body as PostFullData;
        const votedDBPost = await db.post.findUnique({
          where: { id: dbPost.id },
          include: { votes: true },
        });
        expect(res.statusCode).toBe(200);
        if (forDownVoting) {
          expect(resBody.votes.length).toBe(0);
          expect(votedDBPost?.votes.length).toBe(0);
        } else {
          expect(resBody.votes.length).toBe(1);
          expect(votedDBPost?.votes.length).toBe(1);
          expect(resBody.votes[0].userId).toBe(signedInUser.user.id);
          expect(votedDBPost?.votes[0].userId).toBe(signedInUser.user.id);
        }
      });

      it(`should do nothing and respond with 200 if the posted already ${VERB}d by the same user`, async () => {
        const dbPost = await createPost({
          ...postDataToVote,
          votes: forDownVoting ? [] : [{ userId: signedInUser.user.id }],
        });
        const res = await authorizedApi.post(
          `${POSTS_URL}/${dbPost.id}/${VERB}`
        );
        const resBody = res.body as PostFullData;
        const votedDBPost = await db.post.findUnique({
          where: { id: dbPost.id },
          include: { votes: true },
        });
        expect(res.statusCode).toBe(200);
        if (forDownVoting) {
          expect(resBody.votes.length).toBe(0);
          expect(votedDBPost?.votes.length).toBe(0);
        } else {
          expect(resBody.votes.length).toBe(1);
          expect(votedDBPost?.votes.length).toBe(1);
          expect(resBody.votes[0].userId).toBe(signedInUser.user.id);
          expect(votedDBPost?.votes[0].userId).toBe(signedInUser.user.id);
        }
      });
    };
  };

  describe(`POST ${POSTS_URL}/:id/upvote`, createTestsForUpAndDownVoting());

  describe(
    `POST ${POSTS_URL}/:id/downvote`,
    createTestsForUpAndDownVoting(true)
  );

  describe(`GET ${POSTS_URL}/:id/votes`, () => {
    it('should respond with 400 on invalid post id', async () => {
      const res = await api.get(`${POSTS_URL}/123/votes`);
      assertInvalidIdErrorRes(res);
    });

    it('should respond with an empty array if the post does not exist', async () => {
      const dbPost = await createPost(postFullData);
      await db.post.delete({ where: { id: dbPost.id } });
      const res = await api.get(`${POSTS_URL}/${dbPost.id}/votes`);
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with 200 and all post votes', async () => {
      const dbPost = await createPost(postFullData);
      const dbPostVotes = dbPost.votes.map(({ user: _user, ...vote }) => vote);
      const res = await api.get(`${POSTS_URL}/${dbPost.id}/votes`);
      const resBody = res.body as VotesOnPosts[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toStrictEqual(dbPostVotes);
    });
  });
});

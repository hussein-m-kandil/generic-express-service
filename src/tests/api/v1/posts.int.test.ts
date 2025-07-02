import {
  Comment,
  Category,
  VoteOnPost,
  CategoriesOnPosts,
} from '../../../../prisma/generated/client';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PostFullData, PublicImage } from '../../../types';
import { POSTS_URL, SIGNIN_URL } from './utils';
import { ZodIssue } from 'zod';
import setup from '../setup';
import db from '../../../lib/db';

describe('Posts endpoint', async () => {
  const {
    postDataOutput,
    postDataInput,
    postFullData,
    userOneData,
    userTwoData,
    commentData,
    adminData,
    xUserData,
    dbUserOne,
    dbUserTwo,
    dbXUser,
    imgOne,
    api,
    signin,
    createPost,
    createImage,
    assertPostData,
    deleteAllPosts,
    deleteAllUsers,
    prepForAuthorizedTest,
    assertNotFoundErrorRes,
    assertInvalidIdErrorRes,
    assertResponseWithValidationError,
  } = await setup(SIGNIN_URL);

  let dbImgOne: Omit<PublicImage, 'owner'>;

  beforeEach(async () => {
    await deleteAllPosts();
    dbImgOne = await createImage(imgOne);
  });

  afterAll(async () => {
    await deleteAllPosts();
    await deleteAllUsers();
  });

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

    it('should respond with an array of posts with their images', async () => {
      const POST_COUNT = 2;
      const postData = { ...postFullData, image: dbImgOne.id };
      for (let i = 0; i < POST_COUNT; i++) {
        await createPost(postData);
      }
      const res = await api.get(POSTS_URL);
      const resBody = res.body as PostFullData[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toBeTypeOf('object');
      expect(Array.isArray(resBody)).toBe(true);
      expect(resBody.length).toBe(POST_COUNT);
      for (const post of resBody) {
        assertPostData(post, postData);
      }
    });

    it('should respond with an array of public posts only', async () => {
      await createPost(postFullData);
      await createPost({ ...postFullData, published: false });
      const res = await api.get(POSTS_URL);
      const resBody = res.body as PostFullData[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toBeTypeOf('object');
      expect(Array.isArray(resBody)).toBe(true);
      expect(resBody.length).toBe(1);
      assertPostData(resBody[0], postFullData);
    });

    it('should respond with an array of public posts and current signed-in user private posts', async () => {
      const { token, user } = await signin(
        userOneData.username,
        userOneData.password
      );
      const privatePostData = {
        ...postFullData,
        published: false,
        authorId: user.id,
      };
      await createPost(postFullData);
      await createPost(privatePostData);
      const res = await api.get(POSTS_URL).set('Authorization', token);
      const resBody = res.body as PostFullData[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toBeTypeOf('object');
      expect(Array.isArray(resBody)).toBe(true);
      expect(resBody.length).toBe(2);
      assertPostData(resBody[0], postFullData);
      assertPostData(resBody[1], privatePostData);
    });

    const populateDBForSearch = async () => {
      const mockPostOne = {
        ...postFullData,
        title: 'Cool dog',
        content: 'Woof, woof, ...',
        categories: ['foo', 'bar'],
      };
      const mockPostTwo = {
        ...postFullData,
        title: 'Lazy cat',
        content: 'Meow, meow, ...',
        categories: ['foo', 'tar'],
      };
      const mockPostThree = {
        ...postFullData,
        title: 'Good bird',
        content: 'Sew, sew, ...',
        categories: ['baz'],
      };
      await createPost(mockPostOne);
      await createPost(mockPostTwo);
      await createPost(mockPostThree);
      return { mockPostOne, mockPostTwo, mockPostThree };
    };

    it('should respond with an array of posts based on search by full post title', async () => {
      const { mockPostTwo } = await populateDBForSearch();
      const res = await api.get(`${POSTS_URL}?q=${encodeURI('lazy cat')}`);
      const resBody = res.body as PostFullData[];
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      assertPostData(resBody[0], mockPostTwo);
    });

    it('should respond with an array of posts based on search by part of a post title', async () => {
      const { mockPostOne } = await populateDBForSearch();
      const res = await api.get(`${POSTS_URL}?q=${encodeURI('dog')}`);
      const resBody = res.body as PostFullData[];
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      assertPostData(resBody[0], mockPostOne);
    });

    it('should respond with an array of posts based on search by part of a post content', async () => {
      const { mockPostOne } = await populateDBForSearch();
      const res = await api.get(`${POSTS_URL}?q=${encodeURI('woof')}`);
      const resBody = res.body as PostFullData[];
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      assertPostData(resBody[0], mockPostOne);
    });

    it('should respond with an array of posts based on search by comma-separated categories', async () => {
      await populateDBForSearch();
      const res = await api.get(`${POSTS_URL}?categories=tar,baz`);
      const resBody = res.body as PostFullData[];
      const resCategories = resBody.flatMap((p) =>
        p.categories.map((c) => c.categoryName)
      );
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(2);
      expect(resCategories.length).toBe(3);
      expect(resCategories).toContain('foo');
      expect(resCategories).toContain('tar');
      expect(resCategories).toContain('baz');
    });

    it('should respond with an array of posts based on search by separated categories', async () => {
      await populateDBForSearch();
      const res = await api.get(`${POSTS_URL}?categories=bar&categories=baz`);
      const resBody = res.body as PostFullData[];
      const resCategories = resBody.flatMap((p) =>
        p.categories.map((c) => c.categoryName)
      );
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(2);
      expect(resCategories.length).toBe(3);
      expect(resCategories).toContain('foo');
      expect(resCategories).toContain('bar');
      expect(resCategories).toContain('baz');
    });

    it('should respond with an array of posts based on search by mixed categories', async () => {
      await populateDBForSearch();
      const res = await api.get(
        `${POSTS_URL}?categories=bar,tar&categories=baz`
      );
      const resBody = res.body as PostFullData[];
      const resCategories = resBody.flatMap((p) =>
        p.categories.map((c) => c.categoryName)
      );
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(3);
      expect(resCategories.length).toBe(5);
      expect(resCategories).toContain('foo');
      expect(resCategories).toContain('bar');
      expect(resCategories).toContain('tar');
      expect(resCategories).toContain('baz');
    });

    it('should respond with an array of posts based on search by categories and title', async () => {
      await populateDBForSearch();
      const res = await api.get(`${POSTS_URL}?q=cat&categories=tar,baz`);
      const resBody = res.body as PostFullData[];
      const resCategories = resBody.flatMap((p) =>
        p.categories.map((c) => c.categoryName)
      );
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(2);
      expect(resCategories.length).toBe(3);
      expect(resCategories).toContain('foo');
      expect(resCategories).toContain('tar');
      expect(resCategories).toContain('baz');
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
      assertNotFoundErrorRes(res);
    });

    it('should respond with a public post with its image on request without JWT', async () => {
      const postData = { ...postFullData, image: dbImgOne.id };
      const dbPost = await createPost(postData);
      const res = await api.get(`${POSTS_URL}/${dbPost.id}`);
      const resBody = res.body as PostFullData;
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toBeTypeOf('object');
      assertPostData(resBody, postData);
    });

    it('should respond with a public post with its image even if the JWT not for the post author', async () => {
      const { token } = await signin(
        userOneData.username,
        userOneData.password
      );
      const postData = { ...postFullData, image: dbImgOne.id };
      const dbPost = await createPost(postData);
      const res = await api
        .get(`${POSTS_URL}/${dbPost.id}`)
        .set('Authorization', token);
      const resBody = res.body as PostFullData;
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toBeTypeOf('object');
      assertPostData(resBody, postData);
    });

    it('should respond with a private post with its image authored by the current signed-in user', async () => {
      const { token, user } = await signin(
        userOneData.username,
        userOneData.password
      );
      const currentUserPostFullData = {
        ...postFullData,
        published: false,
        authorId: user.id,
        image: dbImgOne.id,
      };
      const dbPost = await createPost(currentUserPostFullData);
      const res = await api
        .get(`${POSTS_URL}/${dbPost.id}`)
        .set('Authorization', token);
      const resBody = res.body as PostFullData;
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody).toBeTypeOf('object');
      assertPostData(resBody, currentUserPostFullData);
    });

    it('should respond with 404 if the post is private and the request without JWT', async () => {
      const dbPost = await createPost({ ...postFullData, published: false });
      const res = await api.get(`${POSTS_URL}/${dbPost.id}`);
      assertNotFoundErrorRes(res);
    });

    it('should respond with 404 if the post is private and the JWT not for the post author', async () => {
      const { token } = await signin(
        userOneData.username,
        userOneData.password
      );
      const dbPost = await createPost({
        ...postFullData,
        published: false,
        authorId: dbUserTwo.id,
      });
      const res = await api
        .get(`${POSTS_URL}/${dbPost.id}`)
        .set('Authorization', token);
      assertNotFoundErrorRes(res);
    });
  });

  const createTestsForCreatingOrUpdatingPost = (forUpdating = false) => {
    return async () => {
      const { signedInUserData, authorizedApi } = await prepForAuthorizedTest(
        userOneData
      );

      const postDataToUpdate = {
        ...postDataOutput,
        authorId: signedInUserData.user.id,
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
            .set('Authorization', signedInUserData.token)
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
          authorId: signedInUserData.user.id,
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
          authorId: signedInUserData.user.id,
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
          authorId: signedInUserData.user.id,
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
          authorId: signedInUserData.user.id,
          categories: postDataOutput.categories.map((c) => c.toLowerCase()),
        });
      });

      it(`should ${VERB} a post with an image`, async () => {
        const res = await sendRequest({
          ...postDataInput,
          image: dbImgOne.id,
        });
        const resBody = res.body as PostFullData;
        expect(res.statusCode).toBe(SUCCESS_CODE);
        expect(res.type).toMatch(/json/);
        expect(
          await db.post.findUnique({ where: { id: resBody.id } })
        ).not.toBeNull();
        assertPostData(resBody, {
          ...postDataOutput,
          authorId: signedInUserData.user.id,
          image: dbImgOne.id,
        });
      });

      it(`should ${VERB} a post without image id`, async () => {
        const res = await sendRequest({
          ...postDataInput,
          image: undefined,
        });
        const resBody = res.body as PostFullData;
        expect(res.statusCode).toBe(SUCCESS_CODE);
        expect(res.type).toMatch(/json/);
        expect(
          await db.post.findUnique({ where: { id: resBody.id } })
        ).not.toBeNull();
        assertPostData(resBody, {
          ...postDataOutput,
          authorId: signedInUserData.user.id,
          image: undefined,
        });
      });

      it(`should respond with 400 on {VERB} request with invalid image id`, async () => {
        const res = await sendRequest({
          ...postDataInput,
          image: `${crypto.randomUUID()}x_@`,
        });
        assertResponseWithValidationError(res, 'image');
      });

      it(`should respond with 400 on {VERB} request with unknown image id`, async () => {
        const res = await sendRequest({
          ...postDataInput,
          image: crypto.randomUUID(),
        });
        assertInvalidIdErrorRes(res);
      });
    };
  };

  describe(`POST ${POSTS_URL}`, createTestsForCreatingOrUpdatingPost());

  describe(`PUT ${POSTS_URL}/:id`, createTestsForCreatingOrUpdatingPost(true));

  const createTestsForDeletingPostOrComment = (forComment = false) => {
    return async () => {
      const { signedInUserData, authorizedApi } = await prepForAuthorizedTest(
        userOneData
      );

      const postDataToDelete = {
        ...postFullData,
        authorId: signedInUserData.user.id,
        image: undefined,
      };

      const getSignedInUserCommentId = (post: PostFullData) => {
        return post.comments.find(
          (c) => c.authorId === signedInUserData.user.id
        )?.id;
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

      it(`should respond with 404 if the ${
        forComment ? 'comment' : 'post'
      } is not found`, async () => {
        const dbPost = await createPost(postDataToDelete);
        let url = `${POSTS_URL}/${dbPost.id}`;
        if (forComment) {
          const cId = getSignedInUserCommentId(dbPost);
          await db.comment.delete({ where: { id: cId } });
          url = `${POSTS_URL}/${dbPost.id}/comments/${cId}`;
        } else {
          await db.post.delete({ where: { id: dbPost.id } });
        }
        const res = await authorizedApi.delete(url);
        assertNotFoundErrorRes(res);
      });

      it('should respond with 404 if the JWT not for the private post author', async () => {
        const dbPost = await createPost({
          ...postDataToDelete,
          published: false,
          authorId: dbUserTwo.id,
        });
        const cId = getSignedInUserCommentId(dbPost);
        const res = await authorizedApi.delete(
          forComment
            ? `${POSTS_URL}/${dbPost.id}/comments/${cId}`
            : `${POSTS_URL}/${dbPost.id}`
        );
        assertNotFoundErrorRes(res);
      });

      it(`should delete a private post${
        forComment ? '-comment' : ''
      } and respond with 204`, async () => {
        const dbPost = await createPost({
          ...postDataToDelete,
          published: false,
        });
        const cId = getSignedInUserCommentId(dbPost);
        const res = await authorizedApi.delete(
          forComment
            ? `${POSTS_URL}/${dbPost.id}/comments/${cId}`
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

        it(`should respond with 404 if the comment is not found`, async () => {
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
            .set('Authorization', signedInUserData.token);
          assertNotFoundErrorRes(res);
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
            .set('Authorization', signedInUserData.token);
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

        it(`should delete the post and its image if it is owned by the post author`, async () => {
          const dbPost = await createPost({
            ...postDataToDelete,
            image: dbImgOne.id,
          });
          const res = await authorizedApi.delete(`${POSTS_URL}/${dbPost.id}`);
          expect(res.statusCode).toBe(204);
          expect(res.body).toStrictEqual({});
          expect(
            await db.post.findUnique({ where: { id: dbPost.id } })
          ).toBeNull();
          expect(
            await db.image.findUnique({ where: { id: dbImgOne.id } })
          ).toBeNull();
        });

        it(`should delete the post without its image if it is not owned by the post author`, async () => {
          const { authorizedApi, signedInUserData } =
            await prepForAuthorizedTest(xUserData);
          const dbPost = await createPost({
            ...postDataToDelete,
            image: dbImgOne.id,
            authorId: signedInUserData.user.id,
          });
          const res = await authorizedApi.delete(`${POSTS_URL}/${dbPost.id}`);
          expect(res.statusCode).toBe(204);
          expect(res.body).toStrictEqual({});
          expect(
            await db.post.findUnique({ where: { id: dbPost.id } })
          ).toBeNull();
          expect(
            (await db.image.findUnique({ where: { id: dbImgOne.id } }))?.src
          ).toStrictEqual(dbImgOne.src);
        });

        it(`should delete the post without its image if it is in use on another post`, async () => {
          const { signedInUserData } = await prepForAuthorizedTest(xUserData);
          await createPost({
            ...postDataToDelete,
            image: dbImgOne.id,
            authorId: signedInUserData.user.id, // Another user post with same image
          });
          const dbPost = await createPost({
            ...postDataToDelete,
            image: dbImgOne.id,
          });
          const res = await authorizedApi.delete(`${POSTS_URL}/${dbPost.id}`);
          expect(res.statusCode).toBe(204);
          expect(res.body).toStrictEqual({});
          expect(
            await db.post.findUnique({ where: { id: dbPost.id } })
          ).toBeNull();
          expect(
            (await db.image.findUnique({ where: { id: dbImgOne.id } }))?.src
          ).toStrictEqual(dbImgOne.src);
        });
      }
    };
  };

  describe(`DELETE ${POSTS_URL}/:id`, createTestsForDeletingPostOrComment());

  describe(`GET ${POSTS_URL}/categories`, () => {
    it('should respond with 200 and an array of categories', async () => {
      const res = await api.get(`${POSTS_URL}/categories`);
      const resBody = res.body as Category[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(Array.isArray(res.body)).toBe(true);
      for (const name of postFullData.categories) {
        expect(resBody).toContainEqual({ name });
      }
    });
  });

  describe(`GET ${POSTS_URL}/:id/comments`, () => {
    it('should respond with 400 on invalid postId', async () => {
      const res = await api.get(`${POSTS_URL}/123/comments`);
      assertInvalidIdErrorRes(res);
    });

    it('should respond with an empty array on id of non-existent post', async () => {
      const dbPost = await createPost(postFullData);
      await db.post.delete({ where: { id: dbPost.id } });
      const res = await api.get(`${POSTS_URL}/${dbPost.id}/comments`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with an empty array if the JWT does not for the private post author', async () => {
      const { token } = await signin(
        userOneData.username,
        userOneData.password
      );
      const dbPost = await createPost({
        ...postFullData,
        published: false,
        authorId: dbUserTwo.id,
      });
      const res = await api
        .get(`${POSTS_URL}/${dbPost.id}/comments`)
        .set('Authorization', token);
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with 200 and all private post comments if the JWT for the post author', async () => {
      const { token, user } = await signin(
        userOneData.username,
        userOneData.password
      );
      const dbPost = await createPost({
        ...postFullData,
        published: false,
        authorId: user.id,
      });
      const res = await api
        .get(`${POSTS_URL}/${dbPost.id}/comments`)
        .set('Authorization', token);
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

    it('should respond with an array of comments for a public post', async () => {
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

    const populateDBForCommentSearch = async (published = true) => {
      const authorId = dbUserOne.id;
      const commentOne = { authorId: dbUserTwo.id, content: 'Nice blog' };
      const commentTwo = { authorId, content: 'Thanks a lot' };
      const commentThree = {
        authorId: dbUserTwo.id,
        content: 'You are welcome',
      };
      const comments = [commentOne, commentTwo, commentThree];
      const postData = { ...postFullData, published, authorId, comments };
      const dbPost = await createPost(postData);
      return { dbPost, commentOne, commentTwo, commentThree };
    };

    it('should respond with an array of comments based on search by full text', async () => {
      const { dbPost, commentTwo } = await populateDBForCommentSearch();
      const res = await api.get(
        `${POSTS_URL}/${dbPost.id}/comments?q=${encodeURI('thanks a lot')}`
      );
      const resBody = res.body as Comment[];
      const commentContents = resBody.map((c) => c.content);
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      expect(commentContents).toContain(commentTwo.content);
    });

    it('should respond with an array of comments based on search by part of the text', async () => {
      const { dbPost, commentThree } = await populateDBForCommentSearch();
      const res = await api.get(`${POSTS_URL}/${dbPost.id}/comments?q=welcome`);
      const resBody = res.body as Comment[];
      const commentContents = resBody.map((c) => c.content);
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      expect(commentContents).toContain(commentThree.content);
    });

    it('should respond with an empty comment array if the post is private and there is no JWT', async () => {
      const { dbPost } = await populateDBForCommentSearch(false);
      const res = await api.get(`${POSTS_URL}/${dbPost.id}/comments?q=thanks`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with an empty comment array if the post is private and there is non-post-author JWT', async () => {
      const { dbPost } = await populateDBForCommentSearch(false);
      const { authorizedApi } = await prepForAuthorizedTest(userTwoData);
      const res = await authorizedApi.get(
        `${POSTS_URL}/${dbPost.id}/comments?q=thanks`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with a comment array if the post is private and there is post-author JWT', async () => {
      const { dbPost, commentTwo } = await populateDBForCommentSearch(false);
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(
        `${POSTS_URL}/${dbPost.id}/comments?q=thanks`
      );
      const resBody = res.body as Comment[];
      expect(res.statusCode).toBe(200);
      const commentContents = resBody.map((c) => c.content);
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      expect(commentContents).toContain(commentTwo.content);
    });
  });

  describe(`GET ${POSTS_URL}/:id/categories`, () => {
    it('should respond with 400 on invalid postId', async () => {
      const res = await api.get(`${POSTS_URL}/123/categories`);
      assertInvalidIdErrorRes(res);
    });

    it('should respond with 404 on id of non-existent post', async () => {
      const dbPost = await createPost(postFullData);
      await db.post.delete({ where: { id: dbPost.id } });
      const res = await api.get(`${POSTS_URL}/${dbPost.id}/categories`);
      assertNotFoundErrorRes(res);
    });

    it('should respond with 404 if the JWT does not for the private post author', async () => {
      const { token } = await signin(
        userOneData.username,
        userOneData.password
      );
      const dbPost = await createPost({
        ...postFullData,
        published: false,
        authorId: dbUserTwo.id,
      });
      const res = await api
        .get(`${POSTS_URL}/${dbPost.id}/categories`)
        .set('Authorization', token);
      assertNotFoundErrorRes(res);
    });

    it('should respond with 200 and all private post categories if the JWT for the post author', async () => {
      const { token, user } = await signin(
        userOneData.username,
        userOneData.password
      );
      const dbPost = await createPost({
        ...postFullData,
        published: false,
        authorId: user.id,
      });
      const res = await api
        .get(`${POSTS_URL}/${dbPost.id}/categories`)
        .set('Authorization', token);
      const resBody = res.body as CategoriesOnPosts[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(Array.isArray(resBody)).toBe(true);
      expect(resBody.every((c) => c.postId === dbPost.id)).toBe(true);
      expect(resBody.map((c) => c.categoryName)).toStrictEqual(
        postFullData.categories
      );
    });

    it('should respond with an empty array', async () => {
      const dbPost = await createPost({
        ...postDataOutput,
        categories: [],
        authorId: dbUserOne.id,
      });
      const res = await api.get(`${POSTS_URL}/${dbPost.id}/categories`);
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with an array of categories for a public post', async () => {
      const dbPost = await createPost(postFullData);
      const res = await api.get(`${POSTS_URL}/${dbPost.id}/categories`);
      const resBody = res.body as CategoriesOnPosts[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(Array.isArray(resBody)).toBe(true);
      expect(resBody.every((c) => c.postId === dbPost.id)).toBe(true);
      expect(resBody.map((c) => c.categoryName)).toStrictEqual(
        postFullData.categories
      );
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
      assertNotFoundErrorRes(res);
    });

    it('should respond with 404 on id of non-existent comment', async () => {
      const dbPost = await createPost(postFullData);
      await db.comment.delete({ where: { id: dbPost.comments[0].id } });
      const res = await api.get(
        `${POSTS_URL}/${dbPost.id}/comments/${dbPost.comments[0].id}`
      );
      assertNotFoundErrorRes(res);
    });

    it('should respond with 404 if the JWT does not for the private post author', async () => {
      const { token } = await signin(
        userOneData.username,
        userOneData.password
      );
      const dbPost = await createPost({
        ...postFullData,
        published: false,
        authorId: dbUserTwo.id,
      });
      const expectedComment = dbPost.comments[0];
      const res = await api
        .get(`${POSTS_URL}/${dbPost.id}/comments/${expectedComment.id}`)
        .set('Authorization', token);
      assertNotFoundErrorRes(res);
    });

    it('should respond with 200 and all private post comments if the JWT for the private post author', async () => {
      const { token, user } = await signin(
        userOneData.username,
        userOneData.password
      );
      const dbPost = await createPost({
        ...postFullData,
        published: false,
        authorId: user.id,
      });
      const expectedComment = dbPost.comments[0];
      const res = await api
        .get(`${POSTS_URL}/${dbPost.id}/comments/${expectedComment.id}`)
        .set('Authorization', token);
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

    it('should respond with a comment of a public post', async () => {
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

  describe(`POST ${POSTS_URL}/:pId/comments/`, () => {
    const postDataToComment = { ...postDataOutput, authorId: dbUserTwo.id };

    it('should respond with 401 on a request without valid JWT', async () => {
      const dbPost = await createPost(postDataToComment);
      const res = await api
        .post(`${POSTS_URL}/${dbPost.id}/comments`)
        .send(commentData);
      expect(res.statusCode).toBe(401);
      expect(res.body).toStrictEqual({});
    });

    it('should respond with 400 on invalid post id', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .post(`${POSTS_URL}/321/comments`)
        .send(commentData);
      assertInvalidIdErrorRes(res);
    });

    it(`should respond with 404 on id of non-existent post`, async () => {
      const dbPost = await createPost(postDataToComment);
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      await db.post.delete({ where: { id: dbPost.id } });
      const res = await authorizedApi
        .post(`${POSTS_URL}/${dbPost.id}/comments`)
        .send(commentData);
      assertNotFoundErrorRes(res);
    });

    it(`should respond with 404 if the JWT not for the private post`, async () => {
      const dbPost = await createPost({
        ...postDataToComment,
        published: false,
      });
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .post(`${POSTS_URL}/${dbPost.id}/comments`)
        .send(commentData);
      assertNotFoundErrorRes(res);
    });

    it('should respond with 400 on a comment without content field', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const dbPost = await createPost(postDataToComment);
      const res = await authorizedApi
        .post(`${POSTS_URL}/${dbPost.id}/comments`)
        .send({});
      const resBody = res.body as ZodIssue[];
      expect(res.statusCode).toBe(400);
      expect(res.type).toMatch(/json/);
      expect(Array.isArray(resBody)).toBe(true);
      expect(resBody[0].path).toContain('content');
      expect(resBody[0].message).toMatch(/content|body/i);
    });

    it('should respond with 400 on an empty comment', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const dbPost = await createPost(postDataToComment);
      const res = await authorizedApi
        .post(`${POSTS_URL}/${dbPost.id}/comments`)
        .send({ content: '' });
      const resBody = res.body as ZodIssue[];
      expect(res.statusCode).toBe(400);
      expect(res.type).toMatch(/json/);
      expect(Array.isArray(resBody)).toBe(true);
      expect(resBody[0].path).toContain('content');
      expect(resBody[0].message).toMatch(/content|body/i);
    });

    it('should create comment and respond with 20', async () => {
      const { signedInUserData, authorizedApi } = await prepForAuthorizedTest(
        userOneData
      );
      const privatePostData = {
        ...postDataToComment,
        published: false,
        authorId: signedInUserData.user.id,
      };
      for (const dbPromise of [
        createPost(postDataToComment),
        createPost(privatePostData),
      ]) {
        const dbPost = await dbPromise;
        const res = await authorizedApi
          .post(`${POSTS_URL}/${dbPost.id}/comments`)
          .send(commentData);
        const resBody = res.body as PostFullData;
        const createdComment = resBody.comments.at(-1) as Comment;
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(createdComment).toBeTypeOf('object');
        expect(createdComment.postId).toStrictEqual(dbPost.id);
        expect(createdComment.authorId).toStrictEqual(signedInUserData.user.id);
        expect(createdComment.content).toStrictEqual(commentData.content);
        expect(new Date(createdComment.createdAt)).lessThan(new Date());
        expect(new Date(createdComment.updatedAt)).lessThan(new Date());
      }
    });
  });

  describe(`PUT ${POSTS_URL}/:pId/comments/:cId`, () => {
    const postDataToComment = { ...postFullData, authorId: dbUserTwo.id };

    const getCommentId = (dbPost: PostFullData, commentAuthorId: string) => {
      return dbPost.comments.find((c) => c.authorId === commentAuthorId)?.id;
    };

    it('should respond with 401 on a request without valid JWT', async () => {
      const dbPost = await createPost(postDataToComment);
      const { signedInUserData } = await prepForAuthorizedTest(userOneData);
      const cId = getCommentId(dbPost, signedInUserData.user.id);
      const res = await api
        .put(`${POSTS_URL}/${dbPost.id}/comments/${cId}`)
        .send(commentData);
      expect(res.statusCode).toBe(401);
      expect(res.body).toStrictEqual({});
    });

    it('should respond with 400 on invalid post id', async () => {
      const dbPost = await createPost(postDataToComment);
      const cId = dbPost.comments[0].id;
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .put(`${POSTS_URL}/321/comments/${cId}`)
        .send(commentData);
      assertInvalidIdErrorRes(res);
    });

    it(`should respond with 404 on id of non-existent post`, async () => {
      const dbPost = await createPost(postDataToComment);
      const cId = dbPost.comments[0].id;
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      await db.post.delete({ where: { id: dbPost.id } });
      const res = await authorizedApi
        .put(`${POSTS_URL}/${dbPost.id}/comments/${cId}`)
        .send(commentData);
      assertNotFoundErrorRes(res);
    });

    it(`should respond with 404 if the JWT not for the private post`, async () => {
      const dbPost = await createPost({
        ...postDataToComment,
        published: false,
      });
      const cId = dbPost.comments[0].id;
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .put(`${POSTS_URL}/${dbPost.id}/comments/${cId}`)
        .send(commentData);
      assertNotFoundErrorRes(res);
    });

    it('should respond with 400 on invalid comment id', async () => {
      const dbPost = await createPost(postDataToComment);
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi
        .put(`${POSTS_URL}/${dbPost.id}/comments/321`)
        .send(commentData);
      assertInvalidIdErrorRes(res);
    });

    it('should respond with 404 on id of non-existent comment', async () => {
      const dbPost = await createPost(postDataToComment);
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      await db.comment.delete({ where: { id: dbPost.comments[0].id } });
      const res = await authorizedApi
        .put(`${POSTS_URL}/${dbPost.id}/comments/${dbPost.comments[0].id}`)
        .send(commentData);
      assertNotFoundErrorRes(res);
    });

    it('should respond with 401 on a non-comment-owner JWT', async () => {
      const { signedInUserData, authorizedApi } = await prepForAuthorizedTest(
        userOneData
      );
      const dbPost = await createPost(postDataToComment);
      const res = await authorizedApi
        .put(
          `${POSTS_URL}/${dbPost.id}/comments/${
            dbPost.comments.find((c) => c.id !== signedInUserData.user.id)?.id
          }`
        )
        .set('authorization', signedInUserData.token)
        .send(commentData);
      expect(res.statusCode).toBe(401);
      expect(res.body).toStrictEqual({});
    });

    it('should respond with 400 on a comment without content field', async () => {
      const { signedInUserData, authorizedApi } = await prepForAuthorizedTest(
        userOneData
      );
      const dbPost = await createPost(postDataToComment);
      const cId = getCommentId(dbPost, signedInUserData.user.id);
      const res = await authorizedApi
        .put(`${POSTS_URL}/${dbPost.id}/comments/${cId}`)
        .send({});
      const resBody = res.body as ZodIssue[];
      expect(res.statusCode).toBe(400);
      expect(res.type).toMatch(/json/);
      expect(Array.isArray(resBody)).toBe(true);
      expect(resBody[0].path).toContain('content');
      expect(resBody[0].message).toMatch(/content|body/i);
    });

    it('should respond with 400 on an empty comment', async () => {
      const { signedInUserData, authorizedApi } = await prepForAuthorizedTest(
        userOneData
      );
      const dbPost = await createPost(postDataToComment);
      const cId = getCommentId(dbPost, signedInUserData.user.id);
      const res = await authorizedApi
        .put(`${POSTS_URL}/${dbPost.id}/comments/${cId}`)
        .send({ content: '' });
      const resBody = res.body as ZodIssue[];
      expect(res.statusCode).toBe(400);
      expect(res.type).toMatch(/json/);
      expect(Array.isArray(resBody)).toBe(true);
      expect(resBody[0].path).toContain('content');
      expect(resBody[0].message).toMatch(/content|body/i);
    });

    it(`should update comment and respond with 200`, async () => {
      const { signedInUserData, authorizedApi } = await prepForAuthorizedTest(
        userOneData
      );
      const privatePostData = {
        ...postDataToComment,
        published: false,
        authorId: signedInUserData.user.id,
      };
      for (const dbPromise of [
        createPost(postDataToComment),
        createPost(privatePostData),
      ]) {
        const dbPost = await dbPromise;
        const cId = getCommentId(dbPost, signedInUserData.user.id);
        const res = await authorizedApi
          .put(`${POSTS_URL}/${dbPost.id}/comments/${cId}`)
          .send(commentData);
        const resBody = res.body as PostFullData;
        const createdComment = resBody.comments.at(-1) as Comment;
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(createdComment).toBeTypeOf('object');
        expect(createdComment.postId).toStrictEqual(dbPost.id);
        expect(createdComment.authorId).toStrictEqual(signedInUserData.user.id);
        expect(createdComment.content).toStrictEqual(commentData.content);
        expect(new Date(createdComment.createdAt)).lessThan(new Date());
        expect(new Date(createdComment.updatedAt)).lessThan(new Date());
      }
    });
  });

  describe(
    `DELETE ${POSTS_URL}/:pId/comments/:cId`,
    createTestsForDeletingPostOrComment(true)
  );

  const createTestsForUpAndDownVoting = (forDownVoting = false) => {
    return async () => {
      const { signedInUserData, authorizedApi } = await prepForAuthorizedTest(
        userOneData
      );

      const postDataToVote = forDownVoting
        ? {
            ...postDataOutput,
            authorId: dbUserTwo.id,
            votes: [{ userId: signedInUserData.user.id }],
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
        assertNotFoundErrorRes(res);
      });

      it('should respond with 404 if the JWT is for a private post', async () => {
        const dbPost = await createPost({
          ...postDataToVote,
          published: false,
        });
        const res = await authorizedApi.post(
          `${POSTS_URL}/${dbPost.id}/${VERB}`
        );
        assertNotFoundErrorRes(res);
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
          expect(resBody.votes[0].userId).toBe(signedInUserData.user.id);
          expect(votedDBPost?.votes[0].userId).toBe(signedInUserData.user.id);
        }
      });

      it(`should do nothing and respond with 200 if the posted already ${VERB}d by the same user`, async () => {
        const dbPost = await createPost({
          ...postDataToVote,
          votes: forDownVoting ? [] : [{ userId: signedInUserData.user.id }],
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
          expect(resBody.votes[0].userId).toBe(signedInUserData.user.id);
          expect(votedDBPost?.votes[0].userId).toBe(signedInUserData.user.id);
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

    it('should respond with an empty array if the public post does not exist', async () => {
      const dbPost = await createPost(postFullData);
      await db.post.delete({ where: { id: dbPost.id } });
      const res = await api.get(`${POSTS_URL}/${dbPost.id}/votes`);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with an empty array if the JWT does not for the private post author', async () => {
      const { token } = await signin(
        userOneData.username,
        userOneData.password
      );
      const dbPost = await createPost({
        ...postFullData,
        published: false,
        authorId: dbUserTwo.id,
      });
      const res = await api
        .get(`${POSTS_URL}/${dbPost.id}/votes`)
        .set('Authorization', token);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with 200 and all private post votes if the JWT for the post author', async () => {
      const { token, user } = await signin(
        userOneData.username,
        userOneData.password
      );
      const dbPost = await createPost({
        ...postFullData,
        published: false,
        authorId: user.id,
      });
      const res = await api
        .get(`${POSTS_URL}/${dbPost.id}/votes`)
        .set('Authorization', token);
      const resBody = res.body as VoteOnPost[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody.map((v) => v.id)).toStrictEqual(
        dbPost.votes.map((v) => v.id)
      );
    });

    it('should respond with 200 and all public post votes', async () => {
      const dbPost = await createPost(postFullData);
      const res = await api.get(`${POSTS_URL}/${dbPost.id}/votes`);
      const resBody = res.body as VoteOnPost[];
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody.map((v) => v.id)).toStrictEqual(
        dbPost.votes.map((v) => v.id)
      );
    });

    const populateDBForVoteSearch = async (published = true) => {
      const voteOne = { userId: dbUserTwo.id, isUpvote: false };
      const voteTwo = { userId: dbUserOne.id, isUpvote: true };
      const voteThree = { userId: dbXUser.id, isUpvote: true };
      const votes = [voteOne, voteTwo, voteThree];
      const postData = {
        ...postFullData,
        authorId: dbUserOne.id,
        published,
        votes,
      };
      const dbPost = await createPost(postData);
      return { dbPost, voteOne, voteTwo, voteThree };
    };

    it('should respond with an upvote array based on search by vote type', async () => {
      const { dbPost } = await populateDBForVoteSearch();
      const res = await api.get(
        `${POSTS_URL}/${dbPost.id}/votes?upvote=truthy`
      );
      const resBody = res.body as VoteOnPost[];
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(2);
      expect(resBody.every(({ isUpvote }) => isUpvote)).toBe(true);
    });

    it('should respond with an upvote array based on search by vote type', async () => {
      const { dbPost } = await populateDBForVoteSearch();
      const res = await api.get(
        `${POSTS_URL}/${dbPost.id}/votes?downvote=truthy`
      );
      const resBody = res.body as VoteOnPost[];
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      expect(resBody.every(({ isUpvote }) => !isUpvote)).toBe(true);
    });

    it('should respond with an empty vote array if the post is private and there is no JWT', async () => {
      const { dbPost } = await populateDBForVoteSearch(false);
      const res = await api.get(
        `${POSTS_URL}/${dbPost.id}/votes?upvote=truthy`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with an empty vote array if the post is private and there is non-post-author JWT', async () => {
      const { dbPost } = await populateDBForVoteSearch(false);
      const { authorizedApi } = await prepForAuthorizedTest(userTwoData);
      const res = await authorizedApi.get(
        `${POSTS_URL}/${dbPost.id}/votes?upvote=truthy`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with a upvote array if the post is private and there is post-author JWT', async () => {
      const { dbPost } = await populateDBForVoteSearch(false);
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(
        `${POSTS_URL}/${dbPost.id}/votes?upvote=truthy`
      );
      const resBody = res.body as VoteOnPost[];
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(2);
      expect(resBody.every(({ isUpvote }) => isUpvote)).toBe(true);
    });

    it('should respond with a downvote array if the post is private and there is post-author JWT', async () => {
      const { dbPost } = await populateDBForVoteSearch(false);
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      const res = await authorizedApi.get(
        `${POSTS_URL}/${dbPost.id}/votes?downvote=true`
      );
      const resBody = res.body as VoteOnPost[];
      expect(res.statusCode).toBe(200);
      expect(resBody.length).toBe(1);
      expect(resBody.every(({ isUpvote }) => !isUpvote)).toBe(true);
    });
  });

  describe('Counters', async () => {
    const { signedInUserData, authorizedApi } = await prepForAuthorizedTest(
      userOneData
    );

    describe(`GET ${POSTS_URL}/count`, () => {
      it('should respond with 401 on a request without JWT', async () => {
        const res = await api.get(`${POSTS_URL}/count`);
        expect(res.statusCode).toBe(401);
        expect(res.body).toStrictEqual({});
      });

      it('should respond with the count of posts for the current signed-in user', async () => {
        await createPost({ ...postDataOutput, authorId: dbUserOne.id });
        await createPost({ ...postDataOutput, authorId: dbUserOne.id });
        await createPost({ ...postDataOutput, authorId: dbUserTwo.id });
        const res = await authorizedApi.get(`${POSTS_URL}/count`);
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(res.body).toStrictEqual(2);
      });

      it('should respond with 0 the current signed-in user don not have any posts', async () => {
        const res = await authorizedApi.get(`${POSTS_URL}/count`);
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(res.body).toStrictEqual(0);
      });
    });

    describe(`GET ${POSTS_URL}/comments/count`, () => {
      it('should respond with 401 on a request without JWT', async () => {
        const res = await api.get(`${POSTS_URL}/comments/count`);
        expect(res.statusCode).toBe(401);
        expect(res.body).toStrictEqual({});
      });

      it('should respond with the count of comments for the current signed-in user', async () => {
        await createPost({ ...postFullData, authorId: dbUserOne.id });
        await createPost({ ...postFullData, authorId: dbUserOne.id });
        await createPost({ ...postFullData, authorId: dbUserTwo.id });
        const res = await authorizedApi.get(`${POSTS_URL}/comments/count`);
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(res.body).toStrictEqual(4);
      });

      it('should respond with 0 if the current signed-in user do not have any post comments', async () => {
        await createPost({ ...postDataOutput, authorId: dbUserOne.id });
        await createPost({ ...postFullData, authorId: dbUserTwo.id });
        const res = await authorizedApi.get(`${POSTS_URL}/comments/count`);
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(res.body).toStrictEqual(0);
      });
    });

    describe(`GET ${POSTS_URL}/votes/count`, () => {
      it('should respond with 401 on a request without JWT', async () => {
        const res = await api.get(`${POSTS_URL}/votes/count`);
        expect(res.statusCode).toBe(401);
        expect(res.body).toStrictEqual({});
      });

      it('should respond with the count of votes for the current signed-in user', async () => {
        await createPost({ ...postFullData, authorId: dbUserOne.id });
        await createPost({ ...postFullData, authorId: dbUserOne.id });
        await createPost({ ...postFullData, authorId: dbUserTwo.id });
        const res = await authorizedApi.get(`${POSTS_URL}/votes/count`);
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(res.body).toStrictEqual(4);
      });

      it('should respond with 0 if the current signed-in user do not have any post votes', async () => {
        await createPost({ ...postDataOutput, authorId: dbUserOne.id });
        await createPost({ ...postFullData, authorId: dbUserTwo.id });
        const res = await authorizedApi.get(`${POSTS_URL}/votes/count`);
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(res.body).toStrictEqual(0);
      });
    });

    describe(`GET ${POSTS_URL}/categories/count`, () => {
      it('should respond with 401 on a request without JWT', async () => {
        const res = await api.get(`${POSTS_URL}/categories/count`);
        expect(res.statusCode).toBe(401);
        expect(res.body).toStrictEqual({});
      });

      it('should respond with the count of categories for the current signed-in user', async () => {
        await createPost({ ...postFullData, authorId: dbUserOne.id });
        await createPost({ ...postFullData, authorId: dbUserOne.id });
        await createPost({ ...postFullData, authorId: dbUserTwo.id });
        const distinctCategories = new Set(postFullData.categories);
        const res = await authorizedApi.get(`${POSTS_URL}/categories/count`);
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(res.body).toStrictEqual(distinctCategories.size);
      });

      it('should respond with 0 if the current signed-in user do not have any post categories', async () => {
        await createPost({
          ...postDataOutput,
          categories: [],
          authorId: dbUserOne.id,
        });
        await createPost({ ...postFullData, authorId: dbUserTwo.id });
        const res = await authorizedApi.get(`${POSTS_URL}/categories/count`);
        expect(res.statusCode).toBe(200);
        expect(res.type).toMatch(/json/);
        expect(res.body).toStrictEqual(0);
      });
    });

    const createTestsForCountingPostCommentsOrCatsOrVotes = (type: string) => {
      return () => {
        it('should respond with 400 on invalid post id', async () => {
          const res = await api.get(`${POSTS_URL}/blahblah/${type}/count`);
          assertInvalidIdErrorRes(res);
        });

        it('should respond with 404 if the post is private and there is no JWT', async () => {
          const dbPost = await createPost({
            ...postFullData,
            published: false,
          });
          const res = await api.get(`${POSTS_URL}/${dbPost.id}/${type}/count`);
          assertNotFoundErrorRes(res);
        });

        it('should respond with 404 if the post is private and the JWT not for the post author', async () => {
          const { token } = await signin(
            userOneData.username,
            userOneData.password
          );
          const dbPost = await createPost({
            ...postFullData,
            published: false,
            authorId: dbUserTwo.id,
          });
          const res = await api
            .get(`${POSTS_URL}/${dbPost.id}/${type}/count`)
            .set('Authorization', token);
          assertNotFoundErrorRes(res);
        });

        it(`should respond with the count of the private post ${type} if the JWT for the post author`, async () => {
          const { token, user } = await signin(
            userOneData.username,
            userOneData.password
          );
          const dbPost = await createPost({
            ...postFullData,
            published: false,
            authorId: user.id,
          });
          const res = await api
            .get(`${POSTS_URL}/${dbPost.id}/${type}/count`)
            .set('Authorization', token);
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(res.body).toStrictEqual(2);
        });

        it(`should respond with 0 for a private post without ${type} if the JWT for the post author`, async () => {
          const { token, user } = await signin(
            userOneData.username,
            userOneData.password
          );
          const dbPost = await createPost({
            ...postDataOutput,
            [type]: [],
            published: false,
            authorId: user.id,
          });
          const res = await api
            .get(`${POSTS_URL}/${dbPost.id}/${type}/count`)
            .set('Authorization', token);
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(res.body).toStrictEqual(0);
        });

        it(`should respond with the count of a public post ${type}`, async () => {
          const dbPost = await createPost(postFullData);
          const res = await api.get(`${POSTS_URL}/${dbPost.id}/${type}/count`);
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(res.body).toStrictEqual(2);
        });

        it(`should respond with 0 for a public post without any ${type}`, async () => {
          const dbPost = await createPost({
            ...postDataOutput,
            [type]: [],
            authorId: signedInUserData.user.id,
          });
          const res = await api.get(`${POSTS_URL}/${dbPost.id}/${type}/count`);
          expect(res.statusCode).toBe(200);
          expect(res.type).toMatch(/json/);
          expect(res.body).toStrictEqual(0);
        });
      };
    };

    describe(
      `GET ${POSTS_URL}/:id/categories/count`,
      createTestsForCountingPostCommentsOrCatsOrVotes('categories')
    );

    describe(
      `GET ${POSTS_URL}/:id/comments/count`,
      createTestsForCountingPostCommentsOrCatsOrVotes('comments')
    );

    describe(
      `GET ${POSTS_URL}/:id/votes/count`,
      createTestsForCountingPostCommentsOrCatsOrVotes('votes')
    );
  });
});

import {
  PublicImage,
  AuthResponse,
  PostFullData,
  AppErrorResponse,
  NewPostParsedData,
} from '../../types';
import { fieldsToIncludeWithPost } from '../../lib/helpers';
import { Prisma } from '../../../prisma/generated/client';
import { SALT } from '../../lib/config';
import { expect } from 'vitest';
import { ZodIssue } from 'zod';
import app from '../../app';
import path from 'node:path';
import db from '../../lib/db';
import bcrypt from 'bcryptjs';
import supertest from 'supertest';

export const setup = async (signinUrl: string) => {
  const api = supertest(app);

  const deleteAllPosts = async () => await db.post.deleteMany({});
  const deleteAllUsers = async () => await db.user.deleteMany({});
  const deleteAllImages = async () => await db.image.deleteMany({});

  const createUser = async (data: Prisma.UserCreateInput) => {
    const password = bcrypt.hashSync(data.password, SALT);
    return await db.user.create({
      data: { ...data, password },
      omit: { password: false, isAdmin: false },
    });
  };

  const signin = async (username: string, password: string) => {
    const signinRes = await api.post(signinUrl).send({ username, password });
    return signinRes.body as AuthResponse;
  };

  const userData = {
    bio: 'Coming from krypton with super power.',
    fullname: 'Clark Kent/Kal-El',
    username: 'superman',
    password: 'Ss@12312',
  };
  const newUserData = { ...userData, confirm: userData.password };
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
  const dbAdmin = await createUser(adminData);
  const dbXUser = await createUser(xUserData);

  const imgOne: Prisma.ImageCreateWithoutOwnerInput & { ownerId: string } = {
    storageFullPath: 'full-path-1.jpg',
    storageId: 'storage-id-1',
    mimetype: 'image/jpeg',
    ownerId: dbUserOne.id,
    src: 'src-1.jpg',
    size: 2000000,
  };

  const imgTwo: typeof imgOne = {
    storageFullPath: 'full-path-2.jpg',
    storageId: 'storage-id-2',
    mimetype: 'image/jpeg',
    ownerId: dbUserTwo.id,
    src: 'src-2.jpg',
    alt: 'img-alt-2',
    size: 1250000,
  };

  const createImage = async (imageData: Prisma.ImageCreateManyInput) => {
    return await db.image.upsert({
      where: { src: imageData.src },
      create: imageData,
      update: imageData,
    });
  };

  const createManyImages = async (imageData: Prisma.ImageCreateManyInput[]) => {
    return await db.image.createMany({ data: imageData });
  };

  const postDataInput: NewPostParsedData = {
    published: true,
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
        imageId: data.image,
        content: data.content,
        authorId: data.authorId,
        published: data.published,
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
      include: fieldsToIncludeWithPost,
    });
  };

  const assertImageData = (
    res: supertest.Response,
    expected: typeof imgOne
  ) => {
    const resBody = res.body as PublicImage;
    expect(res.type).toMatch(/json/);
    // eslint-disable-next-line security/detect-non-literal-regexp
    expect(resBody.src).toMatch(new RegExp(`${path.extname(expected.src)}$`));
    expect(resBody.alt).toStrictEqual(expected.alt ?? '');
  };

  const assertPostData = (
    actualPost: PostFullData,
    expectedPost: typeof postFullData & { image?: string }
  ) => {
    expect(actualPost.title).toBe(expectedPost.title);
    expect(actualPost.content).toBe(expectedPost.content);
    expect(actualPost.authorId).toBe(expectedPost.authorId);
    expect(actualPost.published).toBe(expectedPost.published);
    expect(actualPost.imageId).toStrictEqual(expectedPost.image ?? null);
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

  const prepForAuthorizedTest = async (credentials: {
    username: string;
    password: string;
  }) => {
    const signedInUserData = await signin(
      credentials.username,
      credentials.password
    );
    const authorizedApi = supertest
      .agent(app)
      .set('Authorization', signedInUserData.token);
    return { signedInUserData, authorizedApi };
  };

  const assertErrorRes = (
    res: supertest.Response,
    expected: RegExp | string
  ) => {
    const resBody = res.body as AppErrorResponse;
    expect(res.statusCode).toBe(400);
    expect(res.type).toMatch(/json/);
    expect(resBody.error.message).toMatch(expected);
  };

  const assertNotFoundErrorRes = (res: supertest.Response) => {
    const resBody = res.body as AppErrorResponse;
    expect(res.statusCode).toBe(404);
    expect(res.type).toMatch(/json/);
    expect(resBody.error.message).toMatch(/not found/i);
  };

  const assertInvalidIdErrorRes = (res: supertest.Response) => {
    const resBody = res.body as AppErrorResponse;
    expect(res.statusCode).toBe(400);
    expect(res.type).toMatch(/json/);
    expect(resBody.error.message).toMatch(/^.* ?id ?.*$/i);
    expect(resBody.error.message).toMatch(/invalid/i);
  };

  const assertUnauthorizedErrorRes = (res: supertest.Response) => {
    expect(res.statusCode).toBe(401);
    expect(res.body).toStrictEqual({});
  };

  const assertResponseWithValidationError = (
    res: supertest.Response,
    issueField: string
  ) => {
    const issues = res.body as ZodIssue[];
    expect(res.type).toMatch(/json/);
    expect(res.statusCode).toBe(400);
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toContain(issueField);
  };

  return {
    postDataOutput,
    postDataInput,
    postFullData,
    userOneData,
    userTwoData,
    commentData,
    newUserData,
    adminData,
    xUserData,
    dbUserOne,
    dbUserTwo,
    userData,
    dbAdmin,
    dbXUser,
    imgOne,
    imgTwo,
    api,
    signin,
    createUser,
    createPost,
    createImage,
    deleteAllPosts,
    deleteAllUsers,
    assertPostData,
    assertErrorRes,
    assertImageData,
    deleteAllImages,
    createManyImages,
    prepForAuthorizedTest,
    assertNotFoundErrorRes,
    assertInvalidIdErrorRes,
    assertUnauthorizedErrorRes,
    assertResponseWithValidationError,
  };
};

export default setup;

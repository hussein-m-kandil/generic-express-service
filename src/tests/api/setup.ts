import * as API from '@/api';
import * as Types from '@/types';
import * as Image from '@/lib/image';
import * as Utils from '@/lib/utils';
import * as Middlewares from '@/middlewares';
import { default as express } from 'express';
import { Prisma } from '@/../prisma/client';
import { App } from 'supertest/types';
import { BASE_URL } from './v1/utils';
import { expect, vi } from 'vitest';
import { z } from 'zod';
import db from '@/lib/db';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import supertest from 'supertest';

const storageData = vi.hoisted(() => {
  const uploadedData = {
    fullPath: 'test-file-full-path.jpg',
    path: 'test-file-path.jpg',
    id: 'test-file-id',
  };
  const uploadRes = { data: uploadedData, error: null };
  const removeRes = { data: [], error: null };
  const remove = vi.fn(
    () => new Promise((resolve) => setImmediate(() => resolve(removeRes)))
  );
  const upload = vi.fn(
    () => new Promise((resolve) => setImmediate(() => resolve(uploadRes)))
  );
  const from = vi.fn(() => ({ upload, remove }));
  const storage = { client: { from }, upload, remove };
  return { uploadedData, uploadRes, removeRes, storage };
});

vi.mock('@supabase/supabase-js', () => {
  const storage = storageData.storage.client;
  return { createClient: vi.fn(() => ({ storage })) };
});

const app = express()
  .use(express.json())
  .use(BASE_URL, API.V1.apiRouter)
  .use(Middlewares.errorHandler);

export const setup = async (signinUrl: string, expApp: App = app) => {
  const api = supertest(expApp);

  const deleteAllPosts = async () => await db.post.deleteMany({});
  const deleteAllUsers = async () => await db.user.deleteMany({});
  const deleteAllImages = async () => await db.image.deleteMany({});
  const deleteAllTags = async () => await db.tag.deleteMany({});

  const createUser = async (data: Prisma.UserCreateInput) => {
    const password = bcrypt.hashSync(data.password, 10);
    return await db.user.create({
      omit: { password: false, isAdmin: false },
      include: { avatar: true, images: true },
      data: { ...data, password },
    });
  };

  const signin = async (username: string, password: string) => {
    const signinRes = await api.post(signinUrl).send({ username, password });
    return signinRes.body as Types.AuthResponse;
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
    height: 2048,
    width: 2048,
  };

  const imgTwo: typeof imgOne = {
    storageFullPath: 'full-path-2.jpg',
    storageId: 'storage-id-2',
    mimetype: 'image/jpeg',
    ownerId: dbUserTwo.id,
    src: 'src-2.jpg',
    alt: 'img-alt-2',
    size: 1250000,
    height: 2048,
    width: 2048,
  };

  const imagedata = {
    info: 'blah blah blah...',
    alt: 'test-img-alt',
    scale: 1.25,
    xPos: 10,
    yPos: 25,
  };

  const imgData = {
    ...imgOne,
    ...imagedata,
  };

  const createImage = async (imageData: Prisma.ImageCreateManyInput) => {
    return await db.image.upsert({
      include: Image.FIELDS_TO_INCLUDE,
      where: { src: imageData.src },
      create: imageData,
      update: imageData,
    });
  };

  const createManyImages = async (imageData: Prisma.ImageCreateManyInput[]) => {
    return await db.image.createMany({ data: imageData });
  };

  const postDataInput: Types.NewPostParsedData = {
    published: true,
    title: 'Test Post',
    content: 'Test post content...',
    tags: ['comedy', 'fantasy'],
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
        tags: {
          create: data.tags.map((name) => ({
            tag: {
              connectOrCreate: { where: { name }, create: { name } },
            },
          })),
        },
      },
      include: Utils.fieldsToIncludeWithPost,
    });
  };

  const assertImageData = (
    res: supertest.Response,
    expected: typeof imgOne
  ) => {
    const resBody = res.body as Types.PublicImage;
    expect(res.type).toMatch(/json/);
    // eslint-disable-next-line security/detect-non-literal-regexp
    expect(resBody.src).toMatch(new RegExp(`${path.extname(expected.src)}$`));
    expect(resBody.info).toStrictEqual(expected.info ?? '');
    expect(resBody.alt).toStrictEqual(expected.alt ?? '');
    expect(resBody.scale).toBe(expected.scale ?? 1.0);
    expect(resBody.mimetype).toBe(expected.mimetype);
    expect(resBody.xPos).toBe(expected.xPos ?? 0);
    expect(resBody.yPos).toBe(expected.yPos ?? 0);
    expect(resBody.height).toBe(expected.height);
    expect(resBody.width).toBe(expected.width);
  };

  const assertPostData = (
    actualPost: Types.PostFullData,
    expectedPost: typeof postFullData & { image?: string }
  ) => {
    expect(actualPost.title).toBe(expectedPost.title);
    expect(actualPost.content).toBe(expectedPost.content);
    expect(actualPost.authorId).toBe(expectedPost.authorId);
    expect(actualPost.published).toBe(expectedPost.published);
    expect(actualPost.imageId).toStrictEqual(expectedPost.image ?? null);
    expect(actualPost.comments.length).toBe(expectedPost.comments.length);
    expect(actualPost.tags.length).toBe(expectedPost.tags.length);
    expect(actualPost.tags.map(({ name }) => name.toLowerCase())).toStrictEqual(
      expectedPost.tags.map((c) => c.toLowerCase())
    );
    expect(
      actualPost.comments.map(({ authorId, content }) => ({
        authorId,
        content,
      }))
    ).toStrictEqual(expectedPost.comments);
    expect(actualPost._count.comments).toBe(expectedPost.comments.length);
    expect(actualPost._count.votes).toBe(expectedPost.votes.length);
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
    const resBody = res.body as Types.AppErrorResponse;
    expect(res.statusCode).toBe(400);
    expect(res.type).toMatch(/json/);
    expect(resBody.error.message).toMatch(expected);
  };

  const assertNotFoundErrorRes = (res: supertest.Response) => {
    const resBody = res.body as Types.AppErrorResponse;
    expect(res.statusCode).toBe(404);
    expect(res.type).toMatch(/json/);
    expect(resBody.error.message).toMatch(/not found/i);
  };

  const assertInvalidIdErrorRes = (res: supertest.Response) => {
    const resBody = res.body as Types.AppErrorResponse;
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
    const issues = res.body as z.ZodIssue[];
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
    storageData,
    adminData,
    xUserData,
    dbUserOne,
    dbUserTwo,
    imagedata,
    userData,
    dbAdmin,
    dbXUser,
    imgData,
    imgOne,
    imgTwo,
    api,
    signin,
    createUser,
    createPost,
    createImage,
    deleteAllTags,
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

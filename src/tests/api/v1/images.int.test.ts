import {
  vi,
  it,
  expect,
  describe,
  afterAll,
  afterEach,
  beforeEach,
} from 'vitest';
import { AppErrorResponse } from '../../../types';
import { IMAGES_URL, SIGNIN_URL } from './utils';
import setup from '../setup';
import fs from 'node:fs';

vi.mock('@supabase/supabase-js', () => {
  const data = {
    fullPath: 'test-file-full-path.jpg',
    path: 'test-file-path.jpg',
    id: 'test-file-id',
  };
  const supabase = {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(
          () =>
            new Promise((resolve) =>
              setImmediate(() => resolve({ data, error: null }))
            )
        ),
      })),
    },
  };
  return { createClient: vi.fn(() => supabase) };
});

describe('Images endpoint', async () => {
  const {
    api,
    imgOne,
    imgTwo,
    userOneData,
    createImage,
    deleteAllUsers,
    deleteAllImages,
    createManyImages,
    prepForAuthorizedTest,
    assertNotFoundErrorRes,
    assertInvalidIdErrorRes,
    assertUnauthorizedErrorRes,
  } = await setup(SIGNIN_URL);

  beforeEach(async () => await deleteAllImages());

  afterAll(async () => {
    await deleteAllImages();
    await deleteAllUsers();
  });

  describe(`GET ${IMAGES_URL}`, () => {
    it('should respond with an empty array', async () => {
      const res = await api.get(IMAGES_URL);
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(res.body).toStrictEqual([]);
    });

    it('should respond with an array of image objects', async () => {
      await createManyImages([imgOne, imgTwo]);
      const res = await api.get(IMAGES_URL);
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(res.body).toHaveLength(2);
    });
  });

  describe(`GET ${IMAGES_URL}/:id`, () => {
    const randImgId = crypto.randomUUID();

    it('should respond with 404', async () => {
      const res = await api.get(`${IMAGES_URL}/${randImgId}`);
      assertNotFoundErrorRes(res);
    });

    it('should respond with 400 on invalid id', async () => {
      const res = await api.get(`${IMAGES_URL}/${randImgId}x_@`);
      assertInvalidIdErrorRes(res);
    });

    it('should respond with an image object', async () => {
      const dbImg = await createImage(imgOne);
      const res = await api.get(`${IMAGES_URL}/${dbImg.id}`);
      const resBody = res.body as { src: string; alt: string };
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody.src).toStrictEqual(imgOne.src);
      expect(resBody.alt).toStrictEqual(imgOne.alt);
    });
  });

  describe(`POST ${IMAGES_URL}`, () => {
    let stream: fs.ReadStream | undefined;

    afterEach(() => {
      if (stream && !stream.destroyed) stream.destroy();
    });

    it('should respond with 401 on unauthorized request', async () => {
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await api.post(IMAGES_URL).attach('image', stream);
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 400 on request with too large image', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      stream = fs.createReadStream('src/tests/files/bad.jpg');
      const res = await authorizedApi.post(IMAGES_URL).attach('image', stream);
      const resBody = res.body as AppErrorResponse;
      expect(res.statusCode).toBe(400);
      expect(res.type).toMatch(/json/);
      expect(resBody.error.message).toMatch(/too large/i);
    });

    it('should respond with 400 on request with invalid image type', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      stream = fs.createReadStream('src/tests/files/ugly.txt');
      const res = await authorizedApi.post(IMAGES_URL).attach('image', stream);
      const resBody = res.body as AppErrorResponse;
      expect(res.statusCode).toBe(400);
      expect(res.type).toMatch(/json/);
      expect(resBody.error.message).toMatch(/invalid image/i);
    });

    it('should upload an image', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi.post(IMAGES_URL).attach('image', stream);
      const resBody = res.body as { src: string; alt: string };
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(resBody.alt).toStrictEqual('');
      expect(resBody.src).toMatch(/\.jpg$/);
    });

    it('should upload an image with an alt', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userOneData);
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const alt = 'test-img-alt';
      const res = await authorizedApi
        .post(IMAGES_URL)
        .field('alt', alt)
        .attach('image', stream);
      const resBody = res.body as { src: string; alt: string };
      expect(res.statusCode).toBe(201);
      expect(res.type).toMatch(/json/);
      expect(resBody.alt).toStrictEqual(alt);
      expect(resBody.src).toMatch(/\.jpg$/);
    });
  });
});

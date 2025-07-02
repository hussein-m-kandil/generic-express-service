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

const { storage, upload, remove } = vi.hoisted(() => {
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
  const storage = { from };
  return { uploadedData, uploadRes, removeRes, storage, upload, remove, from };
});

vi.mock('@supabase/supabase-js', () => {
  return { createClient: vi.fn(() => ({ storage })) };
});

describe('Images endpoint', async () => {
  const {
    api,
    imgOne,
    imgTwo,
    adminData,
    userOneData,
    userTwoData,
    createImage,
    assertErrorRes,
    deleteAllUsers,
    deleteAllImages,
    assertImageData,
    createManyImages,
    prepForAuthorizedTest,
    assertNotFoundErrorRes,
    assertInvalidIdErrorRes,
    assertUnauthorizedErrorRes,
  } = await setup(SIGNIN_URL);

  const { authorizedApi } = await prepForAuthorizedTest(userOneData);

  let url: string;
  const prepImageUrl = async () => {
    const dbImg = await createImage(imgOne);
    url = `${IMAGES_URL}/${dbImg.id}`;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await deleteAllImages();
  });

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
      url = `${IMAGES_URL}/${randImgId}`;
      const res = await api.get(url);
      assertNotFoundErrorRes(res);
    });

    it('should respond with 400 on invalid id', async () => {
      url = `${IMAGES_URL}/${randImgId}x_@`;
      const res = await api.get(url);
      assertInvalidIdErrorRes(res);
    });

    it('should respond with an image object', async () => {
      await prepImageUrl();
      const res = await api.get(url);
      const resBody = res.body as { src: string; alt: string };
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(resBody.src).toStrictEqual(imgOne.src);
      expect(resBody.alt).toStrictEqual(imgOne.alt ?? '');
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
      stream = fs.createReadStream('src/tests/files/bad.jpg');
      const res = await authorizedApi.post(IMAGES_URL).attach('image', stream);
      const resBody = res.body as AppErrorResponse;
      expect(res.statusCode).toBe(400);
      expect(res.type).toMatch(/json/);
      expect(resBody.error.message).toMatch(/too large/i);
    });

    it('should respond with 400 on request with invalid image type', async () => {
      stream = fs.createReadStream('src/tests/files/ugly.txt');
      const res = await authorizedApi.post(IMAGES_URL).attach('image', stream);
      const resBody = res.body as AppErrorResponse;
      expect(res.statusCode).toBe(400);
      expect(res.type).toMatch(/json/);
      expect(resBody.error.message).toMatch(/invalid image/i);
    });

    it('should upload the image', async () => {
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi.post(IMAGES_URL).attach('image', stream);
      expect(res.statusCode).toBe(201);
      assertImageData(res, imgOne);
      expect(upload).toHaveBeenCalledOnce();
      expect(upload.mock.calls.at(-1)?.at(-1)).toHaveProperty('upsert', false);
    });

    it('should upload the image with alt', async () => {
      const imgData = { ...imgOne, alt: 'test-img-alt' };
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi
        .post(IMAGES_URL)
        .field('alt', imgData.alt)
        .attach('image', stream);
      expect(res.statusCode).toBe(201);
      assertImageData(res, imgData);
      expect(upload).toHaveBeenCalledOnce();
      expect(upload.mock.calls.at(-1)?.at(-1)).toHaveProperty('upsert', false);
    });
  });

  describe(`PUT ${IMAGES_URL}/:id`, () => {
    let stream: fs.ReadStream | undefined;

    afterEach(() => {
      if (stream && !stream.destroyed) stream.destroy();
    });

    beforeEach(prepImageUrl);

    it('should respond with 401 on unauthorized request', async () => {
      const res = await api.put(url).send();
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 401 if the current user is not the image owner', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userTwoData);
      const res = await authorizedApi.put(url).send();
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 404', async () => {
      const res = await authorizedApi
        .put(`${IMAGES_URL}/${crypto.randomUUID()}`)
        .send();
      assertNotFoundErrorRes(res);
    });

    it('should respond with 400 on request with too large image', async () => {
      stream = fs.createReadStream('src/tests/files/bad.jpg');
      const res = await authorizedApi.put(url).attach('image', stream);
      assertErrorRes(res, /too large/i);
    });

    it('should respond with 400 on request with invalid image type', async () => {
      stream = fs.createReadStream('src/tests/files/ugly.txt');
      const res = await authorizedApi.put(url).attach('image', stream);
      assertErrorRes(res, /invalid image/i);
    });

    it('should update the image', async () => {
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi.put(url).attach('image', stream);
      expect(res.statusCode).toBe(200);
      assertImageData(res, imgOne);
      expect(upload).toHaveBeenCalledOnce();
      expect(upload.mock.calls.at(-1)?.at(-1)).toHaveProperty('upsert', true);
    });

    it('should update the image with alt', async () => {
      const imgData = { ...imgOne, alt: 'test-img-alt' };
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi
        .put(url)
        .field('alt', imgData.alt)
        .attach('image', stream);
      expect(res.statusCode).toBe(200);
      assertImageData(res, imgData);
      expect(upload).toHaveBeenCalledOnce();
      expect(upload.mock.calls.at(-1)?.at(-1)).toHaveProperty('upsert', true);
    });

    it('should update the alt only', async () => {
      const res = await authorizedApi.put(url).send({ alt: imgTwo.alt });
      expect(res.statusCode).toBe(200);
      assertImageData(res, imgTwo);
      expect(upload).not.toHaveBeenCalledOnce();
    });

    it('should not change a defined alt value into undefined', async () => {
      const imgData = { ...imgOne, alt: 'test', src: 'test.webp' };
      const dbImg = await createImage(imgData);
      const res = await authorizedApi.put(`${IMAGES_URL}/${dbImg.id}`).send({});
      expect(res.statusCode).toBe(200);
      assertImageData(res, imgData);
      expect(upload).not.toHaveBeenCalledOnce();
    });
  });

  describe(`Delete ${IMAGES_URL}/:id`, () => {
    beforeEach(prepImageUrl);

    it('should respond with 401 on unauthorized request', async () => {
      const res = await api.delete(url).send();
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 401 if the current user is not the image owner', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(userTwoData);
      const res = await authorizedApi.delete(url).send();
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with 404', async () => {
      const res = await authorizedApi
        .delete(`${IMAGES_URL}/${crypto.randomUUID()}`)
        .send();
      assertNotFoundErrorRes(res);
    });

    it('should the image owner delete the image', async () => {
      const res = await authorizedApi.delete(url).send();
      expect(res.statusCode).toBe(204);
      expect(remove).toHaveBeenCalledOnce();
    });

    it('should the admin delete the image', async () => {
      const { authorizedApi } = await prepForAuthorizedTest(adminData);
      const res = await authorizedApi.delete(url).send();
      expect(res.statusCode).toBe(204);
      expect(remove).toHaveBeenCalledOnce();
    });
  });
});

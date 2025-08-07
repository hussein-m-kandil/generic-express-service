import {
  vi,
  it,
  expect,
  describe,
  afterAll,
  afterEach,
  beforeEach,
} from 'vitest';
import { AppErrorResponse } from '@/types';
import { IMAGES_URL, SIGNIN_URL } from './utils';
import setup from '../setup';
import fs from 'node:fs';

describe('Images endpoint', async () => {
  const {
    api,
    imgOne,
    imgTwo,
    imgData,
    adminData,
    userOneData,
    userTwoData,
    storageData,
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
    assertResponseWithValidationError,
  } = await setup(SIGNIN_URL);

  const {
    storage: { upload, remove },
  } = storageData;

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

    it('should upload the image with data', async () => {
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi
        .post(IMAGES_URL)
        .field('scale', imgData.scale)
        .field('xPos', imgData.xPos)
        .field('yPos', imgData.yPos)
        .field('alt', imgData.alt)
        .attach('image', stream);
      expect(res.statusCode).toBe(201);
      assertImageData(res, imgData);
      expect(upload).toHaveBeenCalledOnce();
      expect(upload.mock.calls.at(-1)?.at(-1)).toHaveProperty('upsert', false);
    });

    it('should upload the image with data and truncate the given position values', async () => {
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi
        .post(IMAGES_URL)
        .field('xPos', imgData.xPos + 0.25)
        .field('yPos', imgData.yPos + 0.75)
        .field('scale', imgData.scale)
        .field('alt', imgData.alt)
        .attach('image', stream);
      expect(res.statusCode).toBe(201);
      assertImageData(res, imgData);
    });

    it('should upload the image with extra info', async () => {
      const info = 'Extra info...';
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi
        .post(IMAGES_URL)
        .field('info', info)
        .attach('image', stream);
      expect(res.statusCode).toBe(201);
      assertImageData(res, { ...imgOne, info });
      expect(upload).toHaveBeenCalledOnce();
      expect(upload.mock.calls.at(-1)?.at(-1)).toHaveProperty('upsert', false);
    });

    it('should not upload the image with invalid `xPos` type', async () => {
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi
        .post(IMAGES_URL)
        .field('xPos', '25px')
        .attach('image', stream);
      assertResponseWithValidationError(res, 'xPos');
      expect(upload).not.toHaveBeenCalledOnce();
    });

    it('should not upload the image with invalid `yPos` type', async () => {
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi
        .post(IMAGES_URL)
        .field('yPos', '25px')
        .attach('image', stream);
      assertResponseWithValidationError(res, 'yPos');
      expect(upload).not.toHaveBeenCalledOnce();
    });

    it('should not upload the image with invalid `scale` type', async () => {
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi
        .post(IMAGES_URL)
        .field('scale', '125%')
        .attach('image', stream);
      assertResponseWithValidationError(res, 'scale');
      expect(upload).not.toHaveBeenCalledOnce();
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

    it('should update the image with data', async () => {
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi
        .put(url)
        .field('scale', imgData.scale)
        .field('xPos', imgData.xPos)
        .field('yPos', imgData.yPos)
        .field('alt', imgData.alt)
        .attach('image', stream);
      expect(res.statusCode).toBe(200);
      assertImageData(res, imgData);
      expect(upload).toHaveBeenCalledOnce();
      expect(upload.mock.calls.at(-1)?.at(-1)).toHaveProperty('upsert', true);
    });

    it('should update the image with data and truncate the given position values', async () => {
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi
        .put(url)
        .field('xPos', imgData.xPos + 0.25)
        .field('yPos', imgData.yPos + 0.75)
        .field('scale', imgData.scale)
        .field('alt', imgData.alt)
        .attach('image', stream);
      expect(res.statusCode).toBe(200);
      assertImageData(res, imgData);
    });

    it('should update only the data', async () => {
      const res = await authorizedApi.put(url).send(imgData);
      expect(res.statusCode).toBe(200);
      assertImageData(res, { ...imgOne, ...imgData });
      expect(upload).not.toHaveBeenCalledOnce();
    });

    it('should not change a defined data values into undefined', async () => {
      const extImgData = { ...imgData, info: 'Extra info...' };
      const dbImg = await createImage(extImgData);
      const res = await authorizedApi.put(`${IMAGES_URL}/${dbImg.id}`).send({});
      expect(res.statusCode).toBe(200);
      assertImageData(res, extImgData);
      expect(upload).not.toHaveBeenCalledOnce();
    });

    it('should update the image extra info', async () => {
      const info = 'Extra info...';
      const res = await authorizedApi.put(url).send({ info });
      expect(res.statusCode).toBe(200);
      assertImageData(res, { ...imgOne, info });
      expect(upload).not.toHaveBeenCalledOnce();
    });

    it('should not update the image with invalid `xPos` type', async () => {
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi
        .put(url)
        .field('xPos', '25px')
        .attach('image', stream);
      assertResponseWithValidationError(res, 'xPos');
      expect(upload).not.toHaveBeenCalledOnce();
    });

    it('should not update the image with invalid `yPos` type', async () => {
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi
        .put(url)
        .field('yPos', '25px')
        .attach('image', stream);
      assertResponseWithValidationError(res, 'yPos');
      expect(upload).not.toHaveBeenCalledOnce();
    });

    it('should not update the image with invalid `scale` type', async () => {
      stream = fs.createReadStream('src/tests/files/good.jpg');
      const res = await authorizedApi
        .put(url)
        .field('scale', '125%')
        .attach('image', stream);
      assertResponseWithValidationError(res, 'scale');
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

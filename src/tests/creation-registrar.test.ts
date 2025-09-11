/* eslint-disable security/detect-object-injection */
/* eslint-disable security/detect-unsafe-regex */
import { creationRegistrar, CreationRegistrarError } from '@/middlewares';
import { afterEach, describe, expect, it, Mock, vi } from 'vitest';
import { Model } from '@/../prisma/client';
import supertest from 'supertest';
import logger from '@/lib/logger';
import express from 'express';
import db from '@/lib/db';

const sleep = (timeout = 500) => {
  if (timeout < 100) timeout = 100;
  return vi.waitUntil(
    () =>
      new Promise((resolve) => setTimeout(() => resolve(true), timeout - 50)),
    { timeout: 500 }
  );
};

vi.mock('@/lib/logger', async (importOriginal) => {
  const originalModule = await importOriginal<
    Awaited<typeof import('@/lib/logger')>
  >();
  const methods: ('info' | 'warn' | 'error' | 'warning')[] = [];
  methods.push('info', 'warn', 'error', 'warning');
  for (const m of methods) {
    const mock = vi.fn();
    originalModule.default[m] = mock;
    originalModule.logger[m] = mock;
  }
  return originalModule;
});

const user = { username: 'test_user', fullname: 'Test User', isAdmin: false };
const token = 'test-token';

const app = express()
  .use(creationRegistrar)
  .all(/^\/unauthenticated(\/.+)?$/, (req, res) => {
    res.json(null);
  })
  .all(
    /^\/authenticated(\/.+)?$/,
    (req, res, next) => {
      req.user = user;
      next();
    },
    (req, res) => {
      res.json({ token, user });
    }
  );

const api = supertest(app);

describe('Creation registrar', () => {
  afterEach(async () => {
    vi.clearAllMocks();
    await db.creation.deleteMany({});
  });

  it('should throw error on unauthenticated POST request, or created user not body', async () => {
    const endpoints: [string, RegExp][] = [
      ['/unauthenticated', /authenticated/i],
      ['/unauthenticated/users', /created user/i],
    ];
    for (let i = 0; i < endpoints.length; i++) {
      const [url, errMsgRegex] = endpoints[i];
      const res = await api.post(url);
      await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(i + 1));
      const creations = await db.creation.findMany({});
      const errorLoggerMock = (logger.error as Mock).mock;
      const errObj = errorLoggerMock.calls[i][0] as Error;
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(creations).toHaveLength(0);
      expect(errObj.message).toMatch(errMsgRegex);
      expect(errObj).toBeInstanceOf(CreationRegistrarError);
    }
  });

  it('should do nothing on any request method other than post', async () => {
    const methods: ('delete' | 'patch' | 'put' | 'get')[] = [];
    methods.push('delete', 'patch', 'put', 'get');
    for (const m of methods) {
      const res = await api[m]('/unauthenticated');
      await sleep();
      const creations = await db.creation.findMany({});
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(creations).toHaveLength(0);
      expect(logger.error).not.toHaveBeenCalled();
    }
  });

  it('should do nothing on an auth POST request', async () => {
    const res = await api.post('/unauthenticated/auth');
    await sleep();
    const creations = await db.creation.findMany({});
    expect(res.statusCode).toBe(200);
    expect(res.type).toMatch(/json/);
    expect(creations).toHaveLength(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should not register a creation if there is no relevant model', async () => {
    const models = ['FOO', 'BAR', 'TAR'];
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const res = await api.post(`/authenticated/${model.toLowerCase()}s`);
      await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(i + 1));
      const creations = await db.creation.findMany({});
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(creations).toHaveLength(0);
      expect(logger.error).not.toHaveBeenCalled();
    }
  });

  it('should register a creation for each relevant model', async () => {
    const models = Object.values(Model);
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const res = await api.post(`/authenticated/${model.toLowerCase()}s`);
      let creations: Awaited<ReturnType<typeof db.creation.findMany>> = [];
      await vi.waitUntil(async () => {
        creations = await db.creation.findMany({});
        return creations.length > i;
      });
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(creations).toHaveLength(i + 1);
      expect(creations[i].model).toBe(model);
      expect(creations[i].isAdmin).toBe(user.isAdmin);
      expect(creations[i].username).toBe(user.username);
      expect(logger.error).not.toHaveBeenCalled();
    }
  });
});

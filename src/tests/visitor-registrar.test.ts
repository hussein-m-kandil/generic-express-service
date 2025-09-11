/* eslint-disable security/detect-non-literal-regexp */
/* eslint-disable security/detect-object-injection */
import {
  visitorsRegistrar,
  BROWSER_COOKIE_NAME,
  VISITOR_COOKIE_NAME,
} from '@/middlewares';
import { default as express, NextFunction, Request, Response } from 'express';
import { default as supertest, Response as TestResponse } from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import cookieParser from 'cookie-parser';
import db from '@/lib/db';

const getResCookies = (res: TestResponse) => {
  return (res.headers as Record<string, unknown>)['set-cookie'] as string[];
};

const requestHandler = (req: Request, res: Response) => {
  res.json(null);
};

let thrownError = new Error('');

const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  thrownError = error;
  next(error);
};

const middlewares = [
  cookieParser(),
  visitorsRegistrar,
  requestHandler,
  errorHandler,
];

const api = supertest(express().use(middlewares));

describe('Visitor registrar', () => {
  afterEach(async () => {
    await db.visitor.deleteMany({});
  });

  it('should throw error if the `req` object does not has `cookies` object', async () => {
    const api = supertest(express().use(middlewares.slice(1)));
    await api.get('/');
    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError.message).toMatch(/cookie-parser/);
  });

  it('should not register new visitor, nor set registered cookie on non-GET request', async () => {
    const methods: ('delete' | 'patch' | 'post' | 'put')[] = [];
    methods.push('delete', 'patch', 'post', 'put');
    for (const m of methods) {
      const res = await api[m]('/').set('Cookie', `${BROWSER_COOKIE_NAME}=foo`);
      const resCookies = getResCookies(res);
      const visitors = await db.visitor.findMany({});
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(visitors).toHaveLength(0);
      expect(resCookies).toHaveLength(1);
      expect(resCookies[0]).toMatch(new RegExp(`^${BROWSER_COOKIE_NAME}=.+`));
    }
  });

  it('should not register new visitor, nor set registered cookie on an auth GET request', async () => {
    const res = await api
      .get('/foo/bar/auth/tar')
      .set('Cookie', `${BROWSER_COOKIE_NAME}=foo`);
    const resCookies = getResCookies(res);
    const visitors = await db.visitor.findMany({});
    expect(res.statusCode).toBe(200);
    expect(res.type).toMatch(/json/);
    expect(visitors).toHaveLength(0);
    expect(resCookies).toHaveLength(1);
    expect(resCookies[0]).toMatch(new RegExp(`^${BROWSER_COOKIE_NAME}=.+`));
  });

  it('should not register new visitor, nor set registered cookie on an GET request without the browser cookie', async () => {
    const res = await api.get('/foo/bar/auth/tar');
    const resCookies = getResCookies(res);
    const visitors = await db.visitor.findMany({});
    expect(res.statusCode).toBe(200);
    expect(res.type).toMatch(/json/);
    expect(visitors).toHaveLength(0);
    expect(resCookies).toHaveLength(1);
    expect(resCookies[0]).toMatch(new RegExp(`^${BROWSER_COOKIE_NAME}=.+`));
  });

  it('should register new visitor, and set the registered-cookie on the response', async () => {
    const res = await api.get('/').set('Cookie', `${BROWSER_COOKIE_NAME}=foo`);
    const resCookies = getResCookies(res);
    const visitors = await db.visitor.findMany({});
    expect(res.statusCode).toBe(200);
    expect(res.type).toMatch(/json/);
    expect(visitors).toHaveLength(1);
    expect(resCookies).toHaveLength(2);
    expect(
      resCookies.every((c) =>
        new RegExp(`^(${BROWSER_COOKIE_NAME}|${VISITOR_COOKIE_NAME})=.+`).test(
          c
        )
      )
    ).toBe(true);
  });

  it('should not register new visitor, on request with registered cookie, and refresh the registered-cookie', async () => {
    const res = await api
      .get('/')
      .set('Cookie', `${BROWSER_COOKIE_NAME}=foo`)
      .set('Cookie', `${VISITOR_COOKIE_NAME}=foo`);
    const resCookies = getResCookies(res);
    const visitors = await db.visitor.findMany({});
    expect(res.statusCode).toBe(200);
    expect(res.type).toMatch(/json/);
    expect(visitors).toHaveLength(0);
    expect(resCookies).toHaveLength(2);
    expect(
      resCookies.every((c) =>
        new RegExp(`^(${BROWSER_COOKIE_NAME}|${VISITOR_COOKIE_NAME})=.+`).test(
          c
        )
      )
    ).toBe(true);
  });
});

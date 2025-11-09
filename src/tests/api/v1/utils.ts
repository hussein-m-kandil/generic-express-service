import * as Types from '@/types';
import { expect } from 'vitest';
import { z } from 'zod';
import supertest from 'supertest';

export * from '../../../lib/config';

export const BASE_URL = '/api/v1';
export const USERS_URL = `${BASE_URL}/users`;
export const POSTS_URL = `${BASE_URL}/posts`;
export const CHATS_URL = `${BASE_URL}/chats`;
export const STATS_URL = `${BASE_URL}/stats`;
export const IMAGES_URL = `${BASE_URL}/images`;
export const PROFILES_URL = `${BASE_URL}/profiles`;
export const SIGNIN_URL = `${BASE_URL}/auth/signin`;
export const VERIFY_URL = `${BASE_URL}/auth/verify`;
export const CHARACTERS_URL = `${BASE_URL}/characters`;
export const SIGNED_IN_USER_URL = `${BASE_URL}/auth/me`;

export const assertErrorRes = (res: supertest.Response, expected: RegExp | string) => {
  const resBody = res.body as Types.AppErrorResponse;
  expect(res.statusCode).toBe(400);
  expect(res.type).toMatch(/json/);
  expect(resBody.error.message).toMatch(expected);
};

export const assertNotFoundErrorRes = (res: supertest.Response) => {
  const resBody = res.body as Types.AppErrorResponse;
  expect(res.statusCode).toBe(404);
  expect(res.type).toMatch(/json/);
  expect(resBody.error.message).toMatch(/not found/i);
};

export const assertInvalidIdErrorRes = (res: supertest.Response) => {
  const resBody = res.body as Types.AppErrorResponse;
  expect(res.statusCode).toBe(400);
  expect(res.type).toMatch(/json/);
  expect(resBody.error.message).toMatch(/^.* ?id ?.*$/i);
  expect(resBody.error.message).toMatch(/invalid/i);
};

export const assertUnauthorizedErrorRes = (res: supertest.Response) => {
  expect(res.statusCode).toBe(401);
  expect(res.body).toStrictEqual({});
};

export const assertResponseWithValidationError = (
  res: supertest.Response,
  issueField?: string,
  issuesCount = 1
) => {
  const issues = res.body as z.ZodIssue[];
  expect(res.type).toMatch(/json/);
  expect(res.statusCode).toBe(400);
  expect(issues).toHaveLength(issuesCount);
  issues.forEach((issue) => expect(issue.code).toBeTypeOf('string'));
  if (issueField) expect(issues[0].path).toContain(issueField);
};

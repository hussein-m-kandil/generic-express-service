import express from 'express';
import request from 'supertest';
import usersRouter from '../../../api/v1/users';
import { describe, it, expect } from 'vitest';

const app = express();
app.use('/', usersRouter);

const api = request(app);

describe('/users', () => {
  describe('get all users', () => {
    it('should return an empty list', async () => {
      const res = await api.get('/');
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(expect.arrayContaining([]));
      expect(res.body).toHaveLength(0);
    });
  });
});

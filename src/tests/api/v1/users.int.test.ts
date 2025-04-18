import { User } from '../../../../prisma/generated/client';
import { NewDefaultUser } from '../../../types';
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import db from '../../../lib/db';
import usersRouter from '../../../api/v1/users';

const app = express();
app.use('/', usersRouter);

const api = request(app);

const userMock: NewDefaultUser = {
  fullname: 'Clark Kent/Kal-El',
  username: 'superman',
  password: 'Ss@12312',
};

describe('/users', () => {
  describe('get all users', () => {
    it('should return an empty list', async () => {
      const res = await api.get('/');
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(expect.arrayContaining([]));
      expect(res.body).toHaveLength(0);
    });

    it('should return the correct user list', async () => {
      const { id } = await db.user.create({ data: userMock });
      const res = await api.get('/');
      const users = res.body as User[];
      expect(res.type).toMatch(/json/);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(users[0].username).toStrictEqual(userMock.username);
      expect(users[0].fullname).toStrictEqual(userMock.fullname);
      await db.user.delete({ where: { id } });
    });
  });
});

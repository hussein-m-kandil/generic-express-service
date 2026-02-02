import { vi, it, expect, describe, afterEach } from 'vitest';
import { SIGNIN_URL, STATS_URL } from './utils';
import { Model, Prisma } from '@/../prisma/client';
import { lowerCase } from '@/lib/utils';
import { faker } from '@faker-js/faker';
import { Stats } from '@/types';
import db from '@/lib/db';
import setup from '../setup';

describe('Statistics endpoints', async () => {
  const { api, userData, prepForAuthorizedTest, assertUnauthorizedErrorRes } =
    await setup(SIGNIN_URL);

  afterEach(async () => {
    await db.creation.deleteMany({});
    await db.visitor.deleteMany({});
  });

  describe(STATS_URL, () => {
    it('should respond with 401 on unauthenticated request', async () => {
      const res = await api.get(STATS_URL);
      assertUnauthorizedErrorRes(res);
    });

    it('should respond with correct statistical data', async () => {
      vi.useFakeTimers();
      const monthCount = 13;
      const monthlyEntryCount = 3;
      const models = Object.values(Model);
      for (let i = 0; i < monthCount; i++) {
        // Set system time to the date of the previous month
        vi.setSystemTime(new Date().setMonth(new Date().getMonth() - 1, 1));
        // Register new creation entries in all models
        for (const model of models) {
          const data: Prisma.CreationCreateInput[] = [];
          for (let j = 0; j < monthlyEntryCount; j++) {
            const hours = j % 24;
            data.push({
              createdAt: new Date(new Date().setHours(hours)).toISOString(),
              isAdmin: faker.datatype.boolean(),
              username: faker.internet.email(),
              model,
            });
          }
          await db.creation.createMany({ data });
        }
        const data: Prisma.VisitorCreateInput[] = [];
        for (let j = 0; j < monthlyEntryCount; j++) {
          const hours = (j + monthlyEntryCount) % 24;
          const createdAt = new Date(new Date().setHours(hours)).toISOString();
          data.push({ createdAt });
        }
        await db.visitor.createMany({ data });
      }
      const { authorizedApi } = await prepForAuthorizedTest(userData);
      const res = await authorizedApi.get(STATS_URL);
      const { visitors, ...modelEntries } = res.body as Stats;
      expect(res.statusCode).toBe(200);
      expect(res.type).toMatch(/json/);
      expect(visitors).toHaveLength(monthCount);
      for (const entry of visitors) {
        expect(entry.count).toBe(monthlyEntryCount);
      }
      for (const m of models) {
        const modelStats = modelEntries[`${lowerCase(m)}s`];
        expect(modelStats).toHaveLength(monthCount);
        for (const entry of modelStats) {
          expect(entry.count).toBe(monthlyEntryCount);
        }
      }
      vi.setSystemTime(vi.getRealSystemTime());
      vi.useRealTimers();
    });
  });
});

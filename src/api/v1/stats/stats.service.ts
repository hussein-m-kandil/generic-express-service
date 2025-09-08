import { lowerCase } from '@/lib/utils';
import { Stats } from '@/types';
import db from '@/lib/db';

const hasSameMonthAndYear = (a: Date, b: Date) => {
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
};

const injectStatsEntries = (statsEntries: Stats[keyof Stats], date: Date) => {
  const entry = statsEntries.find((se) => hasSameMonthAndYear(se.date, date));
  if (entry) entry.count++;
  else statsEntries.push({ date, count: 1 });
};

export const getStats = async (): Promise<Stats> => {
  const stats: Stats = {
    visitors: [],
    comments: [],
    images: [],
    users: [],
    posts: [],
    votes: [],
    tags: [],
  };

  const [creations, visitors] = await db.$transaction([
    db.creation.findMany({}),
    db.visitor.findMany({}),
  ]);

  for (const { createdAt } of visitors) {
    injectStatsEntries(stats.visitors, createdAt);
  }

  for (const { model, createdAt } of creations) {
    injectStatsEntries(stats[`${lowerCase(model)}s`], createdAt);
  }

  return stats;
};

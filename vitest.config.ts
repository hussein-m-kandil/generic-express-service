import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    isolate: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }, // avoid conflicts in db interactions
  },
});

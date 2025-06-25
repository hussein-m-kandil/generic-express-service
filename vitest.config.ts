import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    isolate: true,
    pool: 'forks',
    poolOptions: { forks: { maxForks: 1, minForks: 0 } }, // avoid conflicts in db interactions
  },
});

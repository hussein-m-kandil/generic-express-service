import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    poolOptions: { forks: { maxForks: 1, minForks: 0 } },
    include: ['src/**/*.test.ts'],
    isolate: true,
    pool: 'forks',
  },
});

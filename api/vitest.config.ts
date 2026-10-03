import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/polyfill.ts', 'src/lib/cosmos.mock.ts'],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
});

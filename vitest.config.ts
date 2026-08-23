import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@sentinel/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@sentinel/llm': resolve(__dirname, 'packages/llm/src/index.ts'),
      '@sentinel/agent': resolve(__dirname, 'packages/agent/src/index.ts'),
      '@sentinel/storage': resolve(__dirname, 'packages/storage/src/index.ts'),
      '@sentinel/tools': resolve(__dirname, 'packages/tools/src/index.ts'),
      '@sentinel/context': resolve(__dirname, 'packages/context/src/index.ts'),
      '@sentinel/memory': resolve(__dirname, 'packages/memory/src/index.ts'),
      '@sentinel/permissions': resolve(__dirname, 'packages/permissions/src/index.ts'),
      '@sentinel/git': resolve(__dirname, 'packages/git/src/index.ts'),
      '@sentinel/project': resolve(__dirname, 'packages/project/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    exclude: [
      'node_modules',
      'dist',
      'tests/e2e/**',
      'tests/fixtures/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/__tests__/**',
        '**/index.ts',
      ],
    },
    testTimeout: 10000,
  },
});

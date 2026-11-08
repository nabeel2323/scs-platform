import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: [
      // Mirror tsconfig `paths` ("@/*" -> "./src/*") so components that import
      // via the `@/` alias resolve under Vitest the same way Next/`tsc` do.
      // Needed by src/app/auth/login/page.tsx, the one admin screen written
      // against the alias; every other screen uses relative imports.
      { find: /^@\//, replacement: path.resolve(__dirname, 'src') + '/' },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.tsx'],
    setupFiles: ['src/__tests__/setup.ts'],
    restoreMocks: true,
  },
});

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: [
      // Mirror tsconfig `paths` ("@/*" -> "./src/*") so components that import
      // via the `@/` alias resolve under Vitest the same way Next/`tsc` do.
      { find: /^@\//, replacement: path.resolve(__dirname, 'src') + '/' },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.tsx', 'src/__tests__/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    restoreMocks: true,
  },
});

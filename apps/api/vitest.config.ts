import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.spec.ts'],
    alias: {
      '@/*': path.resolve(__dirname, 'src/*'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // Measure application code only — not tests, DI wiring, or generated types.
      include: ['src/**/*.ts'],
      exclude: [
        'src/__tests__/**',
        'src/**/*.module.ts',
        'src/**/*.schema.ts',
        'src/**/*.dto.ts',
        'src/**/index.ts',
        'src/scripts/**',
        'src/main.ts',
        'src/drizzle/**',
      ],
      // Coverage gates. Both identity and orders are held at the Phase 1
      // target (≥40% lines) now that the identity controllers have delegation
      // specs; the global floor is lower so unrelated, out-of-scope modules
      // don't block CI.
      thresholds: {
        lines: 15,
        functions: 28,
        branches: 70,
        statements: 15,
        'src/modules/identity/**/*.ts': {
          lines: 40,
          functions: 55,
          branches: 85,
          statements: 40,
        },
        'src/modules/orders/**/*.ts': {
          lines: 40,
          functions: 60,
          branches: 70,
          statements: 40,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@/*': path.resolve(__dirname, 'src/*'),
    },
  },
});

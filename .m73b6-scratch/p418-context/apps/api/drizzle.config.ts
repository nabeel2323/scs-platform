import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/modules/**/*.schema.ts',
  out: './infra/drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] || 'postgresql://scs:scs_dev_2026@127.0.0.1:5432/scs_platform',
  },
  verbose: true,
  strict: true,
});

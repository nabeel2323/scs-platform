/**
 * Local Docker development migration exclusions.
 *
 * These migrations require pg_partman, which is not installed in the
 * postgis/postgis:16-3.4 development image. They remain pending (never logged)
 * in local development. The DATABASE_URL migration runner does not use this
 * exclusion list and requires the extension on its target database.
 */
export const DEV_MIGRATION_EXCLUSIONS: ReadonlyMap<string, string> = new Map([
  [
    '0013_analytics.sql',
    'requires the pg_partman extension, which is absent from the local development image',
  ],
  [
    '0018_analytics_retention.sql',
    'depends on pg_partman configuration created by 0013_analytics.sql',
  ],
]);

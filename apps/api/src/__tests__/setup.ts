/**
 * Vitest setup — runs in every test file's worker before tests execute.
 *
 * The pg Pool re-emits connection-level errors on clients whose _poolUseCount
 * is still > 0 (i.e. drizzle-checked-out clients that were never released back
 * to the idle queue).  When the testcontainer PostgreSQL shuts down at the end
 * of a *.postgres.spec.ts / *.e2e.spec.ts file, every remaining connection
 * receives PG error 57P01 ("terminating connection due to administrator
 * command").  For checked-out clients this becomes an uncaught exception that
 * fails the vitest process even though all assertions passed.
 *
 * We intercept exactly that error code and let every other uncaught exception
 * propagate normally so real bugs still fail the build.
 */
process.on('uncaughtException', (error: Error & { code?: string }) => {
  if (error?.code === '57P01') return; // expected PG admin-shutdown during test teardown
  throw error; // re-throw everything else
});

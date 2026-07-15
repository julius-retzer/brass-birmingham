// Vitest global setup. Intentionally does NOT import the DB layer: most tests
// (the pure engine suite) never touch it and must run with no DATABASE_URL.
// We only relax env validation so `~/env` won't throw when a suite that DOES
// use the store imports it. DB-backed suites apply the schema themselves via
// `ensureTestSchema()` (src/test/db-schema.ts) against the real DATABASE_URL.
process.env.SKIP_ENV_VALIDATION ??= '1'

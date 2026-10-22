/**
 * Whether to negotiate TLS to Postgres.
 *
 * `NODE_ENV === 'production'` alone is the wrong signal. `next start` always
 * runs in production mode, so a self-hosted deployment against a Postgres that
 * does not offer TLS could never connect — which is exactly the configuration
 * the local AI stack targets, and how the validation harness has to run
 * (the long grading loop cannot survive turbopack HMR under `next dev`).
 *
 * POSTGRES_SSL decides when set; otherwise the previous NODE_ENV behaviour is
 * preserved so hosted deployments are unaffected.
 */
export function resolvePostgresSsl(
  env: NodeJS.ProcessEnv = process.env
): false | { rejectUnauthorized: boolean } {
  const explicit = env.POSTGRES_SSL?.trim().toLowerCase();
  if (explicit === 'false' || explicit === 'off' || explicit === '0' || explicit === 'disable') {
    return false;
  }
  if (explicit === 'true' || explicit === 'on' || explicit === '1' || explicit === 'require') {
    return { rejectUnauthorized: false };
  }
  return env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
}

/** `pg` distinguishes "no TLS" (false) from "unset"; `postgres` does not. */
export function resolvePgPoolSsl(
  env: NodeJS.ProcessEnv = process.env
): false | { rejectUnauthorized: boolean } | undefined {
  const ssl = resolvePostgresSsl(env);
  return ssl === false && env.POSTGRES_SSL === undefined ? undefined : ssl;
}

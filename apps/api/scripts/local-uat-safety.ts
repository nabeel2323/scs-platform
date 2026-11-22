const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'scs-postgres']);
const LOCAL_SERVICE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface LocalUatTargets {
  databaseUrl?: string;
  apiUrl?: string;
  redisUrl?: string;
}

function assertLocalUrl(value: string, label: string, allowedHosts: Set<string>): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(label + ' must be a valid URL.');
  }
  if (!allowedHosts.has(parsed.hostname)) {
    throw new Error(label + ' must target a local host; refusing remote UAT access.');
  }
}

/**
 * Guard for manually invoked M5/M6 test and diagnostic scripts.
 * It cannot inspect the database behind a separately running local API;
 * callers must also ensure that API process uses a local development/test DB.
 */
export function assertLocalUatExecution(scriptName: string, targets: LocalUatTargets = {}): void {
  const environment = process.env['SCS_ENVIRONMENT']?.trim().toLowerCase();
  if (environment !== 'development' && environment !== 'test') {
    throw new Error(scriptName + ': SCS_ENVIRONMENT must be development or test.');
  }
  if (process.env['SCS_UAT_CONFIRM'] !== 'true') {
    throw new Error(scriptName + ': set SCS_UAT_CONFIRM=true to confirm local UAT execution.');
  }
  if (targets.databaseUrl) assertLocalUrl(targets.databaseUrl, 'DATABASE_URL', LOCAL_DATABASE_HOSTS);
  if (targets.apiUrl) assertLocalUrl(targets.apiUrl, 'SCS_UAT_API_URL', LOCAL_SERVICE_HOSTS);
  if (targets.redisUrl) assertLocalUrl(targets.redisUrl, 'SCS_UAT_REDIS_URL', LOCAL_SERVICE_HOSTS);
  console.log('[local UAT safety] ' + scriptName + ' target checks passed (' + environment + ').');
}

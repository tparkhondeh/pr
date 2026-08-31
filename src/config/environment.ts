export type Environment = Readonly<{
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  staticRoot?: string;
  runtime: Readonly<{
    persistence: 'memory' | 'postgres';
    durability: 'ephemeral' | 'persistent';
    ephemeralProductionOverride: boolean;
  }>;
  database?: Readonly<{
    connectionString: string;
    tenantId: string;
    ownerUserId: string;
  }>;
}>;

const allowedNodeEnvs = new Set<Environment['nodeEnv']>([
  'development',
  'test',
  'production',
]);

const allowedLogLevels = new Set<Environment['logLevel']>([
  'debug',
  'info',
  'warn',
  'error',
]);

export function loadEnvironment(
  input: NodeJS.ProcessEnv = process.env,
): Environment {
  const nodeEnv = input['NODE_ENV'] ?? 'development';
  const logLevel = input['LOG_LEVEL'] ?? 'info';
  const port = Number(input['PORT'] ?? '3000');
  const staticRoot = input['PR_STATIC_ROOT']?.trim();
  const allowEphemeralProduction = parseBoolean(
    input['PR_ALLOW_EPHEMERAL_PRODUCTION'],
    'PR_ALLOW_EPHEMERAL_PRODUCTION',
  );

  if (!allowedNodeEnvs.has(nodeEnv as Environment['nodeEnv'])) {
    throw new Error(`Invalid NODE_ENV: ${nodeEnv}`);
  }

  if (!allowedLogLevels.has(logLevel as Environment['logLevel'])) {
    throw new Error(`Invalid LOG_LEVEL: ${logLevel}`);
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT: ${input['PORT'] ?? ''}`);
  }

  const database = loadDatabaseEnvironment(input);
  if (nodeEnv === 'production' && !database && !allowEphemeralProduction) {
    throw new Error(
      'Production requires PostgreSQL. Set DATABASE_URL, PR_TENANT_ID and PR_OWNER_USER_ID, ' +
      'or explicitly set PR_ALLOW_EPHEMERAL_PRODUCTION=true for a private, disposable preview.',
    );
  }
  if (database && allowEphemeralProduction) {
    throw new Error(
      'PR_ALLOW_EPHEMERAL_PRODUCTION must be removed when PostgreSQL is configured.',
    );
  }

  return {
    nodeEnv: nodeEnv as Environment['nodeEnv'],
    logLevel: logLevel as Environment['logLevel'],
    port,
    runtime: database
      ? {
          persistence: 'postgres',
          durability: 'persistent',
          ephemeralProductionOverride: false,
        }
      : {
          persistence: 'memory',
          durability: 'ephemeral',
          ephemeralProductionOverride: nodeEnv === 'production',
        },
    ...(staticRoot ? { staticRoot } : {}),
    ...(database ? { database } : {}),
  };
}

function parseBoolean(value: string | undefined, name: string): boolean {
  if (value === undefined || value.trim() === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error(`${name} must be true or false.`);
}

function loadDatabaseEnvironment(
  input: NodeJS.ProcessEnv,
): Environment['database'] {
  const connectionString = input['DATABASE_URL']?.trim();
  const tenantId = input['PR_TENANT_ID']?.trim();
  const ownerUserId = input['PR_OWNER_USER_ID']?.trim();
  if (!connectionString && !tenantId && !ownerUserId) return undefined;
  if (!connectionString || !tenantId || !ownerUserId) {
    throw new Error(
      'DATABASE_URL, PR_TENANT_ID and PR_OWNER_USER_ID must be configured together.',
    );
  }

  let protocol: string;
  try {
    protocol = new URL(connectionString).protocol;
  } catch {
    throw new Error('Invalid DATABASE_URL.');
  }
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use postgres or postgresql protocol.');
  }
  if (!isUuid(tenantId) || !isUuid(ownerUserId)) {
    throw new Error('PR_TENANT_ID and PR_OWNER_USER_ID must be UUIDs.');
  }
  return { connectionString, tenantId, ownerUserId };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

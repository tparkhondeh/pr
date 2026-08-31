export type Environment = Readonly<{
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
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

  if (!allowedNodeEnvs.has(nodeEnv as Environment['nodeEnv'])) {
    throw new Error(`Invalid NODE_ENV: ${nodeEnv}`);
  }

  if (!allowedLogLevels.has(logLevel as Environment['logLevel'])) {
    throw new Error(`Invalid LOG_LEVEL: ${logLevel}`);
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT: ${input['PORT'] ?? ''}`);
  }

  return {
    nodeEnv: nodeEnv as Environment['nodeEnv'],
    logLevel: logLevel as Environment['logLevel'],
    port,
  };
}

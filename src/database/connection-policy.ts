export type PostgresTransportPolicy = Readonly<{
  scope: 'local' | 'remote';
  tls: 'local_transport' | 'verify_full';
}>;

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function assertSafePostgresConnectionString(
  connectionString: string,
  label = 'DATABASE_URL',
): PostgresTransportPolicy {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(`Invalid ${label}.`);
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`${label} must use postgres or postgresql protocol.`);
  }

  const socketHost = url.searchParams.get('host');
  const isLocalSocket = url.hostname.length === 0 && socketHost?.startsWith('/') === true;
  const isLoopback = loopbackHosts.has(url.hostname.toLowerCase());
  if (isLoopback || isLocalSocket) {
    return { scope: 'local', tls: 'local_transport' };
  }
  if (url.hostname.length === 0) {
    throw new Error(`${label} must declare a database host or local socket.`);
  }

  const sslModes = url.searchParams.getAll('sslmode');
  if (sslModes.length !== 1 || sslModes[0]?.toLowerCase() !== 'verify-full') {
    throw new Error(`${label} must use sslmode=verify-full for a non-local database.`);
  }
  return { scope: 'remote', tls: 'verify_full' };
}

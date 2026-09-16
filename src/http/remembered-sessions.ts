import { lstatSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

export type OwnerSession = { created: number; seen: number; version: string; remembered?: boolean };
export const rememberedLifetime = 14 * 24 * 3600_000;

/** Single-process owner store. Only opaque-token hashes, never credentials or bearer tokens. */
export function rememberedSessionStore(path: string) {
  const load = (): Map<string, OwnerSession> => {
    try {
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536 ||
        (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))) {
        throw new Error('Unsafe remembered-session store.');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
      throw error;
    }
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(data) || data.length > 64) throw new Error('Invalid remembered-session store.');
    const entries = new Map<string, OwnerSession>();
    for (const item of data) {
      if (!Array.isArray(item) || item.length !== 2) throw new Error('Invalid session record.');
      const [key, value] = item as [unknown, unknown];
      const s = value as Partial<OwnerSession> | null;
      if (typeof key !== 'string' || !/^[a-f0-9]{64}$/u.test(key) || !s ||
        !Number.isSafeInteger(s.created) || !Number.isSafeInteger(s.seen) ||
        typeof s.version !== 'string' || s.version.length > 1024 || s.remembered !== true) {
        throw new Error('Invalid session record.');
      }
      entries.set(key, s as OwnerSession);
    }
    return entries;
  };
  return { load, save(sessions: Map<string, OwnerSession>) {
    // Validate existing destination before replacing it; a corrupt store fails closed.
    load();
    const temporary = `${path}.${randomBytes(12).toString('hex')}.tmp`;
    writeFileSync(temporary, JSON.stringify([...sessions].filter(([, s]) => s.remembered)), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } };
}

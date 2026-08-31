import { createHash } from 'node:crypto';

export type Migration = Readonly<{
  id: string;
  sha256: string;
  sql: string;
}>;

const migrationIdPattern = /^\d{4}_[a-z0-9_]+$/;

export function defineMigration(id: string, sql: string): Migration {
  if (!migrationIdPattern.test(id)) {
    throw new Error(`Invalid migration ID: ${id}`);
  }
  if (!/^BEGIN;[\s\S]*COMMIT;\s*$/u.test(sql.trim())) {
    throw new Error(`Migration ${id} must be transactional.`);
  }
  return {
    id,
    sql,
    sha256: createHash('sha256').update(sql).digest('hex'),
  };
}

export function assertAppendOnlyMigrations(
  applied: ReadonlyMap<string, string>,
  pending: readonly Migration[],
): void {
  const seen = new Set<string>();
  for (const migration of pending) {
    if (seen.has(migration.id)) {
      throw new Error(`Duplicate migration ID: ${migration.id}`);
    }
    seen.add(migration.id);

    const appliedChecksum = applied.get(migration.id);
    if (appliedChecksum && appliedChecksum !== migration.sha256) {
      throw new Error(`Applied migration changed: ${migration.id}`);
    }
  }
}


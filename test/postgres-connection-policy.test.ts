import { describe, expect, it } from 'vitest';
import { assertSafePostgresConnectionString } from '../src/database/connection-policy.js';

describe('PostgreSQL connection transport policy', () => {
  it('accepts loopback and local socket connections without network TLS', () => {
    expect(assertSafePostgresConnectionString('postgresql://pr:secret@127.0.0.1/pr')).toEqual({
      scope: 'local', tls: 'local_transport',
    });
    expect(assertSafePostgresConnectionString('postgresql://pr:secret@localhost/pr')).toEqual({
      scope: 'local', tls: 'local_transport',
    });
    expect(assertSafePostgresConnectionString('postgresql:///pr?host=/var/run/postgresql')).toEqual({
      scope: 'local', tls: 'local_transport',
    });
  });

  it('accepts only verify-full for remote connections', () => {
    expect(assertSafePostgresConnectionString(
      'postgresql://pr:secret@db.example.test/pr?sslmode=verify-full',
    )).toEqual({ scope: 'remote', tls: 'verify_full' });
    expect(() => assertSafePostgresConnectionString(
      'postgresql://pr:secret@db.example.test/pr?sslmode=require',
    )).toThrow('sslmode=verify-full');
    expect(() => assertSafePostgresConnectionString(
      'postgresql://pr:secret@db.example.test/pr',
    )).toThrow('sslmode=verify-full');
  });

  it('rejects ambiguous or non-PostgreSQL connection strings', () => {
    expect(() => assertSafePostgresConnectionString(
      'postgresql://pr:secret@db.example.test/pr?sslmode=verify-full&sslmode=disable',
    )).toThrow('sslmode=verify-full');
    expect(() => assertSafePostgresConnectionString('https://db.example.test/pr')).toThrow(
      'postgres or postgresql protocol',
    );
  });
});

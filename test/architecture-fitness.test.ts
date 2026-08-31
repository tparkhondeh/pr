import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(root, 'src');

function sourceFiles(directory = sourceRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

function importsOf(path: string): string[] {
  const source = readFileSync(path, 'utf8');
  return [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/gu)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
}

function portableRelative(from: string, to: string): string {
  return relative(from, to).replaceAll('\\', '/');
}

describe('architectural fitness', () => {
  it('keeps the policy kernel independent from outer application layers', () => {
    const violations = sourceFiles(resolve(sourceRoot, 'kernel')).flatMap((path) =>
      importsOf(path)
        .filter((specifier) => !specifier.startsWith('./') && !specifier.startsWith('node:'))
        .map((specifier) => `${portableRelative(root, path)} -> ${specifier}`),
    );
    expect(violations).toEqual([]);
  });

  it('keeps provider, workflow, evaluation and cost ports free of adapters', () => {
    const protectedDirectories = ['providers', 'workflow', 'evaluation', 'observability'];
    const forbidden = ['../database/', '../http/', 'pg'];
    const violations = protectedDirectories.flatMap((directory) =>
      sourceFiles(resolve(sourceRoot, directory)).flatMap((path) =>
        importsOf(path)
          .filter((specifier) => forbidden.some((prefix) => specifier.startsWith(prefix)))
          .map((specifier) => `${portableRelative(root, path)} -> ${specifier}`),
      ),
    );
    expect(violations).toEqual([]);
  });

  it('confines the PostgreSQL driver to its adapter', () => {
    const violations = sourceFiles().flatMap((path) =>
      importsOf(path)
        .filter((specifier) => specifier === 'pg' && portableRelative(sourceRoot, path) !== 'database/postgres.ts')
        .map((specifier) => `${portableRelative(root, path)} -> ${specifier}`),
    );
    expect(violations).toEqual([]);
  });

  it('keeps the production API on an explicit loopback interface', () => {
    const ecosystem = readFileSync(resolve(root, 'deploy/cpanel/ecosystem.config.cjs'), 'utf8');
    expect(ecosystem).toContain("PR_BIND_HOST: '127.0.0.1'");
    expect(ecosystem).not.toMatch(/PR_BIND_HOST:\s*['"](?:0\.0\.0\.0|::)['"]/u);
  });

  it('keeps the hosted web source independent from the Node composition root', () => {
    const webSource = resolve(root, 'apps/web/src');
    const violations = sourceFiles(webSource).flatMap((path) =>
      importsOf(path)
        .filter((specifier) => specifier.includes('../../../src/'))
        .map((specifier) => `${portableRelative(root, path)} -> ${specifier}`),
    );
    expect(violations).toEqual([]);
  });
});

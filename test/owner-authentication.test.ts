import { describe, expect, it, vi } from 'vitest';
import { createOwnerAuthenticator } from '../src/http/owner-authentication.js';

const basic = (password: string, username = 'pr_owner') => ({ authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` });
const token = 'a'.repeat(64);
describe('private owner authentication', () => {
  it('does not trust loopback, forwarded identity or missing/invalid authorization', async () => {
    const verifyPassword = vi.fn(() => Promise.resolve(true));
    const authenticate = createOwnerAuthenticator({ version: () => 'v1', maintenanceToken: () => token, verifyPassword });
    for (const headers of [{}, { 'x-forwarded-user': 'pr_owner' }, { authorization: 'Bearer guessed' },
      basic('fake', 'another_owner'), basic(''), basic('fake\nsecond-line'), { 'x-pr-maintenance-token': 'wrong' }]) {
      expect(await authenticate(headers)).toBe(false);
    }
    expect(verifyPassword).not.toHaveBeenCalled();
  });
  it('accepts only a valid owner password or separate private maintenance token', async () => {
    const authenticate = createOwnerAuthenticator({ version: () => 'v1', maintenanceToken: () => token,
      verifyPassword: (password) => Promise.resolve(password === 'synthetic-valid') });
    expect(await authenticate(basic('wrong'))).toBe(false);
    expect(await authenticate(basic('synthetic-valid'))).toBe(true);
    expect(await authenticate({ 'x-pr-maintenance-token': token }, 'GET')).toBe(true);
    expect(await authenticate({ 'x-pr-maintenance-token': token }, 'POST')).toBe(false);
    expect(await authenticate({ 'x-pr-maintenance-token': token }, 'DELETE')).toBe(false);
  });
  it('coalesces a normal UI request burst and invalidates cache after verifier rotation', async () => {
    let version = 'v1';
    const verifyPassword = vi.fn((password: string) => Promise.resolve(password === version));
    const authenticate = createOwnerAuthenticator({ version: () => version, maintenanceToken: () => token, verifyPassword });
    expect((await Promise.all(Array.from({ length: 20 }, () => authenticate(basic('v1'))))).every(Boolean)).toBe(true);
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    version = 'v2';
    expect(await authenticate(basic('v1'))).toBe(false);
    expect(await authenticate(basic('v2'))).toBe(true);
  });
  it('fails closed if private verification is unavailable', async () => {
    const authenticate = createOwnerAuthenticator({ version: () => { throw new Error('unavailable'); },
      maintenanceToken: () => { throw new Error('unavailable'); }, verifyPassword: () => Promise.resolve(true) });
    expect(await authenticate(basic('anything'))).toBe(false);
    expect(await authenticate({ 'x-pr-maintenance-token': token })).toBe(false);
  });
  it('bounds simultaneous expensive verifier calls', async () => {
    let release: ((valid: boolean) => void) | undefined;
    const pending = new Promise<boolean>((resolve) => { release = resolve; });
    const authenticate = createOwnerAuthenticator({ version: () => 'v1', maintenanceToken: () => token,
      verifyPassword: () => pending });
    const checks = Array.from({ length: 4 }, (_, index) => authenticate(basic(`synthetic-${String(index)}`)));
    expect(await authenticate(basic('fifth'))).toBe(false);
    release?.(false);
    expect(await Promise.all(checks)).toEqual([false, false, false, false]);
  });
});

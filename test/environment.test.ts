import { describe, expect, it } from 'vitest';
import { loadEnvironment } from '../src/config/environment.js';

describe('loadEnvironment', () => {
  it('uses safe defaults', () => {
    expect(loadEnvironment({})).toEqual({
      nodeEnv: 'development',
      port: 3000,
      logLevel: 'info',
    });
  });

  it('rejects an invalid port', () => {
    expect(() => loadEnvironment({ PORT: '70000' })).toThrow('Invalid PORT');
  });
});


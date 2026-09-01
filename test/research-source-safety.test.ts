import { describe, expect, it } from 'vitest';
import {
  ResearchSourceSafetyPolicy,
  researchSourceSafetyPolicyVersion,
} from '../src/research/source-safety.js';

const policy = new ResearchSourceSafetyPolicy();

describe('research source safety policy', () => {
  it('normalizes a public credential-free HTTPS source without enabling automatic fetch', () => {
    expect(policy.assessSourceUrl(' https://Research.Example.org/report?q=trust#section ')).toEqual({
      policyVersion: researchSourceSafetyPolicyVersion,
      disposition: 'allow',
      findingCodes: [],
      normalizedUrl: 'https://research.example.org/report?q=trust',
      metadataImportPermitted: true,
      automaticFetchPermitted: false,
    });
  });

  it.each([
    ['insecure transport', 'http://research.example.org/report', 'https_required'],
    ['userinfo credential', 'https://user:secret@research.example.org/report', 'credentials_forbidden'],
    ['credential query', 'https://research.example.org/report?access_token=synthetic', 'credential_query_forbidden'],
    ['custom port', 'https://research.example.org:8443/report', 'non_default_port'],
    ['localhost', 'https://localhost/report', 'public_hostname_required'],
    ['local suffix', 'https://metadata.internal/report', 'public_hostname_required'],
    ['IPv4 literal', 'https://127.0.0.1/report', 'public_hostname_required'],
    ['encoded IPv4 literal', 'https://0x7f000001/report', 'public_hostname_required'],
    ['IPv6 literal', 'https://[::1]/report', 'public_hostname_required'],
  ])('denies %s before metadata import', (_label, url, code) => {
    const result = policy.assessSourceUrl(url);
    expect(result).toMatchObject({
      disposition: 'deny',
      metadataImportPermitted: false,
      automaticFetchPermitted: false,
      normalizedUrl: null,
    });
    expect(result.findingCodes).toContain(code);
  });

  it('requires DNS resolution and denies private, reserved, or mixed rebinding targets', () => {
    expect(policy.assessFetchTarget({
      url: 'https://research.example.org/report',
      resolvedAddresses: [],
      redirectDepth: 0,
    })).toMatchObject({ disposition: 'deny', findingCodes: ['dns_resolution_required'], targetEligible: false });

    for (const address of ['127.0.0.1', '10.0.0.8', '169.254.169.254', '192.168.1.2', '::1', 'fc00::1', 'fe80::1']) {
      const result = policy.assessFetchTarget({
        url: 'https://research.example.org/report',
        resolvedAddresses: [address],
        redirectDepth: 0,
      });
      expect(result.findingCodes, address).toContain('non_public_address');
      expect(result.targetEligible, address).toBe(false);
    }

    const rebinding = policy.assessFetchTarget({
      url: 'https://research.example.org/report',
      resolvedAddresses: ['93.184.216.34', '10.0.0.8'],
      redirectDepth: 1,
    });
    expect(rebinding).toMatchObject({
      disposition: 'deny',
      findingCodes: ['non_public_address'],
      approvedAddresses: [],
      addressPinningRequired: true,
      redirectRevalidationRequired: true,
      automaticFetchPermitted: false,
    });
  });

  it('marks fully public resolved targets eligible while retaining fail-closed connector boundaries', () => {
    const result = policy.assessFetchTarget({
      url: 'https://research.example.org/report',
      resolvedAddresses: ['93.184.216.34', '2001:4860:4860::8888'],
      redirectDepth: 2,
    });
    expect(result).toMatchObject({
      disposition: 'allow',
      findingCodes: [],
      targetEligible: true,
      approvedAddresses: ['2001:4860:4860::8888', '93.184.216.34'],
      addressPinningRequired: true,
      redirectRevalidationRequired: true,
      automaticFetchPermitted: false,
    });
    expect(result.resolvedAddressesSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('denies a redirect past the bounded chain even when its address is public', () => {
    expect(policy.assessFetchTarget({
      url: 'https://research.example.org/redirected',
      resolvedAddresses: ['93.184.216.34'],
      redirectDepth: 4,
    })).toMatchObject({
      disposition: 'deny',
      findingCodes: ['redirect_limit_exceeded'],
      targetEligible: false,
    });
  });

  it('allows only bounded research content types and response sizes', () => {
    expect(policy.assessResponse({
      contentType: 'text/html; charset=utf-8',
      contentLength: 120_000,
    })).toMatchObject({
      disposition: 'allow',
      normalizedContentType: 'text/html',
      responseEligible: true,
      streamingByteLimitRequired: true,
      rawResponseRetained: false,
    });
    expect(policy.assessResponse({
      contentType: 'application/octet-stream',
      contentLength: 2_000_001,
    })).toMatchObject({
      disposition: 'deny',
      findingCodes: ['unsupported_content_type', 'response_too_large'],
      responseEligible: false,
    });
  });

  it('publishes a disabled, fail-closed connector contract', () => {
    expect(policy.snapshot()).toEqual({
      policyVersion: 'research-source-safety-v1',
      automaticFetchEnabled: false,
      failClosed: true,
      addressPinningRequired: true,
      redirectRevalidationRequired: true,
      credentialsForwardingAllowed: false,
      cookiesAllowed: false,
      rawResponseRetained: false,
      maximumRedirects: 3,
      maximumResponseBytes: 2_000_000,
      timeoutMs: 10_000,
      allowedMethods: ['GET', 'HEAD'],
      allowedContentTypes: ['text/html', 'application/xhtml+xml', 'application/pdf', 'text/plain'],
    });
  });
});

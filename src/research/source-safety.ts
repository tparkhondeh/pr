import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export const researchSourceSafetyPolicyVersion = 'research-source-safety-v1' as const;

export const researchSourceSafetyFindingCodes = [
  'invalid_url',
  'https_required',
  'credentials_forbidden',
  'credential_query_forbidden',
  'non_default_port',
  'public_hostname_required',
  'dns_resolution_required',
  'non_public_address',
  'redirect_limit_exceeded',
  'unsupported_content_type',
  'response_too_large',
  'invalid_response_metadata',
] as const;

export type ResearchSourceSafetyFindingCode = (typeof researchSourceSafetyFindingCodes)[number];

export type ResearchSourceUrlAssessment = Readonly<{
  policyVersion: typeof researchSourceSafetyPolicyVersion;
  disposition: 'allow' | 'deny';
  findingCodes: readonly ResearchSourceSafetyFindingCode[];
  normalizedUrl: string | null;
  metadataImportPermitted: boolean;
  automaticFetchPermitted: false;
}>;

export type ResearchFetchTargetAssessment = Readonly<{
  policyVersion: typeof researchSourceSafetyPolicyVersion;
  disposition: 'allow' | 'deny';
  findingCodes: readonly ResearchSourceSafetyFindingCode[];
  normalizedUrl: string | null;
  approvedAddresses: readonly string[];
  resolvedAddressesSha256: string | null;
  targetEligible: boolean;
  addressPinningRequired: true;
  redirectRevalidationRequired: true;
  automaticFetchPermitted: false;
}>;

export type ResearchFetchResponseAssessment = Readonly<{
  policyVersion: typeof researchSourceSafetyPolicyVersion;
  disposition: 'allow' | 'deny';
  findingCodes: readonly ResearchSourceSafetyFindingCode[];
  normalizedContentType: string | null;
  responseEligible: boolean;
  streamingByteLimitRequired: true;
  rawResponseRetained: false;
}>;

export type ResearchSourceSafetySnapshot = Readonly<{
  policyVersion: typeof researchSourceSafetyPolicyVersion;
  automaticFetchEnabled: false;
  failClosed: true;
  addressPinningRequired: true;
  redirectRevalidationRequired: true;
  credentialsForwardingAllowed: false;
  cookiesAllowed: false;
  rawResponseRetained: false;
  maximumRedirects: number;
  maximumResponseBytes: number;
  timeoutMs: number;
  allowedMethods: readonly ['GET', 'HEAD'];
  allowedContentTypes: readonly string[];
}>;

export type ResearchFetchTargetInput = Readonly<{
  url: string;
  resolvedAddresses: readonly string[];
  redirectDepth: number;
}>;

export type ResearchFetchResponseInput = Readonly<{
  contentType: string;
  contentLength?: number;
}>;

const maximumRedirects = 3;
const maximumResponseBytes = 2_000_000;
const timeoutMs = 10_000;
const allowedContentTypes = [
  'text/html',
  'application/xhtml+xml',
  'application/pdf',
  'text/plain',
] as const;

const credentialQueryNames = new Set([
  'apikey',
  'authorization',
  'authtoken',
  'password',
  'signature',
  'token',
  'accesstoken',
  'refreshtoken',
  'xamzcredential',
  'xamzsignature',
]);

const privateHostnameSuffixes = [
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home',
  '.test',
  '.invalid',
  '.onion',
] as const;

export class ResearchSourceSafetyPolicy {
  public assessSourceUrl(value: string): ResearchSourceUrlAssessment {
    const findings = new Set<ResearchSourceSafetyFindingCode>();
    let url: URL | null = null;
    const rawValue = typeof value === 'string' ? value : '';
    const candidate = rawValue.trim();
    if (
      candidate.length < 1 ||
      candidate.length > 2_048 ||
      hasAsciiControl(rawValue)
    ) {
      findings.add('invalid_url');
    } else {
      try {
        url = new URL(candidate);
      } catch {
        findings.add('invalid_url');
      }
    }

    if (url) {
      if (url.protocol !== 'https:') findings.add('https_required');
      if (url.username || url.password) findings.add('credentials_forbidden');
      if (url.port && url.port !== '443') findings.add('non_default_port');
      for (const key of url.searchParams.keys()) {
        if (credentialQueryNames.has(normalizeQueryName(key))) {
          findings.add('credential_query_forbidden');
        }
      }
      if (!isPublicHostname(url.hostname)) findings.add('public_hostname_required');
    }

    const findingCodes = researchSourceSafetyFindingCodes.filter((code) => findings.has(code));
    const normalizedUrl = url && findingCodes.length === 0 ? normalizeUrl(url) : null;
    return {
      policyVersion: researchSourceSafetyPolicyVersion,
      disposition: findingCodes.length === 0 ? 'allow' : 'deny',
      findingCodes,
      normalizedUrl,
      metadataImportPermitted: findingCodes.length === 0,
      automaticFetchPermitted: false,
    };
  }

  public assessFetchTarget(input: ResearchFetchTargetInput): ResearchFetchTargetAssessment {
    const urlAssessment = this.assessSourceUrl(input.url);
    const findings = new Set<ResearchSourceSafetyFindingCode>(urlAssessment.findingCodes);
    if (
      !Number.isSafeInteger(input.redirectDepth) ||
      input.redirectDepth < 0 ||
      input.redirectDepth > maximumRedirects
    ) {
      findings.add('redirect_limit_exceeded');
    }
    const rawAddresses = input.resolvedAddresses.map((value) => value.trim().toLocaleLowerCase('en-US'));
    const addresses = normalizeAddresses(rawAddresses);
    if (addresses.length === 0) {
      findings.add('dns_resolution_required');
    } else if (
      rawAddresses.some((address) => !address || !isPublicNetworkAddress(address))
    ) {
      findings.add('non_public_address');
    }
    const findingCodes = researchSourceSafetyFindingCodes.filter((code) => findings.has(code));
    const targetEligible = findingCodes.length === 0;
    return {
      policyVersion: researchSourceSafetyPolicyVersion,
      disposition: targetEligible ? 'allow' : 'deny',
      findingCodes,
      normalizedUrl: urlAssessment.normalizedUrl,
      approvedAddresses: targetEligible ? addresses : [],
      resolvedAddressesSha256: addresses.length > 0 ? sha256(addresses.join('\n')) : null,
      targetEligible,
      addressPinningRequired: true,
      redirectRevalidationRequired: true,
      automaticFetchPermitted: false,
    };
  }

  public assessResponse(input: ResearchFetchResponseInput): ResearchFetchResponseAssessment {
    const findings = new Set<ResearchSourceSafetyFindingCode>();
    const normalizedContentType = normalizeContentType(input.contentType);
    if (!normalizedContentType || !allowedContentTypes.includes(
      normalizedContentType as (typeof allowedContentTypes)[number],
    )) {
      findings.add('unsupported_content_type');
    }
    if (input.contentLength !== undefined) {
      if (!Number.isSafeInteger(input.contentLength) || input.contentLength < 0) {
        findings.add('invalid_response_metadata');
      } else if (input.contentLength > maximumResponseBytes) {
        findings.add('response_too_large');
      }
    }
    const findingCodes = researchSourceSafetyFindingCodes.filter((code) => findings.has(code));
    return {
      policyVersion: researchSourceSafetyPolicyVersion,
      disposition: findingCodes.length === 0 ? 'allow' : 'deny',
      findingCodes,
      normalizedContentType,
      responseEligible: findingCodes.length === 0,
      streamingByteLimitRequired: true,
      rawResponseRetained: false,
    };
  }

  public snapshot(): ResearchSourceSafetySnapshot {
    return {
      policyVersion: researchSourceSafetyPolicyVersion,
      automaticFetchEnabled: false,
      failClosed: true,
      addressPinningRequired: true,
      redirectRevalidationRequired: true,
      credentialsForwardingAllowed: false,
      cookiesAllowed: false,
      rawResponseRetained: false,
      maximumRedirects,
      maximumResponseBytes,
      timeoutMs,
      allowedMethods: ['GET', 'HEAD'],
      allowedContentTypes,
    };
  }
}

export const researchSourceSafetyPolicy = new ResearchSourceSafetyPolicy();

function normalizeQueryName(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^a-z0-9]/gu, '');
}

function hasAsciiControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function isPublicHostname(value: string): boolean {
  const hostname = stripIpv6Brackets(value).toLocaleLowerCase('en-US').replace(/\.$/u, '');
  if (!hostname || hostname.length > 253 || isIP(hostname) !== 0) return false;
  if (hostname === 'localhost' || privateHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    return false;
  }
  const labels = hostname.split('.');
  if (labels.length < 2 || labels.some((label) => (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)
  ))) return false;
  return true;
}

function normalizeUrl(input: URL): string {
  const url = new URL(input.toString());
  url.hostname = url.hostname.toLocaleLowerCase('en-US').replace(/\.$/u, '');
  url.hash = '';
  return url.toString();
}

function normalizeAddresses(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLocaleLowerCase('en-US')).filter(Boolean))].sort();
}

function isPublicNetworkAddress(value: string): boolean {
  if (value.includes('%')) return false;
  const version = isIP(value);
  if (version === 4) return isPublicIpv4(value);
  if (version === 6) return isPublicIpv6(value);
  return false;
}

function isPublicIpv4(value: string): boolean {
  const address = ipv4ToBigInt(value);
  if (address === null) return false;
  return !ipv4DeniedRanges.some(([network, prefix]) => inCidr(address, network, prefix, 32));
}

const ipv4DeniedRangeDefinitions: readonly Readonly<[string, number]>[] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const ipv4DeniedRanges: readonly Readonly<[bigint, number]>[] = ipv4DeniedRangeDefinitions
  .map(([network, prefix]) => [ipv4ToBigInt(network) ?? 0n, prefix] as const);

function isPublicIpv6(value: string): boolean {
  const address = ipv6ToBigInt(value);
  if (address === null) return false;
  return !ipv6DeniedRanges.some(([network, prefix]) => inCidr(address, network, prefix, 128));
}

const ipv6DeniedRangeDefinitions: readonly Readonly<[string, number]>[] = [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];

const ipv6DeniedRanges: readonly Readonly<[bigint, number]>[] = ipv6DeniedRangeDefinitions
  .map(([network, prefix]) => [ipv6ToBigInt(network) ?? 0n, prefix] as const);

function ipv4ToBigInt(value: string): bigint | null {
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((result, part) => (result << 8n) | BigInt(part), 0n);
}

function ipv6ToBigInt(value: string): bigint | null {
  const normalized = value.toLocaleLowerCase('en-US');
  if (normalized.includes('%') || normalized.split('::').length > 2) return null;
  const [leftRaw, rightRaw] = normalized.split('::');
  const left = ipv6Groups(leftRaw ?? '');
  const right = ipv6Groups(rightRaw ?? '');
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if ((normalized.includes('::') && missing < 1) || (!normalized.includes('::') && missing !== 0)) {
    return null;
  }
  const groups = [...left, ...Array.from({ length: missing }, () => 0), ...right];
  if (groups.length !== 8) return null;
  return groups.reduce((result, group) => (result << 16n) | BigInt(group), 0n);
}

function ipv6Groups(value: string): number[] | null {
  if (!value) return [];
  const groups: number[] = [];
  for (const part of value.split(':')) {
    if (part.includes('.')) {
      const ipv4 = ipv4ToBigInt(part);
      if (ipv4 === null) return null;
      groups.push(Number((ipv4 >> 16n) & 0xffffn), Number(ipv4 & 0xffffn));
    } else {
      if (!/^[0-9a-f]{1,4}$/u.test(part)) return null;
      groups.push(Number.parseInt(part, 16));
    }
  }
  return groups;
}

function inCidr(address: bigint, network: bigint, prefix: number, bits: number): boolean {
  const shift = BigInt(bits - prefix);
  return (address >> shift) === (network >> shift);
}

function stripIpv6Brackets(value: string): string {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}

function normalizeContentType(value: string): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.split(';', 1)[0]?.trim().toLocaleLowerCase('en-US') ?? '';
  return normalized || null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

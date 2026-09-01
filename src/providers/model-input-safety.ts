import { createHash } from 'node:crypto';

export const modelInputSafetyPolicyVersion = 'model-input-safety-v1' as const;

export const modelInputSafetyFindingCodes = [
  'credential_material',
  'prompt_injection',
  'opaque_encoded_payload',
  'scan_limit_exceeded',
  'unsupported_input_shape',
] as const;

export type ModelInputSafetyFindingCode = (typeof modelInputSafetyFindingCodes)[number];
export type ModelInputSafetyDisposition = 'allow' | 'deny';

export type ModelInputSafetyFinding = Readonly<{
  code: ModelInputSafetyFindingCode;
  severity: 'high' | 'critical';
  fieldPath: string;
  fingerprint: string;
}>;

export type ModelInputSafetyResult = Readonly<{
  policyVersion: typeof modelInputSafetyPolicyVersion;
  evaluatedAt: Date;
  disposition: ModelInputSafetyDisposition;
  scanSha256: string;
  rawInputRetained: false;
  scannedNodes: number;
  scannedStrings: number;
  scannedCharacters: number;
  findings: readonly ModelInputSafetyFinding[];
}>;

export type ModelInputSafetySnapshot = Readonly<{
  policyVersion: typeof modelInputSafetyPolicyVersion;
  generatedAt: Date;
  required: true;
  failClosed: true;
  rawInputRetained: false;
  rules: readonly Readonly<{
    id: ModelInputSafetyFindingCode;
    action: 'deny';
  }>[];
  limits: Readonly<{
    maximumDepth: number;
    maximumNodes: number;
    maximumStrings: number;
    maximumCharacters: number;
  }>;
}>;

type SafetyLimits = ModelInputSafetySnapshot['limits'];
type FindingDraft = Readonly<{
  code: ModelInputSafetyFindingCode;
  severity: ModelInputSafetyFinding['severity'];
  fieldPath: string;
}>;

const defaultSafetyLimits: SafetyLimits = {
  maximumDepth: 20,
  maximumNodes: 10_000,
  maximumStrings: 2_000,
  maximumCharacters: 2_000_000,
};

const credentialPatterns = [
  /-----BEGIN [A-Z0-9 ]{0,24}PRIVATE KEY-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*\b/iu,
  /\bAuthorization\s*:\s*Basic\s+[A-Za-z0-9+/]{12,}={0,2}\b/iu,
  /\b(?:api[ _-]?key|client[ _-]?secret|password|passwd|access[ _-]?token|refresh[ _-]?token)\s*[:=]\s*[^\s,;]{8,}/iu,
  /(?:رمز|گذرواژه|توکن|کلید[ _-]?API)\s*[:=]\s*[^\s،؛]{8,}/u,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:/]+:[^\s@/]+@/iu,
] as const;

const promptInjectionPatterns = [
  /\b(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|system|developer)\s+(?:instructions|messages|rules)\b/iu,
  /\b(?:reveal|show|print|return|expose)\s+(?:the\s+)?(?:system|developer|hidden)\s+(?:prompt|instructions|message)\b/iu,
  /\b(?:send|upload|post|exfiltrate)\b.{0,60}\b(?:secret|credential|token|password|system prompt)\b/iu,
  /(?:دستور|پیام|قانون)(?:های)?\s+(?:قبلی|بالا|سیستم).{0,40}(?:نادیده|لغو|دور بزن)/u,
  /(?:پرامپت|دستور)(?:‌| )?(?:های)?\s+(?:سیستم|مخفی).{0,40}(?:نشان|افشا|چاپ|ارسال)/u,
  /(?:ارسال|آپلود|منتشر).{0,40}(?:رمز|گذرواژه|توکن|پرامپت سیستم)/u,
] as const;

const opaqueEncodedPayloadPattern = /(?:^|\s)[A-Za-z0-9+/]{160,}={0,2}(?:\s|$)/u;

export class ModelInputSafetyService {
  readonly #limits: SafetyLimits;

  public constructor(limits: Partial<SafetyLimits> = {}) {
    this.#limits = validateLimits({ ...defaultSafetyLimits, ...limits });
  }

  public evaluate(input: unknown, evaluatedAt: Date): ModelInputSafetyResult {
    if (Number.isNaN(evaluatedAt.getTime())) {
      throw new ModelInputSafetyValidationError('Evaluation time is invalid.');
    }
    const hash = createHash('sha256');
    const drafts: FindingDraft[] = [];
    const findingKeys = new Set<string>();
    const ancestors = new WeakSet<object>();
    let scannedNodes = 0;
    let scannedStrings = 0;
    let scannedCharacters = 0;
    let limitFindingRecorded = false;

    const addFinding = (
      code: ModelInputSafetyFindingCode,
      severity: ModelInputSafetyFinding['severity'],
      fieldPath: string,
    ): void => {
      const key = `${code}:${fieldPath}`;
      if (findingKeys.has(key)) return;
      findingKeys.add(key);
      drafts.push({ code, severity, fieldPath });
    };

    const addLimitFinding = (fieldPath: string): void => {
      if (limitFindingRecorded) return;
      limitFindingRecorded = true;
      addFinding('scan_limit_exceeded', 'high', fieldPath);
    };

    const visit = (value: unknown, fieldPath: string, depth: number): void => {
      scannedNodes += 1;
      if (scannedNodes > this.#limits.maximumNodes || depth > this.#limits.maximumDepth) {
        hash.update(`${fieldPath}\0limit\0`);
        addLimitFinding(fieldPath);
        return;
      }
      if (value === null) {
        hash.update(`${fieldPath}\0null\0`);
        return;
      }
      if (typeof value === 'string') {
        scannedStrings += 1;
        scannedCharacters += value.length;
        hash.update(`${fieldPath}\0string\0${value}\0`);
        if (
          scannedStrings > this.#limits.maximumStrings ||
          scannedCharacters > this.#limits.maximumCharacters
        ) {
          addLimitFinding(fieldPath);
          return;
        }
        inspectString(value, fieldPath, addFinding);
        return;
      }
      if (typeof value === 'boolean') {
        hash.update(`${fieldPath}\0boolean\0${String(value)}\0`);
        return;
      }
      if (typeof value === 'number') {
        hash.update(`${fieldPath}\0number\0${String(value)}\0`);
        if (!Number.isFinite(value)) addFinding('unsupported_input_shape', 'high', fieldPath);
        return;
      }
      if (typeof value !== 'object') {
        hash.update(`${fieldPath}\0unsupported:${typeof value}\0`);
        addFinding('unsupported_input_shape', 'high', fieldPath);
        return;
      }
      if (value instanceof Date) {
        const time = value.getTime();
        hash.update(`${fieldPath}\0date\0${Number.isNaN(time) ? 'invalid' : value.toISOString()}\0`);
        if (Number.isNaN(time)) addFinding('unsupported_input_shape', 'high', fieldPath);
        return;
      }
      if (ancestors.has(value)) {
        hash.update(`${fieldPath}\0cycle\0`);
        addFinding('unsupported_input_shape', 'high', fieldPath);
        return;
      }
      ancestors.add(value);
      if (Array.isArray(value)) {
        hash.update(`${fieldPath}\0array:${String(value.length)}\0`);
        for (let index = 0; index < value.length; index += 1) {
          if (Object.hasOwn(value, index)) visit(value[index], `${fieldPath}[${String(index)}]`, depth + 1);
          else hash.update(`${fieldPath}[${String(index)}]\0hole\0`);
        }
        ancestors.delete(value);
        return;
      }
      const prototype = Object.getPrototypeOf(value) as unknown;
      if (prototype !== Object.prototype && prototype !== null) {
        hash.update(`${fieldPath}\0non-plain-object\0`);
        addFinding('unsupported_input_shape', 'high', fieldPath);
        ancestors.delete(value);
        return;
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (const key of Object.keys(descriptors).sort()) {
        const childPath = pathForKey(fieldPath, key);
        const descriptor = descriptors[key];
        hash.update(`${fieldPath}\0key\0${key}\0`);
        if (!descriptor || descriptor.get || descriptor.set) {
          hash.update(`${childPath}\0accessor\0`);
          addFinding('unsupported_input_shape', 'high', childPath);
          continue;
        }
        const descriptorValue = descriptor.value as unknown;
        visit(descriptorValue, childPath, depth + 1);
      }
      ancestors.delete(value);
    };

    visit(input, '$', 0);
    const scanSha256 = hash.digest('hex');
    const findings = drafts.map((finding) => ({
      ...finding,
      fingerprint: sha256(
        `${modelInputSafetyPolicyVersion}:${scanSha256}:${finding.code}:${finding.fieldPath}`,
      ),
    }));
    return {
      policyVersion: modelInputSafetyPolicyVersion,
      evaluatedAt,
      disposition: findings.length === 0 ? 'allow' : 'deny',
      scanSha256,
      rawInputRetained: false,
      scannedNodes,
      scannedStrings,
      scannedCharacters,
      findings,
    };
  }

  public snapshot(generatedAt: Date): ModelInputSafetySnapshot {
    if (Number.isNaN(generatedAt.getTime())) {
      throw new ModelInputSafetyValidationError('Snapshot time is invalid.');
    }
    return {
      policyVersion: modelInputSafetyPolicyVersion,
      generatedAt,
      required: true,
      failClosed: true,
      rawInputRetained: false,
      rules: modelInputSafetyFindingCodes.map((id) => ({ id, action: 'deny' })),
      limits: this.#limits,
    };
  }
}

export class ModelInputSafetyValidationError extends Error {}

function inspectString(
  value: string,
  fieldPath: string,
  addFinding: (
    code: ModelInputSafetyFindingCode,
    severity: ModelInputSafetyFinding['severity'],
    fieldPath: string,
  ) => void,
): void {
  const normalized = value.normalize('NFKC');
  if (credentialPatterns.some((pattern) => pattern.test(normalized))) {
    addFinding('credential_material', 'critical', fieldPath);
  }
  if (promptInjectionPatterns.some((pattern) => pattern.test(normalized))) {
    addFinding('prompt_injection', 'critical', fieldPath);
  }
  if (opaqueEncodedPayloadPattern.test(normalized)) {
    addFinding('opaque_encoded_payload', 'high', fieldPath);
  }
}

function pathForKey(parent: string, key: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/u.test(key)) return `${parent}.${key}`;
  return `${parent}[key:${sha256(key).slice(0, 12)}]`;
}

function validateLimits(limits: SafetyLimits): SafetyLimits {
  for (const [label, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 10_000_000) {
      throw new ModelInputSafetyValidationError(`${label} is invalid.`);
    }
  }
  return limits;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

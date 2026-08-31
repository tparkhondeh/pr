import type { TenantId, UserId } from '../kernel/identity.js';

declare const evidenceIdBrand: unique symbol;
declare const assertionIdBrand: unique symbol;

export type EvidenceId = string & { readonly [evidenceIdBrand]: true };
export type AssertionId = string & { readonly [assertionIdBrand]: true };

export type EpistemicType =
  | 'fact'
  | 'observation'
  | 'self_report'
  | 'external_perception'
  | 'behavioral_evidence'
  | 'hypothesis'
  | 'inference'
  | 'uncertainty';

export type EvidenceRelation = Readonly<{
  evidenceId: EvidenceId;
  relation: 'supports' | 'contradicts';
  rationale?: string;
}>;

export type Assertion = Readonly<{
  id: AssertionId;
  tenantId: TenantId;
  subjectRef: string;
  predicate: string;
  value: unknown;
  epistemicType: EpistemicType;
  confidence?: number;
  confidenceRationale?: string | undefined;
  evidence: readonly EvidenceRelation[];
  validFrom?: Date;
  validTo?: Date;
  createdAt: Date;
  createdBy: UserId;
  contestedAt?: Date;
  contestReason?: string;
  supersededById?: AssertionId;
}>;

export type NewAssertion = Omit<
  Assertion,
  'evidence' | 'contestedAt' | 'contestReason' | 'supersededById'
> &
  Readonly<{ evidence: readonly EvidenceRelation[] }>;

export function evidenceId(value: string): EvidenceId {
  return validatedId(value, 'Evidence') as EvidenceId;
}

export function assertionId(value: string): AssertionId {
  return validatedId(value, 'Assertion') as AssertionId;
}

export function createAssertion(input: NewAssertion): Assertion {
  if (input.subjectRef.trim().length === 0) {
    throw new Error('Assertion subject is required.');
  }
  if (input.predicate.trim().length === 0) {
    throw new Error('Assertion predicate is required.');
  }
  validateConfidence(input.confidence, input.confidenceRationale);
  if (input.validFrom && input.validTo && input.validTo <= input.validFrom) {
    throw new Error('Assertion validity interval is invalid.');
  }
  if (
    input.epistemicType !== 'uncertainty' &&
    input.evidence.length === 0
  ) {
    throw new Error('An assertion must reference evidence or be uncertainty.');
  }
  if (new Set(input.evidence.map((item) => item.evidenceId)).size !== input.evidence.length) {
    throw new Error('Duplicate evidence relation.');
  }
  return { ...input };
}

export function contestAssertion(
  assertion: Assertion,
  reason: string,
  contestedAt: Date,
): Assertion {
  if (assertion.contestedAt) throw new Error('Assertion is already contested.');
  if (assertion.supersededById) throw new Error('Superseded assertion cannot be contested.');
  if (reason.trim().length < 3) throw new Error('Contest reason is required.');
  if (contestedAt < assertion.createdAt) {
    throw new Error('Contest time cannot predate assertion creation.');
  }
  return { ...assertion, contestedAt, contestReason: reason.trim() };
}

export function supersedeAssertion(
  previous: Assertion,
  replacement: Assertion,
): Assertion {
  if (previous.tenantId !== replacement.tenantId) {
    throw new Error('Assertions from different tenants cannot be linked.');
  }
  if (previous.id === replacement.id) {
    throw new Error('An assertion cannot supersede itself.');
  }
  if (previous.supersededById) throw new Error('Assertion is already superseded.');
  if (replacement.createdAt < previous.createdAt) {
    throw new Error('Replacement cannot predate the previous assertion.');
  }
  return {
    ...previous,
    validTo: replacement.validFrom ?? replacement.createdAt,
    supersededById: replacement.id,
  };
}

export function isAssertionUsable(assertion: Assertion, at: Date): boolean {
  if (assertion.contestedAt && assertion.contestedAt <= at) return false;
  if (assertion.validFrom && assertion.validFrom > at) return false;
  if (assertion.validTo && assertion.validTo <= at) return false;
  return true;
}

function validatedId(value: string, label: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(value)) {
    throw new Error(`${label} ID must be 3-64 safe characters.`);
  }
  return value;
}

function validateConfidence(
  confidence: number | undefined,
  rationale: string | undefined,
): void {
  if (confidence === undefined) return;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('Confidence must be between 0 and 1.');
  }
  if (!rationale || rationale.trim().length < 3) {
    throw new Error('Confidence requires a rationale.');
  }
}

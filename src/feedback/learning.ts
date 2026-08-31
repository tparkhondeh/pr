import type { TenantId, UserId } from '../kernel/identity.js';

export type FeedbackEvent = Readonly<{
  id: string;
  tenantId: TenantId;
  userId: UserId;
  artifactType: string;
  artifactId: string;
  eventType: 'accepted' | 'rejected' | 'edited' | 'regret' | 'energy_report';
  signalKey?: string;
  signalValue?: unknown;
  satisfaction?: 1 | 2 | 3 | 4 | 5;
  regret?: 1 | 2 | 3 | 4 | 5;
  energy?: 1 | 2 | 3 | 4 | 5;
  occurredAt: Date;
}>;

export type PreferenceProposal = Readonly<{
  id: string;
  tenantId: TenantId;
  userId: UserId;
  preferenceKey: string;
  proposedValue: unknown;
  evidenceEventIds: readonly string[];
  rationale: string;
  confidence: number;
  status: 'proposed' | 'applied' | 'rejected' | 'revoked';
  proposedAt: Date;
  decidedAt?: Date;
  decidedBy?: UserId;
}>;

export function validateFeedback(event: FeedbackEvent): FeedbackEvent {
  if (event.artifactType.trim().length === 0 || event.artifactId.trim().length === 0) {
    throw new Error('Feedback must reference an artifact.');
  }
  if ((event.signalKey === undefined) !== (event.signalValue === undefined)) {
    throw new Error('Feedback signal key and value must be provided together.');
  }
  return event;
}

export function proposePreference(
  id: string,
  tenantId: TenantId,
  userId: UserId,
  preferenceKey: string,
  events: readonly FeedbackEvent[],
  proposedAt: Date,
  minimumEvidence = 3,
): PreferenceProposal | undefined {
  if (!Number.isInteger(minimumEvidence) || minimumEvidence < 2) {
    throw new Error('Preference evidence threshold must be at least 2.');
  }
  const relevant = events
    .map(validateFeedback)
    .filter(
      (event) =>
        event.tenantId === tenantId &&
        event.userId === userId &&
        event.eventType === 'edited' &&
        event.signalKey === preferenceKey &&
        event.occurredAt <= proposedAt,
    );
  const groups = new Map<string, FeedbackEvent[]>();
  for (const event of relevant) {
    const key = stableValue(event.signalValue);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  const strongest = [...groups.entries()].sort(
    (left, right) => right[1].length - left[1].length,
  )[0];
  if (!strongest || strongest[1].length < minimumEvidence) return undefined;

  const confidence = Math.min(0.95, strongest[1].length / (minimumEvidence + 2));
  return {
    id,
    tenantId,
    userId,
    preferenceKey,
    proposedValue: strongest[1][0]?.signalValue,
    evidenceEventIds: strongest[1].map((event) => event.id),
    rationale: `${String(strongest[1].length)} consistent user edits support this preference.`,
    confidence,
    status: 'proposed',
    proposedAt,
  };
}

export function decidePreference(
  proposal: PreferenceProposal,
  decision: 'applied' | 'rejected',
  decidedBy: UserId,
  decidedAt: Date,
): PreferenceProposal {
  if (proposal.status !== 'proposed') throw new Error('Preference proposal is already decided.');
  if (decidedAt < proposal.proposedAt) throw new Error('Decision cannot predate proposal.');
  return { ...proposal, status: decision, decidedBy, decidedAt };
}

export function revokePreference(
  proposal: PreferenceProposal,
  decidedBy: UserId,
  decidedAt: Date,
): PreferenceProposal {
  if (proposal.status !== 'applied') throw new Error('Only applied preferences can be revoked.');
  return { ...proposal, status: 'revoked', decidedBy, decidedAt };
}

function stableValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableValue(object[key])}`)
    .join(',')}}`;
}


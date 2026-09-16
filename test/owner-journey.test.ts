import { describe, expect, it } from 'vitest';
import { buildOwnerJourney, type OwnerJourneyInput } from '../apps/web/src/owner-journey.js';

function fixture(): OwnerJourneyInput & {
  workbench: NonNullable<OwnerJourneyInput['workbench']>;
  draft: NonNullable<OwnerJourneyInput['draft']>;
} {
  return {
    workbench: { goal: { revision: 2 }, evidence: { state: 'grounded', strategyEvidenceCount: 1 },
      workflow: { status: 'approved', approvedActionId: 'content' },
      actions: [{ id: 'content', kind: 'content' }, { id: 'silence', kind: 'no_action' }] },
    onboarding: { strategyReadiness: { ready: true, evidenceCount: 1 } },
    draft: { draftId: 'draft1', status: 'exported', sourceAvailable: true, staleStrategy: false,
      strategyRevision: 2, guard: { mayRequestApproval: true } },
    feedback: { recentEvents: [{ artifactId: 'draft1', eventType: 'edited' }] },
    draftLoaded: true, feedbackLoaded: true,
  };
}
const state = (input: OwnerJourneyInput, id: string) => buildOwnerJourney(input).steps.find(step => step.id === id)?.state;

describe('owner journey: evidence-driven first-use guidance', () => {
  it('does not invent completion for unloaded data', () => {
    const journey = buildOwnerJourney({ workbench: null, onboarding: null, draft: null, feedback: null,
      draftLoaded: false, feedbackLoaded: false });
    expect(journey.completed).toBe(0);
    expect(journey.steps.every(step => step.state === 'unknown')).toBe(true);
    expect(journey.next.view).toBe('intake');
  });
  it('never counts the default goal as a saved personal goal', () => {
    const input = fixture();
    expect(state({ ...input, workbench: { ...input.workbench, goal: { revision: 1 } } }, 'goal')).toBe('current');
  });
  it('does not count withheld evidence as ready even when one snapshot is stale', () => {
    const input = { ...fixture(), onboarding: { strategyReadiness: { ready: false, evidenceCount: 0 } } };
    expect(state(input, 'evidence')).toBe('current');
    expect(state(input, 'export')).not.toBe('complete');
  });
  it('distinguishes unknown draft from a loaded empty workspace', () => {
    expect(state({ ...fixture(), draft: null, draftLoaded: false }, 'draft')).toBe('unknown');
    expect(state({ ...fixture(), draft: null }, 'draft')).toBe('current');
  });
  it('does not complete stages from retained objects after invalidation or a failed refresh', () => {
    const input = { ...fixture(), draftLoaded: false, feedbackLoaded: false };
    expect(state(input, 'draft')).toBe('unknown');
    expect(state(input, 'export')).toBe('unknown');
    expect(state(input, 'feedback')).toBe('unknown');
    expect(state({ ...fixture(), feedbackLoaded: false }, 'feedback')).toBe('unknown');
  });
  it('blocks a revoked draft source even when another permitted source keeps strategy ready', () => {
    const input = fixture();
    expect(state({ ...input, draft: { ...input.draft, sourceAvailable: false } }, 'export')).toBe('blocked');
  });
  it('keeps no-action valid without forcing content creation', () => {
    const input = fixture();
    const journey = buildOwnerJourney({ ...input, workbench: { ...input.workbench,
      workflow: { status: 'approved', approvedActionId: 'silence' } } });
    expect(journey.steps.find(step => step.id === 'action')?.state).toBe('complete');
    expect(journey.steps.filter(step => step.state === 'optional')).toHaveLength(3);
  });
  it.each([
    { sourceAvailable: false }, { staleStrategy: true }, { strategyRevision: 1 },
    { guard: { mayRequestApproval: false } }, { status: 'guard_failed' },
  ])('requires renewed review when a draft is invalidated: %j', (change) => {
    const input = fixture();
    const updated = { ...input, draft: { ...input.draft, ...change } };
    expect(state(updated, 'draft')).toBe('blocked');
    expect(state(updated, 'export')).toBe('blocked');
    expect(state(updated, 'feedback')).not.toBe('complete');
  });
  it('does not retain approval completion after editing a draft', () => {
    const input = fixture();
    expect(state({ ...input, draft: { ...input.draft, status: 'awaiting_approval' } }, 'export')).toBe('current');
  });
  it('does not count unrelated feedback or acceptance as current-draft learning', () => {
    expect(state({ ...fixture(), feedback: { recentEvents: [{ artifactId: 'other', eventType: 'edited' }] } }, 'feedback')).toBe('current');
    expect(state({ ...fixture(), feedback: { recentEvents: [{ artifactId: 'draft1', eventType: 'accepted' }] } }, 'feedback')).toBe('current');
  });
  it('does not infer action approval from a draft or cancelled workflow', () => {
    const input = fixture();
    expect(state({ ...input, workbench: { ...input.workbench, workflow: { status: 'cancelled', approvedActionId: 'content' } } }, 'action')).toBe('current');
  });
  it('reports recorded cycle without claiming product acceptance', () => {
    const journey = buildOwnerJourney(fixture());
    expect(journey.completed).toBe(6);
    expect(journey.next.view).toBe('learning');
    expect(journey.steps.find(step => step.id === 'export')?.description).toContain('به معنی انتشار یا پذیرش نهایی شما نیست');
  });
});

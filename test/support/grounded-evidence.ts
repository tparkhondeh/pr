import type { OwnerEvidenceContextProvider } from '../../src/workbench/evidence-context.js';

export function groundedEvidence(
  generatedAt: Date = new Date('2026-08-31T12:00:00.000Z'),
): OwnerEvidenceContextProvider {
  return {
    snapshot: () => Promise.resolve({
      generatedAt,
      persistence: 'memory',
      maturity: {
        percent: 23,
        evidenceCount: 1,
        sourceTypes: ['text_asset'],
        components: {
          importedEvidence: 15,
          confirmedSelfReports: 0,
          sourceDiversity: 8,
          exercisedDataControl: 0,
        },
        nextStep: 'یک برداشت گفت‌وگویی را تأیید یا اصلاح کنید.',
      },
      strategy: {
        evidenceIds: ['evidence_asset_one'],
        assertionIds: ['assertion_asset_one'],
        sourceTypes: ['text_asset'],
        withheldEvidenceCount: 0,
      },
      openContradictions: 0,
    }),
  };
}

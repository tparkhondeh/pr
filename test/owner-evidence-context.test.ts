import { describe, expect, it } from 'vitest';
import type { TextAssetSnapshot } from '../src/assets/text-asset-intake.js';
import type { PersonalMemorySnapshot } from '../src/conversation/intake.js';
import { calculateOwnerEvidenceContext } from '../src/workbench/evidence-context.js';

const at = new Date('2026-08-31T12:00:00.000Z');

function assets(brandUsage: boolean): TextAssetSnapshot {
  return {
    generatedAt: at,
    persistence: 'memory',
    summary: { assets: 1, evidenceItems: 1, assertions: 1, dataRights: 0 },
    records: [{
      requestId: 'asset_context_one',
      assetId: 'asset_context_one',
      evidenceId: 'evidence_context_one',
      assertionId: 'assertion_context_one',
      title: 'یادداشت واقعی تصمیم‌گیری',
      content: 'یک متن واقعی درباره تصمیم‌گیری شفاف در شرایط ابهام و محدودیت.',
      assertionText: 'شفافیت درباره محدودیت‌ها برای من بخشی از تصمیم مسئولانه است.',
      sourceType: 'text_asset',
      dataClass: 'confidential',
      integritySha256: 'a'.repeat(64),
      occurredAt: at,
      importedAt: at,
      permissions: { personalUnderstanding: true, brandUsage },
    }],
  };
}

const emptyMemory: PersonalMemorySnapshot = {
  generatedAt: at,
  persistence: 'memory',
  summary: { total: 0, active: 0, attentionRequired: 0, deleted: 0 },
  records: [],
};

describe('owner evidence context', () => {
  it('counts personal maturity without silently granting strategy usage', () => {
    const context = calculateOwnerEvidenceContext(assets(false), emptyMemory, at);
    expect(context.maturity).toMatchObject({ percent: 23, evidenceCount: 1 });
    expect(context.strategy).toEqual({
      evidenceIds: [],
      assertionIds: [],
      sourceTypes: [],
      withheldEvidenceCount: 1,
    });
  });

  it('makes only explicitly brand-authorized evidence available to recommendations', () => {
    const context = calculateOwnerEvidenceContext(assets(true), emptyMemory, at);
    expect(context.strategy).toEqual({
      evidenceIds: ['evidence_context_one'],
      assertionIds: ['assertion_context_one'],
      sourceTypes: ['text_asset'],
      withheldEvidenceCount: 0,
    });
  });
});

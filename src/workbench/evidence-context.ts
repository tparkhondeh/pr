import type { TextAssetIntakeService, TextAssetSnapshot } from '../assets/text-asset-intake.js';
import type { ConversationIntakeService, PersonalMemorySnapshot } from '../conversation/intake.js';
import type { TenantId, UserId } from '../kernel/identity.js';

export type PersonalModelMaturity = Readonly<{
  percent: number;
  evidenceCount: number;
  sourceTypes: readonly string[];
  components: Readonly<{
    importedEvidence: number;
    confirmedSelfReports: number;
    sourceDiversity: number;
    exercisedDataControl: number;
  }>;
  nextStep: string;
}>;

export type OwnerEvidenceContextSnapshot = Readonly<{
  generatedAt: Date;
  persistence: 'memory' | 'postgres' | 'mixed';
  maturity: PersonalModelMaturity;
  strategy: Readonly<{
    evidenceIds: readonly string[];
    assertionIds: readonly string[];
    sourceTypes: readonly string[];
    withheldEvidenceCount: number;
  }>;
  openContradictions: number;
}>;

export interface OwnerEvidenceContextProvider {
  snapshot(): Promise<OwnerEvidenceContextSnapshot>;
}

export class OwnerEvidenceContextService implements OwnerEvidenceContextProvider {
  public constructor(
    private readonly assets: Pick<TextAssetIntakeService, 'snapshot'>,
    private readonly conversation: Pick<ConversationIntakeService, 'memorySnapshot'>,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async snapshot(): Promise<OwnerEvidenceContextSnapshot> {
    const generatedAt = this.clock();
    const [assets, memory] = await Promise.all([
      this.assets.snapshot(this.identity.ownerUserId, generatedAt),
      this.conversation.memorySnapshot({
        tenantId: this.identity.tenantId,
        actorId: this.identity.ownerUserId,
        generatedAt,
      }),
    ]);
    return calculateOwnerEvidenceContext(assets, memory, generatedAt);
  }
}

export function calculateOwnerEvidenceContext(
  assets: TextAssetSnapshot,
  memory: PersonalMemorySnapshot,
  generatedAt: Date,
): OwnerEvidenceContextSnapshot {
  const activeMemory = memory.records.filter((record) => record.lifecycle.status === 'active');
  const controlledMemory = memory.records.some((record) => record.lifecycle.status !== 'active');
  const sourceTypes = new Set([
    ...assets.records.map((record) => record.sourceType),
    ...activeMemory.flatMap((record) => record.provenance.sourceTypes),
  ]);
  const components = {
    importedEvidence: Math.min(45, assets.summary.evidenceItems * 15),
    confirmedSelfReports: Math.min(30, activeMemory.length * 10),
    sourceDiversity: Math.min(15, sourceTypes.size * 8),
    exercisedDataControl: controlledMemory || assets.summary.dataRights > 0 ? 10 : 0,
  };
  const evidenceCount = assets.summary.evidenceItems + activeMemory.reduce(
    (total, record) => total + record.provenance.evidenceCount,
    0,
  );
  const strategyAssets = assets.records.filter((record) => record.permissions.brandUsage);
  const strategyMemory = activeMemory.filter((record) => record.consent.brandUsage);
  const strategyEvidenceIds = distinct([
    ...strategyAssets.map((record) => record.evidenceId),
    ...strategyMemory.flatMap((record) => record.provenance.evidenceIds),
  ]);
  const strategyAssertionIds = distinct([
    ...strategyAssets.map((record) => record.assertionId),
    ...strategyMemory.map((record) => record.assertionId),
  ]);
  const strategySourceTypes = distinct([
    ...strategyAssets.map((record) => record.sourceType),
    ...strategyMemory.flatMap((record) => record.provenance.sourceTypes),
  ]);
  return {
    generatedAt,
    persistence: assets.persistence === memory.persistence ? assets.persistence : 'mixed',
    maturity: {
      percent: Math.min(100, Object.values(components).reduce((total, value) => total + value, 0)),
      evidenceCount,
      sourceTypes: [...sourceTypes].sort(),
      components,
      nextStep: assets.summary.assets === 0
        ? 'یک یادداشت یا متن واقعی وارد کنید.'
        : activeMemory.length === 0
          ? 'یک برداشت گفت‌وگویی را تأیید یا اصلاح کنید.'
          : sourceTypes.size < 2
            ? 'یک شاهد از نوع متفاوت اضافه کنید.'
            : 'مدل را با اصلاح‌ها و شواهد مستقل دقیق‌تر کنید.',
    },
    strategy: {
      evidenceIds: strategyEvidenceIds,
      assertionIds: strategyAssertionIds,
      sourceTypes: strategySourceTypes,
      withheldEvidenceCount: Math.max(0, evidenceCount - strategyEvidenceIds.length),
    },
    openContradictions: memory.records.filter(
      (record) => record.lifecycle.status === 'contested',
    ).length,
  };
}

function distinct(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

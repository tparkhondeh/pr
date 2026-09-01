import type { TextAssetIntakeService, TextAssetRecord } from '../assets/text-asset-intake.js';
import type { FeedbackLearningService } from '../feedback/workspace.js';
import type { PreferenceProposal } from '../feedback/learning.js';
import type { TenantId, UserId } from '../kernel/identity.js';

export type ExpressionGateLevel = 'green' | 'yellow' | 'red';
export type ExpressionGateOutcome = 'pass' | 'revise' | 'block';
export type ExpressionFindingDimension = 'grounding' | 'specificity' | 'generic_language' | 'voice_alignment';

export type NarrativeSeed = Readonly<{
  narrativeId: string;
  title: string;
  premise: string;
  maturity: 'single_source';
  source: Readonly<{
    kind: 'text_asset';
    ref: string;
    assertionId: string;
    evidenceId: string;
  }>;
  epistemicType: 'evidence_backed_candidate';
  privacy: Readonly<{
    dataClass: 'confidential';
    allowedPurpose: 'brand_strategy';
    externalActionPermitted: false;
  }>;
}>;

export type VoiceSignal = Readonly<{
  preferenceId: string;
  key: string;
  value: unknown;
  status: 'proposed' | 'applied';
  evidenceCount: number;
  confidence: number;
  rationale: string;
}>;

export type AuthenticExpressionSnapshot = Readonly<{
  generatedAt: Date;
  persistence: 'memory' | 'postgres' | 'mixed';
  policyVersion: 'authentic-expression-v1';
  summary: Readonly<{
    narrativeSeeds: number;
    evidenceBoundSeeds: number;
    proposedVoiceSignals: number;
    appliedVoiceSignals: number;
    voiceMaturity: 'uninitialized' | 'learning' | 'confirmed';
  }>;
  narrativeSeeds: readonly NarrativeSeed[];
  voiceSignals: readonly VoiceSignal[];
  boundaries: Readonly<{
    narrativeSeedIsBrandFact: false;
    voiceProposalAppliesAutomatically: false;
    factCheckIncluded: false;
    externalActionPermitted: false;
  }>;
}>;

export type ExpressionGateFinding = Readonly<{
  dimension: ExpressionFindingDimension;
  level: ExpressionGateLevel;
  code: string;
  rationale: string;
  requiredChange: string | null;
}>;

export type AuthenticExpressionReview = Readonly<{
  reviewedAt: Date;
  policyVersion: 'authentic-expression-v1';
  outcome: ExpressionGateOutcome;
  findings: readonly ExpressionGateFinding[];
  selectedSources: readonly Readonly<{
    ref: string;
    title: string;
    assertionId: string;
    evidenceId: string;
  }>[];
  matchedPersonalTerms: readonly string[];
  genericPhrases: readonly string[];
  appliedVoicePreferences: number;
  boundaries: Readonly<{
    factCheckIncluded: false;
    claimApprovalGranted: false;
    publicApprovalGranted: false;
    externalActionPermitted: false;
  }>;
}>;

export class AuthenticExpressionValidationError extends Error {}
export class AuthenticExpressionPermissionError extends Error {}

export class AuthenticExpressionService {
  public constructor(
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
    private readonly assets: Pick<TextAssetIntakeService, 'snapshot'>,
    private readonly feedback: Pick<FeedbackLearningService, 'snapshot'>,
  ) {}

  public async snapshot(actorId: UserId, generatedAt: Date): Promise<AuthenticExpressionSnapshot> {
    this.assertOwner(actorId);
    validateDate(generatedAt, 'Expression snapshot');
    const [assets, feedback] = await Promise.all([
      this.assets.snapshot(actorId, generatedAt),
      this.feedback.snapshot(actorId, generatedAt),
    ]);
    const narrativeSeeds = assets.records.filter((record) => record.permissions.brandUsage).map(narrativeSeed);
    const voiceSignals = feedback.preferences
      .filter((preference) => preference.status === 'proposed' || preference.status === 'applied')
      .map(voiceSignal)
      .sort((left, right) => left.key.localeCompare(right.key));
    const appliedVoiceSignals = voiceSignals.filter((signal) => signal.status === 'applied').length;
    const proposedVoiceSignals = voiceSignals.filter((signal) => signal.status === 'proposed').length;
    return {
      generatedAt,
      persistence: assets.persistence === feedback.persistence ? assets.persistence : 'mixed',
      policyVersion: 'authentic-expression-v1',
      summary: {
        narrativeSeeds: narrativeSeeds.length,
        evidenceBoundSeeds: narrativeSeeds.length,
        proposedVoiceSignals,
        appliedVoiceSignals,
        voiceMaturity: appliedVoiceSignals > 0 ? 'confirmed' : proposedVoiceSignals > 0 ? 'learning' : 'uninitialized',
      },
      narrativeSeeds,
      voiceSignals,
      boundaries: {
        narrativeSeedIsBrandFact: false,
        voiceProposalAppliesAutomatically: false,
        factCheckIncluded: false,
        externalActionPermitted: false,
      },
    };
  }

  public async review(input: Readonly<{
    actorId: UserId;
    content: string;
    assetRefs: readonly string[];
    reviewedAt: Date;
  }>): Promise<AuthenticExpressionReview> {
    this.assertOwner(input.actorId);
    validateText(input.content, 20, 20_000, 'Expression content');
    validateDate(input.reviewedAt, 'Expression review');
    if (!Array.isArray(input.assetRefs) || input.assetRefs.length > 5 || input.assetRefs.some((ref) => !validAssetRef(ref))) {
      throw new AuthenticExpressionValidationError('Expression asset references are invalid.');
    }
    if (new Set(input.assetRefs).size !== input.assetRefs.length) {
      throw new AuthenticExpressionValidationError('Expression asset references must be unique.');
    }
    const [assets, feedback] = await Promise.all([
      this.assets.snapshot(input.actorId, input.reviewedAt),
      this.feedback.snapshot(input.actorId, input.reviewedAt),
    ]);
    const selected = input.assetRefs.map((ref) => assets.records.find((record) => record.assetId === ref));
    if (selected.some((record) => !record || !record.permissions.brandUsage)) {
      throw new AuthenticExpressionPermissionError('Expression source is missing or not authorized for brand usage.');
    }
    const selectedAssets = selected.filter((record): record is TextAssetRecord => Boolean(record));
    const applied = feedback.preferences.filter((preference) => preference.status === 'applied');
    const matchedPersonalTerms = personalTermMatches(input.content, selectedAssets);
    const genericPhrases = findGenericPhrases(input.content);
    const findings = [
      groundingFinding(selectedAssets),
      specificityFinding(selectedAssets, matchedPersonalTerms),
      genericLanguageFinding(genericPhrases),
      voiceAlignmentFinding(input.content, applied),
    ];
    return {
      reviewedAt: input.reviewedAt,
      policyVersion: 'authentic-expression-v1',
      outcome: findings.some((finding) => finding.level === 'red')
        ? 'block'
        : findings.some((finding) => finding.level === 'yellow') ? 'revise' : 'pass',
      findings,
      selectedSources: selectedAssets.map((record) => ({
        ref: record.assetId,
        title: record.title,
        assertionId: record.assertionId,
        evidenceId: record.evidenceId,
      })),
      matchedPersonalTerms,
      genericPhrases,
      appliedVoicePreferences: applied.length,
      boundaries: {
        factCheckIncluded: false,
        claimApprovalGranted: false,
        publicApprovalGranted: false,
        externalActionPermitted: false,
      },
    };
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) {
      throw new AuthenticExpressionPermissionError('Only the owner can inspect the expression profile.');
    }
  }
}

function narrativeSeed(record: TextAssetRecord): NarrativeSeed {
  return {
    narrativeId: `narrative_${record.assetId}`,
    title: record.title,
    premise: record.assertionText,
    maturity: 'single_source',
    source: {
      kind: 'text_asset',
      ref: record.assetId,
      assertionId: record.assertionId,
      evidenceId: record.evidenceId,
    },
    epistemicType: 'evidence_backed_candidate',
    privacy: {
      dataClass: 'confidential',
      allowedPurpose: 'brand_strategy',
      externalActionPermitted: false,
    },
  };
}

function voiceSignal(preference: PreferenceProposal): VoiceSignal {
  return {
    preferenceId: preference.id,
    key: preference.preferenceKey,
    value: preference.proposedValue,
    status: preference.status as 'proposed' | 'applied',
    evidenceCount: preference.evidenceEventIds.length,
    confidence: preference.confidence,
    rationale: preference.rationale,
  };
}

function groundingFinding(selected: readonly TextAssetRecord[]): ExpressionGateFinding {
  return selected.length > 0
    ? finding('grounding', 'green', 'authorized_evidence_attached', 'حداقل یک Asset مجاز و قابل‌ردیابی به متن متصل است.', null)
    : finding('grounding', 'red', 'missing_personal_evidence', 'متن به هیچ Asset شخصی مجاز متصل نیست و نسبت‌دادن آن به فرد قابل دفاع نیست.', 'حداقل یک Asset دارای اجازه Brand Usage انتخاب کنید.');
}

function specificityFinding(selected: readonly TextAssetRecord[], matches: readonly string[]): ExpressionGateFinding {
  if (selected.length === 0) {
    return finding('specificity', 'red', 'specificity_not_testable', 'بدون منبع شخصی، اختصاصی‌بودن متن قابل سنجش نیست.', 'ابتدا یک منبع شخصی مجاز متصل کنید.');
  }
  return matches.length >= 2
    ? finding('specificity', 'green', 'personal_detail_present', 'متن حداقل دو نشانه متمایز از منابع انتخاب‌شده را حفظ کرده است.', null)
    : finding('specificity', 'yellow', 'weak_personal_specificity', 'اتصال منبع ثبت شده اما نشانه‌های متمایز آن در متن کم‌رنگ است.', 'یک جزئیات، تصمیم، مشاهده یا عبارت مشخص از منبع را با حفظ صحت وارد متن کنید.');
}

function genericLanguageFinding(phrases: readonly string[]): ExpressionGateFinding {
  return phrases.length === 0
    ? finding('generic_language', 'green', 'no_known_generic_phrase', 'هیچ‌یک از الگوهای کلیشه‌ای شناخته‌شده در متن پیدا نشد.', null)
    : finding('generic_language', 'yellow', 'generic_ai_language_detected', `عبارت‌های کلیشه‌ای شناسایی شد: ${phrases.join('، ')}`, 'عبارت‌های کلی را با مشاهده و زبان مشخص خود فرد جایگزین کنید.');
}

function voiceAlignmentFinding(content: string, preferences: readonly PreferenceProposal[]): ExpressionGateFinding {
  if (preferences.length === 0) {
    return finding('voice_alignment', 'green', 'voice_model_uninitialized', 'هنوز Preference تأییدشده کافی برای رد یا تأیید Voice Alignment وجود ندارد.', null);
  }
  const conflicts = preferences.flatMap((preference) => voiceConflict(content, preference));
  return conflicts.length === 0
    ? finding('voice_alignment', 'green', 'approved_voice_preferences_respected', 'متن با Preferenceهای Voice تأییدشده تعارض شناخته‌شده ندارد.', null)
    : finding('voice_alignment', 'yellow', 'approved_voice_preference_conflict', conflicts.join(' '), 'متن را با Preferenceهای تأییدشده بازتنظیم کنید یا خود Preference را در بخش یادگیری بازبینی کنید.');
}

function voiceConflict(content: string, preference: PreferenceProposal): readonly string[] {
  const value = String(preference.proposedValue);
  if (preference.preferenceKey === 'voice.draft_length' && value === 'shorter' && content.length > 1_200) {
    return ['متن از الگوی تأییدشده «کوتاه‌تر» بلندتر است.'];
  }
  if (preference.preferenceKey === 'voice.draft_length' && value === 'longer' && content.length < 300) {
    return ['متن از الگوی تأییدشده «مبسوط‌تر» کوتاه‌تر است.'];
  }
  const firstLine = content.split(/\r?\n/u).find((line) => line.trim().length > 0)?.trim() ?? '';
  if (preference.preferenceKey === 'voice.headline_length' && value === 'shorter' && firstLine.length > 72) {
    return ['تیتر نخست از ترجیح تأییدشده برای تیتر کوتاه عبور کرده است.'];
  }
  const headings = content.split(/\r?\n/u).filter((line) => /^#{1,6}\s|^[^.!؟?]{3,60}:\s*$/u.test(line.trim())).length;
  if (preference.preferenceKey === 'voice.heading_density' && value === 'lower' && headings > 2) {
    return ['تعداد میان‌تیترها با ترجیح تأییدشده برای تراکم کمتر هم‌راستا نیست.'];
  }
  if (preference.preferenceKey === 'voice.question_cta' && value === 'omit' && /[؟?]\s*$/u.test(content.trim())) {
    return ['متن با پرسش پایانی تمام می‌شود، درحالی‌که حذف Question CTA تأیید شده است.'];
  }
  return [];
}

const genericPatterns: readonly Readonly<{ label: string; pattern: RegExp }>[] = [
  { label: 'در دنیای امروز', pattern: /در دنیای امروز/iu },
  { label: 'در مسیر موفقیت', pattern: /در مسیر موفقیت/iu },
  { label: 'همه ما می‌دانیم', pattern: /همه(?:‌| )ما می(?:‌| )دانیم/iu },
  { label: 'بازی را تغییر می‌دهد', pattern: /بازی را تغییر می(?:‌| )دهد/iu },
  { label: "in today's fast-paced world", pattern: /in today['’]s fast[- ]paced world/iu },
  { label: 'unlock your potential', pattern: /unlock (?:your|the) potential/iu },
  { label: 'game changer', pattern: /game[- ]changer/iu },
  { label: "it's not about", pattern: /it['’]s not about .{0,80}it['’]s about/iu },
];

function findGenericPhrases(content: string): readonly string[] {
  return genericPatterns.filter(({ pattern }) => pattern.test(content)).map(({ label }) => label);
}

const stopTerms = new Set([
  'برای', 'اینکه', 'است', 'هست', 'شود', 'شده', 'کردن', 'درباره', 'یعنی', 'اما', 'اگر', 'یک',
  'that', 'this', 'with', 'from', 'have', 'about', 'were', 'been', 'into', 'your', 'their',
]);

function personalTermMatches(content: string, assets: readonly TextAssetRecord[]): readonly string[] {
  const contentTerms = new Set(terms(content));
  return [...new Set(assets.flatMap((asset) => terms(`${asset.title} ${asset.assertionText}`)))]
    .filter((term) => contentTerms.has(term))
    .sort()
    .slice(0, 20);
}

function terms(value: string): readonly string[] {
  return value.toLocaleLowerCase('fa-IR').split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4 && !stopTerms.has(term));
}

function finding(
  dimension: ExpressionFindingDimension,
  level: ExpressionGateLevel,
  code: string,
  rationale: string,
  requiredChange: string | null,
): ExpressionGateFinding {
  return { dimension, level, code, rationale, requiredChange };
}

function validAssetRef(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 3 && value.length <= 200;
}

function validateText(value: string, min: number, max: number, label: string): void {
  const length = value.trim().length;
  if (length < min || length > max) throw new AuthenticExpressionValidationError(`${label} is invalid.`);
}

function validateDate(value: Date, label: string): void {
  if (Number.isNaN(value.getTime())) throw new AuthenticExpressionValidationError(`${label} date is invalid.`);
}

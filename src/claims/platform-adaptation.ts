export const platformAdaptationProfileVersion = 'platform-adaptation-v1' as const;

export type PlatformAdaptationProfileVersion = typeof platformAdaptationProfileVersion;

export type DraftChannel =
  | 'linkedin'
  | 'instagram'
  | 'x'
  | 'youtube'
  | 'podcast'
  | 'newsletter'
  | 'blog';

export type PlatformAdaptationSnapshot = Readonly<{
  version: PlatformAdaptationProfileVersion;
  audienceContext: string;
  format: string;
  recommendedCharacters: Readonly<{ min: number; max: number }>;
  hardMaximumCharacters: number;
  currentCharacters: number;
  visualLanguage: string;
  interactionModel: string;
  requiredElements: readonly string[];
}>;

type PlatformProfile = Omit<PlatformAdaptationSnapshot, 'currentCharacters'>;

export const draftChannels: readonly DraftChannel[] = [
  'linkedin', 'instagram', 'x', 'youtube', 'podcast', 'newsletter', 'blog',
];

const profiles: Readonly<Record<DraftChannel, PlatformProfile>> = {
  linkedin: {
    version: platformAdaptationProfileVersion,
    audienceContext: 'همتایان حرفه‌ای که به‌دنبال تجربه معتبر و بینش قابل‌انتقال هستند.',
    format: 'شروع روایی، تجربه مستند، برداشت شخصی و پرسش گفت‌وگویی.',
    recommendedCharacters: { min: 400, max: 1_800 },
    hardMaximumCharacters: 3_000,
    visualLanguage: 'متن‌محور؛ در صورت نیاز یک تصویر مستند یا کاروسل کوتاه.',
    interactionModel: 'گفت‌وگوی تخصصی، ذخیره و نظر معنادار؛ بدون Engagement bait.',
    requiredElements: ['روایت مستند:', 'برداشت من:'],
  },
  instagram: {
    version: platformAdaptationProfileVersion,
    audienceContext: 'مخاطب Visual-first که ایده را پیش و پس از بازکردن کپشن دریافت می‌کند.',
    format: 'راهنمای تصویر، کپشن، روایت مستند، برداشت و هشتگ محدود.',
    recommendedCharacters: { min: 300, max: 1_200 },
    hardMaximumCharacters: 2_200,
    visualLanguage: 'کاروسل یا ریل مستند و انسانی؛ بدون Stock image عمومی.',
    interactionModel: 'ذخیره، اشتراک‌گذاری و نظر سنجیده مهم‌تر از Like خام است.',
    requiredElements: ['ایده بصری:', 'کپشن:', 'روایت مستند:', 'برداشت من:', '#روایت_واقعی'],
  },
  x: {
    version: platformAdaptationProfileVersion,
    audienceContext: 'فید سریع و کم‌زمینه که هر جمله باید مستقل معنا داشته باشد.',
    format: 'زاویه فشرده، گزاره مستند و برداشت شخصی کوتاه.',
    recommendedCharacters: { min: 80, max: 240 },
    hardMaximumCharacters: 280,
    visualLanguage: 'Text-native؛ تصویر فقط وقتی معنای تازه‌ای اضافه کند.',
    interactionModel: 'سطح روشن برای Reply و Repost بدون تبدیل متن به شعار.',
    requiredElements: ['برداشت:'],
  },
  youtube: {
    version: platformAdaptationProfileVersion,
    audienceContext: 'مخاطب Search و Subscriber که در ثانیه‌های اول برای ادامه تصمیم می‌گیرد.',
    format: 'طرح Script شامل Hook، راهنمای تصویر، روایت، جمع‌بندی و CTA.',
    recommendedCharacters: { min: 800, max: 8_000 },
    hardMaximumCharacters: 10_000,
    visualLanguage: 'صحنه واقعی، سند روی تصویر و B-roll هدفمند.',
    interactionModel: 'عمق تماشا و سپس یک دعوت مرتبط برای Comment یا اقدام بعدی.',
    requiredElements: ['Hook', 'راهنمای تصویر', 'روایت واقعی', 'جمع‌بندی', 'CTA'],
  },
  podcast: {
    version: platformAdaptationProfileVersion,
    audienceContext: 'شنونده کم‌تصویر و غالباً در حال انجام کار دیگر که به Signpost صوتی نیاز دارد.',
    format: 'Cold open، زمینه، روایت شنیداری، تأمل و پرسش پایانی.',
    recommendedCharacters: { min: 1_000, max: 8_000 },
    hardMaximumCharacters: 10_000,
    visualLanguage: 'ریتم، مکث و گذار صوتی؛ کاور فقط برای Discovery است.',
    interactionModel: 'تکمیل شنیدن، یادآوری و سپس پاسخ یا گفت‌وگوی بعدی.',
    requiredElements: ['Cold open', 'زمینه', 'روایت شنیداری', 'تأمل شخصی', 'پرسش پایانی'],
  },
  newsletter: {
    version: platformAdaptationProfileVersion,
    audienceContext: 'مخاطب Opt-in که انتظار یادداشت شخصی پرسیگنال و دلیلی برای Reply دارد.',
    format: 'Subject، Preheader، متن نامه، روایت مستند و دعوت به پاسخ مستقیم.',
    recommendedCharacters: { min: 800, max: 6_000 },
    hardMaximumCharacters: 15_000,
    visualLanguage: 'تایپوگرافی Inbox-native و حداکثر یک تصویر یا نمودار مفید.',
    interactionModel: 'Reply، Forward و عمق رابطه مهم‌تر از واکنش عمومی است.',
    requiredElements: ['Subject:', 'Preheader:', 'متن نامه', 'روایت مستند', 'پاسخ مستقیم'],
  },
  blog: {
    version: platformAdaptationProfileVersion,
    audienceContext: 'خواننده Search و Archive که ممکن است بدون رابطه قبلی وارد شود.',
    format: 'H1 توصیفی، مقدمه، روایت مستند، تحلیل و جمع‌بندی ماندگار.',
    recommendedCharacters: { min: 1_200, max: 10_000 },
    hardMaximumCharacters: 20_000,
    visualLanguage: 'Headingهای قابل اسکن و تصویر، نمودار یا Screenshot مبتنی بر شاهد.',
    interactionModel: 'Discovery، مطالعه عمیق، Citation و مسیر روشن به مطلب یا تماس بعدی.',
    requiredElements: ['# ', '## مقدمه', '## روایت مستند', '## تحلیل', '## جمع‌بندی'],
  },
};

export function platformAdaptationFor(
  channel: DraftChannel,
  body: string,
  version: PlatformAdaptationProfileVersion = platformAdaptationProfileVersion,
): PlatformAdaptationSnapshot {
  assertSupportedVersion(version);
  return { ...profiles[channel], currentCharacters: body.length };
}

export function platformHardCharacterLimit(channel: string): number | undefined {
  return draftChannels.includes(channel as DraftChannel)
    ? profiles[channel as DraftChannel].hardMaximumCharacters
    : undefined;
}

export function platformFormatIssues(
  channel: DraftChannel,
  body: string,
  version: PlatformAdaptationProfileVersion = platformAdaptationProfileVersion,
): readonly string[] {
  assertSupportedVersion(version);
  return profiles[channel].requiredElements
    .filter((element) => !body.includes(element))
    .map((element) => `Required ${channel} element is missing: ${element}`);
}

export function composePlatformDraft(
  channel: DraftChannel,
  angle: string,
  statement: string,
  takeaway: string,
  preferences: Readonly<Record<string, unknown>>,
): string {
  const adaptedAngle = preferences['voice.headline_length'] === 'shorter'
    ? shorten(angle, 72)
    : angle;
  const adaptedTakeaway = preferences['voice.draft_length'] === 'shorter'
    ? shorten(takeaway, 180)
    : takeaway;

  if (channel === 'x') return composeX(adaptedAngle, statement, adaptedTakeaway);
  if (channel === 'youtube') {
    return `Hook\n${adaptedAngle}\n\nراهنمای تصویر\nنمای نزدیک از موقعیت واقعی یا سند مرتبط؛ بدون تصویرسازی ساختگی.\n\nروایت واقعی\n${statement}\n\nجمع‌بندی\n${adaptedTakeaway}\n\nCTA\nتجربه مرتبط خودتان را در یک جمله بنویسید.`;
  }
  if (channel === 'podcast') {
    return `Cold open\n${adaptedAngle}\n\nزمینه\nچرا این تجربه اکنون ارزش شنیدن دارد.\n\nروایت شنیداری\n${statement}\n\nتأمل شخصی\n${adaptedTakeaway}\n\nپرسش پایانی\nاین تجربه چه پرسشی برای شما ایجاد می‌کند؟`;
  }
  if (channel === 'newsletter') {
    return `Subject: ${shorten(adaptedAngle, 72)}\n\nPreheader: ${shorten(adaptedTakeaway, 120)}\n\nمتن نامه\n${adaptedAngle}\n\nروایت مستند\n${statement}\n\n${adaptedTakeaway}\n\nپاسخ مستقیم\nاگر تجربه مشابهی داشته‌اید، با Reply برایم بنویسید.`;
  }
  if (channel === 'blog') {
    return `# ${adaptedAngle}\n\n## مقدمه\nاین نوشته یک تجربه واقعی را به یک مسئله قابل بررسی تبدیل می‌کند.\n\n## روایت مستند\n${statement}\n\n## تحلیل\n${adaptedTakeaway}\n\n## جمع‌بندی\nاین تجربه پاسخ نهایی نیست؛ نقطه شروعی برای تصمیم دقیق‌تر است.`;
  }
  if (channel === 'instagram') {
    return `ایده بصری:\nکاروسل مستند با یک تصویر واقعی و تیتر «${shorten(adaptedAngle, 72)}»\n\nکپشن:\n${adaptedAngle}\n\nروایت مستند:\n${statement}\n\nبرداشت من:\n${adaptedTakeaway}\n\n#روایت_واقعی`;
  }
  const question = preferences['voice.question_cta'] === 'omit'
    ? ''
    : '\n\nپرسش برای گفت‌وگو:\nنظر شما چیست؟';
  return `${adaptedAngle}\n\nروایت مستند:\n${statement}\n\nبرداشت من:\n${adaptedTakeaway}${question}`;
}

function composeX(angle: string, statement: string, takeaway: string): string {
  const fixedLength = '\n\n\n\nبرداشت: '.length + statement.length;
  const available = Math.max(0, profiles.x.hardMaximumCharacters - fixedLength);
  const angleBudget = Math.min(72, Math.max(0, Math.floor(available * 0.4)));
  const fittedAngle = shorten(angle, angleBudget);
  const takeawayBudget = Math.max(0, available - fittedAngle.length);
  return `${fittedAngle}\n\n${statement}\n\nبرداشت: ${shorten(takeaway, takeawayBudget)}`;
}

function shorten(value: string, maximum: number): string {
  if (maximum <= 0) return '';
  if (value.length <= maximum) return value;
  if (maximum === 1) return '…';
  return `${value.slice(0, maximum - 1).trimEnd()}…`;
}

function assertSupportedVersion(version: string): asserts version is PlatformAdaptationProfileVersion {
  if (version !== platformAdaptationProfileVersion) {
    throw new Error(`Unsupported platform adaptation profile: ${version}`);
  }
}

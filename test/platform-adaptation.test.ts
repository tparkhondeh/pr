import { describe, expect, it } from 'vitest';
import {
  composePlatformDraft,
  draftChannels,
  platformAdaptationFor,
  platformAdaptationProfileVersion,
  platformFormatIssues,
} from '../src/claims/platform-adaptation.js';

const angle = 'چرا شفافیت در تصمیم‌های سخت مهم است';
const statement = 'این تجربه نشان داد اعلام صادقانه ابهام، اعتماد تیم را حفظ می‌کند.';
const takeaway = 'قطعیت نمایشی جای گفت‌وگوی روشن درباره ریسک را نمی‌گیرد.';

describe('platform adaptation', () => {
  it('creates seven distinct, evidence-preserving platform artifacts', () => {
    const bodies = draftChannels.map((channel) => composePlatformDraft(
      channel,
      angle,
      statement,
      takeaway,
      {},
    ));

    expect(new Set(bodies).size).toBe(draftChannels.length);
    for (const [index, body] of bodies.entries()) {
      const channel = draftChannels[index];
      if (!channel) throw new Error('Platform channel fixture is missing.');
      expect(body.split(statement)).toHaveLength(2);
      expect(platformFormatIssues(channel, body)).toEqual([]);
    }
    expect(bodies[draftChannels.indexOf('newsletter')]).not.toBe(
      bodies[draftChannels.indexOf('blog')],
    );
  });

  it('fits an ordinary X adaptation within its hard platform limit', () => {
    const body = composePlatformDraft('x', angle, statement, takeaway, {});
    expect(body).toContain(statement);
    expect(body.length).toBeLessThanOrEqual(280);
    expect(platformAdaptationFor('x', body).currentCharacters).toBe(body.length);
  });

  it('reports a missing required platform element after an unsafe edit', () => {
    const body = composePlatformDraft('youtube', angle, statement, takeaway, {});
    const edited = body.replace('راهنمای تصویر', 'بخش دوم');
    expect(platformFormatIssues('youtube', edited)).toEqual([
      'Required youtube element is missing: راهنمای تصویر',
    ]);
  });

  it('exposes a complete, versioned explanation contract for every platform', () => {
    for (const channel of draftChannels) {
      const profile = platformAdaptationFor(channel, 'متن');
      expect(profile.version).toBe(platformAdaptationProfileVersion);
      expect(profile.audienceContext.length).toBeGreaterThan(20);
      expect(profile.format.length).toBeGreaterThan(20);
      expect(profile.visualLanguage.length).toBeGreaterThan(20);
      expect(profile.interactionModel.length).toBeGreaterThan(20);
      expect(profile.recommendedCharacters.min).toBeLessThan(profile.recommendedCharacters.max);
      expect(profile.recommendedCharacters.max).toBeLessThanOrEqual(profile.hardMaximumCharacters);
      expect(profile.requiredElements.length).toBeGreaterThan(0);
    }
  });
});

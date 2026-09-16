import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe('Persian typography assets and scale', () => {
  it('keeps the pinned licensed font locally without a remote font dependency', () => {
    const font = readFileSync('apps/web/public/fonts/Vazirmatn-33.003.woff2');
    expect(font.subarray(0, 4).toString()).toBe('wOF2');
    expect(createHash('sha256').update(font).digest('hex')).toBe('4e3fa217d38fdafc1fea4414ceb58ca5e662cf0ab5fa735a8c8c20e8b42cad92');
    expect(readFileSync('apps/web/public/fonts/OFL.txt', 'utf8')).toContain('SIL OPEN FONT LICENSE');
  });
  it('uses a rem-based readable minimum and preserves editable control typography', () => {
    const css = readFileSync('apps/web/src/styles.css', 'utf8');
    expect(css).not.toMatch(/font-size:\s*(?:[0-9]|1[0-3])px/u);
    expect(css).toContain('--text-xs: .875rem');
    expect(css).toContain("url('/fonts/Vazirmatn-33.003.woff2')");
    expect(css).not.toMatch(/@import|url\(['"]?https?:/u);
    expect(css).toContain('font-variant-numeric: tabular-nums');
  });
});

import { describe, expect, it } from 'vitest';
import {
  hasSeenTips,
  SCAN_TIPS,
  SCAN_TIPS_VERSION,
  shouldShowTips,
  tipsSeenText,
} from '@/lib/scan-tips';

describe('scan tips', () => {
  it('are four short, plain tips in the order of the scan', () => {
    expect(SCAN_TIPS.map((t) => t.id)).toEqual(['light', 'wall', 'edge', 'top']);
    for (const tip of SCAN_TIPS) {
      expect(tip.title.length).toBeLessThanOrEqual(40);
      expect(tip.detail.length).toBeLessThanOrEqual(100);
    }
    expect(SCAN_TIPS[2]!.title).toMatch(/where the wall meets the floor/i);
    expect(SCAN_TIPS[3]!.detail).toMatch(/where the wall meets the ceiling/i);
  });

  it('show until they were seen, then never again', () => {
    expect(shouldShowTips(null)).toBe(true);
    const seen = tipsSeenText(1_700_000_000_000);
    expect(hasSeenTips(seen)).toBe(true);
    expect(shouldShowTips(seen)).toBe(false);
  });

  it('wait until the phone has said whether they were seen', () => {
    expect(shouldShowTips(undefined)).toBe(false);
  });

  it('show again when the tips change (a newer version)', () => {
    const seenOld = tipsSeenText(1, SCAN_TIPS_VERSION - 1);
    expect(hasSeenTips(seenOld)).toBe(false);
    expect(hasSeenTips(tipsSeenText(1, SCAN_TIPS_VERSION + 1))).toBe(true);
  });

  it('treat anything unreadable as not seen', () => {
    for (const text of ['', '{', '"yes"', '{"v":"1"}', '{}', 'null']) {
      expect(hasSeenTips(text)).toBe(false);
    }
  });
});

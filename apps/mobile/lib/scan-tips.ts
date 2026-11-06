/**
 * The tips shown before the first scan, and whether this phone has seen them. Shown once; Settings
 * shows them again. Raising `SCAN_TIPS_VERSION` shows changed tips once more to everyone. Plain
 * TypeScript (the phone keeps the flag in AsyncStorage, see components/scan/scan-tips.tsx).
 */

export const SCAN_TIPS_VERSION = 1;

/** The AsyncStorage key, per phone (not per account). */
export const SCAN_TIPS_KEY = 'youngvista.scanTips';

export type ScanTipId = 'light' | 'wall' | 'edge' | 'top';

export interface ScanTip {
  id: ScanTipId;
  title: string;
  detail: string;
}

export const SCAN_TIPS: readonly ScanTip[] = [
  {
    id: 'light',
    title: 'Turn the lights on',
    detail: 'Good, even light helps the phone see the floor and the walls.',
  },
  {
    id: 'wall',
    title: 'Start facing a wall',
    detail: 'Stand back a little, facing a wall whose bottom edge you can see.',
  },
  {
    id: 'edge',
    title: 'Aim where the wall meets the floor',
    detail: 'Put the dot on that line, with the short bars beside it along the line, and tap Mark.',
  },
  {
    id: 'top',
    title: 'Furniture in the way? Aim at the top',
    detail: 'If furniture hides the bottom edge, aim where the wall meets the ceiling instead.',
  },
];

/** What is stored once the tips were seen. */
export function tipsSeenText(now: number, version = SCAN_TIPS_VERSION): string {
  return JSON.stringify({ v: version, seenAt: now });
}

/** True when the stored value says these tips (this version or a newer one) were seen. */
export function hasSeenTips(text: string | null | undefined, version = SCAN_TIPS_VERSION): boolean {
  if (!text) return false;
  try {
    const data = JSON.parse(text) as { v?: unknown };
    return typeof data.v === 'number' && data.v >= version;
  } catch {
    return false;
  }
}

/**
 * Whether to show the tips over the scan: not before the stored flag is read (`stored` is
 * `undefined` while reading), and only when they were not seen.
 */
export function shouldShowTips(stored: string | null | undefined): boolean {
  return stored !== undefined && !hasSeenTips(stored);
}

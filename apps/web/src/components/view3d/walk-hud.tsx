/**
 * What the view shows over the room while it has the mouse: the crosshair and, short, what a click
 * does to what it is on; and, a moment after the wheel turns while flying, the pace. Never how to
 * move (the toolbar's "?"). Ported from the closet designer's `WalkHud` (Closet3DView.jsx).
 */
import { cn } from '@/lib/utils';
import type { Hud } from './types';

export function WalkHud({ hud }: { hud: Hud }) {
  const a = hud.aim;
  const bad = !!a && a.kind !== 'piece' && a.on && !a.ok;
  const say = !a
    ? null
    : a.kind === 'piece'
      ? `${a.name} — click to pick it up`
      : a.kind === 'carry'
        ? `${a.name} — ${!a.on ? 'aim at the floor · right-click puts it back' : bad ? 'no room there' : 'click to put it down'}`
        : `${a.name} — ${!a.on ? 'aim at the floor' : bad ? 'no room there' : 'click to put it there'}`;
  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-walk-hud="">
      {hud.cross ? (
        <div
          data-crosshair={a ? 'on' : 'off'}
          className={cn(
            'absolute top-1/2 left-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2',
            "before:absolute before:top-px before:left-2 before:h-4 before:w-0.5 before:rounded-[1px] before:bg-white before:shadow-[0_0_0_1px_rgb(0_0_0/0.55)] before:content-['']",
            "after:absolute after:top-2 after:left-px after:h-0.5 after:w-4 after:rounded-[1px] after:bg-white after:shadow-[0_0_0_1px_rgb(0_0_0/0.55)] after:content-['']",
            a && 'before:bg-sky-400 after:bg-sky-400',
          )}
        />
      ) : null}
      {say ? (
        <div
          role="status"
          className={cn(
            'absolute top-[calc(50%+22px)] left-1/2 max-w-[calc(100%-32px)] -translate-x-1/2 truncate rounded-full border bg-background/90 px-3 py-1 text-xs whitespace-nowrap text-foreground shadow-sm',
            bad && 'border-destructive/60 text-destructive',
          )}
        >
          {say}
        </div>
      ) : null}
      {hud.speed != null ? (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border bg-background/90 px-3 py-1 text-xs text-foreground tabular-nums shadow-sm">
          Flying speed {hud.speed}×
        </div>
      ) : null}
    </div>
  );
}

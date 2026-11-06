import { useEffect } from 'react';
import { LuInfo, LuTriangleAlert, LuX } from 'react-icons/lu';
import type { DesignNotice } from '@youngvista/core';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * What an action did, as the phone says it: a spot refused, no free space, or a piece removed
 * (with Undo). It fades by itself, the removal after a little longer.
 */
export function DesignNoticeBanner({
  notice,
  text,
  onUndo,
  onDismiss,
}: {
  notice: DesignNotice;
  text: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, notice.kind === 'removed' ? 6000 : 4500);
    return () => clearTimeout(t);
  }, [notice, onDismiss]);
  const info = notice.kind === 'removed';
  const Icon = info ? LuInfo : LuTriangleAlert;
  return (
    <div
      role={info ? 'status' : 'alert'}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm shadow-sm',
        info ? 'bg-primary text-primary-foreground' : 'bg-destructive text-white',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{text}</span>
      {info ? (
        <Button size="sm" variant="secondary" onClick={onUndo} title="Undo (Ctrl+Z)">
          Undo
        </Button>
      ) : null}
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-current hover:bg-white/15 hover:text-current"
      >
        <LuX aria-hidden />
      </Button>
    </div>
  );
}

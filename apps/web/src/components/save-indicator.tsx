import { LuCheck, LuCloudOff, LuLoaderCircle, LuTriangleAlert } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { SAVE_STATUS_TEXT, type SaveStatus } from '@youngvista/core';
import { cn } from '@/lib/utils';

const ICONS: Record<SaveStatus, IconType> = {
  saved: LuCheck,
  saving: LuLoaderCircle,
  offline: LuCloudOff,
  error: LuTriangleAlert,
};

/** "Saving… / Saved / Offline, will save", as the phone shows it. */
export function SaveIndicator({ status, className }: { status: SaveStatus; className?: string }) {
  const warn = status === 'offline' || status === 'error';
  const Icon = ICONS[status];
  return (
    <span
      role="status"
      aria-live="polite"
      data-save-status={status}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs whitespace-nowrap',
        warn ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
    >
      <Icon className={cn('size-3.5', status === 'saving' && 'animate-spin')} aria-hidden />
      {SAVE_STATUS_TEXT[status]}
    </span>
  );
}

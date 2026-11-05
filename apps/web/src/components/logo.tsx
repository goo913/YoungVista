import { Link } from 'react-router';
import { LuHouse } from 'react-icons/lu';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <LuHouse className="size-4" aria-hidden />
      </span>
      YoungVista
    </Link>
  );
}

import { Separator } from '@/components/ui/separator';

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
      <Separator className="flex-1" />
      or
      <Separator className="flex-1" />
    </div>
  );
}

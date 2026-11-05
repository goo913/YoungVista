import { LuLoaderCircle } from 'react-icons/lu';

export function PageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="flex min-h-[50vh] items-center justify-center text-muted-foreground"
      role="status"
    >
      <LuLoaderCircle className="size-6 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}

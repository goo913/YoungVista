import type { ReactNode } from 'react';
import { Logo } from './logo';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/30 px-4 py-10">
      <Logo className="text-lg" />
      <div className="w-full max-w-sm">{children}</div>
      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Scan rooms with the YoungVista phone app and see them here on a bigger screen.
      </p>
    </div>
  );
}

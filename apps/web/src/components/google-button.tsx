import { FcGoogle } from 'react-icons/fc';
import { Button } from '@/components/ui/button';

export function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={onClick}
      disabled={disabled}
    >
      <FcGoogle aria-hidden />
      Continue with Google
    </Button>
  );
}

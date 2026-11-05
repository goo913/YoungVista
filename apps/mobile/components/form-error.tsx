import { LuTriangleAlert } from 'react-icons/lu';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" icon={LuTriangleAlert}>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

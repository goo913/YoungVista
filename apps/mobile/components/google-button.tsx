import { FcGoogle } from 'react-icons/fc';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export function GoogleButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" size="lg" onPress={onPress} disabled={disabled}>
      <FcGoogle size={18} />
      <Text>Continue with Google</Text>
    </Button>
  );
}

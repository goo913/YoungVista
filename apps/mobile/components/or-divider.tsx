import { View } from 'react-native';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';

export function OrDivider() {
  return (
    <View className="flex-row items-center gap-3">
      <Separator className="flex-1" />
      <Text className="text-muted-foreground text-xs uppercase">or</Text>
      <Separator className="flex-1" />
    </View>
  );
}

/**
 * A quiet line for a weak or missing connection. It shows only after the server has been out of
 * reach for a few seconds (opening a screen from the phone's copy is not "offline"), and goes as
 * soon as the server answers again. Everything keeps working meanwhile: the phone keeps the rooms
 * and the changes, and sends them when the connection is back.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { LuWifiOff } from 'react-icons/lu';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** Out of reach for this long before the line shows (ms). */
const OFFLINE_AFTER_MS = 3000;

export const OFFLINE_TEXT =
  'Weak or no connection. You are seeing what is saved on this phone; changes are sent when the connection is back.';

export function ConnectionBanner({
  online,
  text = OFFLINE_TEXT,
  className,
}: {
  /** False while the server cannot be reached (Firestore's snapshots come from the cache). */
  online: boolean;
  text?: string;
  className?: string;
}) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (online) return;
    const t = setTimeout(() => setLate(true), OFFLINE_AFTER_MS);
    return () => {
      clearTimeout(t);
      setLate(false);
    };
  }, [online]);
  if (online || !late) return null;
  return (
    <View
      className={cn('bg-muted flex-row items-center gap-2 rounded-lg px-3 py-2', className)}
      // Never in the way: over the 3D view, touches go through to it.
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={text}
    >
      <Icon as={LuWifiOff} size={14} className="text-muted-foreground" />
      <Text className="text-muted-foreground flex-1 text-xs">{text}</Text>
    </View>
  );
}

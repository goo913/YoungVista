import { View } from 'react-native';
import { LuCheck, LuCloudOff, LuLoaderCircle, LuTriangleAlert } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { SAVE_STATUS_TEXT, type SaveStatus } from '@/lib/autosave';
import { cn } from '@/lib/utils';

const ICONS: Record<SaveStatus, IconType> = {
  saved: LuCheck,
  saving: LuLoaderCircle,
  offline: LuCloudOff,
  error: LuTriangleAlert,
};

/** "Saving… / Saved / Offline, will save", for a screen's header. */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  const warn = status === 'offline' || status === 'error';
  return (
    <View
      className="flex-row items-center gap-1.5"
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={SAVE_STATUS_TEXT[status]}
    >
      <Icon
        as={ICONS[status]}
        size={14}
        className={cn(warn ? 'text-destructive' : 'text-muted-foreground')}
      />
      <Text className={cn('text-xs', warn ? 'text-destructive' : 'text-muted-foreground')}>
        {SAVE_STATUS_TEXT[status]}
      </Text>
    </View>
  );
}

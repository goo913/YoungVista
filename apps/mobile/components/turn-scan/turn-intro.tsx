/**
 * Before the turn-around scan: how to stand and turn, and what happens to the pictures. Starting
 * the scan is the user's yes to sending them (Apple asks apps to say so before home photos go to
 * AI). In landscape: the advice on the left, the buttons on the right.
 */
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LuFootprints,
  LuLightbulb,
  LuLock,
  LuRotateCw,
  LuSmartphone,
  LuSplit,
} from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { useLandscape } from '@/components/camera-hud';

const ADVICE: { icon: IconType; title: string; detail: string }[] = [
  {
    icon: LuLightbulb,
    title: 'Lights on, doors closed',
    detail: 'Open the curtains so the windows show. Keep people and pets out of view.',
  },
  {
    icon: LuFootprints,
    title: 'Stand in the open, near the middle',
    detail:
      'At least an arm’s length from walls and tall furniture, where you can see over beds and sofas. Never between a bed and a wall.',
  },
  {
    icon: LuSmartphone,
    title: 'Phone sideways, near your chest',
    detail: 'Elbows bent, the phone close to you, at the same height all the way round.',
  },
  {
    icon: LuRotateCw,
    title: 'Turn on your heels, three times',
    detail:
      'Slowly, in small steps: once aiming down, once level, once aiming up. About two minutes in all.',
  },
  {
    icon: LuSplit,
    title: 'Long or L-shaped room?',
    detail: 'After the three turns, add a second spot at its other end.',
  },
];

export function TurnIntro({
  available,
  onStart,
  onMarkInstead,
  onCancel,
}: {
  /** False when this build of the app cannot scan by turning around. */
  available: boolean;
  onStart: () => void;
  onMarkInstead: () => void;
  onCancel: () => void;
}) {
  const landscape = useLandscape();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="grow justify-center"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 16,
        paddingLeft: insets.left + 24,
        paddingRight: insets.right + 24,
      }}
      bounces={false}
    >
      <View
        className={cn('w-full gap-6 self-center', landscape ? 'max-w-4xl flex-row' : 'max-w-xl')}
      >
        <View className={cn('gap-4', landscape && 'flex-1')}>
          <View className="gap-1">
            <Text className="text-xl font-semibold" role="heading">
              Scan by turning around
            </Text>
            <Text className="text-muted-foreground text-sm">
              No corners to mark: stand in the room and turn, and the app measures it.
            </Text>
          </View>
          <View className="gap-3">
            {ADVICE.map((tip) => (
              <View
                key={tip.title}
                className="flex-row items-start gap-3"
                accessible
                accessibilityLabel={`${tip.title}. ${tip.detail}`}
              >
                <View className="bg-muted size-8 items-center justify-center rounded-full">
                  <Icon as={tip.icon} size={16} className="text-foreground" />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-sm font-semibold">{tip.title}</Text>
                  <Text className="text-muted-foreground text-sm">{tip.detail}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <View className={cn('gap-3', landscape ? 'w-72 justify-center' : 'w-full')}>
          {available ? (
            <View className="bg-muted/60 flex-row items-start gap-3 rounded-lg p-3">
              <Icon as={LuLock} size={16} className="text-muted-foreground mt-0.5" />
              <Text className="text-muted-foreground flex-1 text-xs">
                The scan takes about 70 pictures of the room and sends them to YoungVista’s server,
                where AI measures the walls and finds the doors and windows. They stay private to
                your account and are deleted with the room. Tap Start to agree.
              </Text>
            </View>
          ) : (
            <Text className="text-muted-foreground text-sm">
              This version of the app cannot scan by turning around yet. Mark the walls instead: it
              takes about a minute.
            </Text>
          )}
          {available ? (
            <Button size="lg" onPress={onStart}>
              <Icon as={LuRotateCw} size={18} />
              <Text>Start</Text>
            </Button>
          ) : null}
          <Button size="lg" variant={available ? 'outline' : 'default'} onPress={onMarkInstead}>
            <Text>Mark walls instead</Text>
          </Button>
          <Button variant="ghost" onPress={onCancel}>
            <Text>Cancel</Text>
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}

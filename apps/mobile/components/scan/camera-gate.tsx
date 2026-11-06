import {
  checkPermissions,
  isARSupportedOnDevice,
  requestRequiredPermissions,
} from '@reactvision/react-viro';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LuCamera, LuCameraOff, LuSmartphone } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { useLandscape } from '@/components/camera-hud';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type GateState = 'checking' | 'unsupported' | 'ask' | 'denied' | 'ready';

/** True unless the phone says for sure that it cannot run AR. */
async function arSupported(): Promise<boolean> {
  try {
    return (await isARSupportedOnDevice()).isARSupported;
  } catch (error) {
    // Android answers UNSUPPORTED, UNKNOWN or TRANSIENT; only the first is a firm no.
    return !(error instanceof Error && error.message === 'UNSUPPORTED');
  }
}

async function hasCamera(): Promise<boolean> {
  try {
    return (await checkPermissions(['camera'])).camera === true;
  } catch {
    return false;
  }
}

async function currentGate(): Promise<GateState> {
  if (!(await arSupported())) return 'unsupported';
  return (await hasCamera()) ? 'ready' : 'ask';
}

/** What the camera is for: scanning a room, or furniture in the camera view. */
const COPY = {
  scan: {
    unsupported: 'This phone cannot scan rooms',
    unsupportedBody:
      'Scanning needs augmented reality (ARKit on iPhone, Google Play Services for AR on Android), which this phone does not support.',
    ask: 'YoungVista uses the camera to find the floor and the walls of your room. No photos or video are kept or uploaded: only the floor plan, and a small technical log of the scan that helps us improve it.',
    denied: 'To scan a room, turn on Camera for YoungVista in Settings, then come back.',
  },
  ar: {
    unsupported: 'This phone cannot show furniture in the camera view',
    unsupportedBody:
      'It needs augmented reality (ARKit on iPhone, Google Play Services for AR on Android), which this phone does not support. The 3D view works on every phone.',
    ask: 'YoungVista uses the camera to show furniture at its real size in your room. No photos or video are kept or uploaded.',
    denied:
      'To see furniture in your room, turn on Camera for YoungVista in Settings, then come back.',
  },
} as const;

/**
 * Shows its children (the AR view) only on a phone that can run AR and once the camera is
 * allowed. Asks for the camera with an explanation first, and points to Settings if it was
 * turned off.
 */
export function CameraGate({
  children,
  onClose,
  purpose = 'scan',
}: {
  children: ReactNode;
  onClose: () => void;
  purpose?: keyof typeof COPY;
}) {
  const copy = COPY[purpose];
  const [state, setState] = useState<GateState>('checking');
  const waiting = state === 'ask' || state === 'denied';

  useEffect(() => {
    let active = true;
    void currentGate().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  // Back from Settings: look again.
  useEffect(() => {
    if (!waiting) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void currentGate().then(setState);
    });
    return () => sub.remove();
  }, [waiting]);

  const ask = async () => {
    try {
      const result = await requestRequiredPermissions(['camera']);
      setState(result.camera ? 'ready' : 'denied');
    } catch {
      setState('denied');
    }
  };

  switch (state) {
    case 'ready':
      return <>{children}</>;
    case 'checking':
      return (
        <View className="flex-1 items-center justify-center bg-black">
          <ActivityIndicator color="white" />
        </View>
      );
    case 'unsupported':
      return (
        <GateMessage
          icon={LuSmartphone}
          title={copy.unsupported}
          body={copy.unsupportedBody}
          primary={{ label: 'Back', onPress: onClose }}
        />
      );
    case 'ask':
      return (
        <GateMessage
          icon={LuCamera}
          title="Allow the camera"
          body={copy.ask}
          primary={{ label: 'Allow camera', onPress: () => void ask() }}
          secondary={{ label: 'Not now', onPress: onClose }}
        />
      );
    case 'denied':
      return (
        <GateMessage
          icon={LuCameraOff}
          title="Camera access is off"
          body={copy.denied}
          primary={{ label: 'Open Settings', onPress: () => void Linking.openSettings() }}
          secondary={{ label: 'Back', onPress: onClose }}
        />
      );
  }
}

interface GateAction {
  label: string;
  onPress: () => void;
}

/**
 * Why the camera is not on, and what to do. On a camera screen in landscape: the words on the
 * left and the buttons on the right, which fits the short screen; it scrolls should it not.
 */
function GateMessage({
  icon,
  title,
  body,
  primary,
  secondary,
}: {
  icon: IconType;
  title: string;
  body: string;
  primary: GateAction;
  secondary?: GateAction;
}) {
  const landscape = useLandscape();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="grow items-center justify-center"
      contentContainerStyle={{
        paddingTop: insets.top + (landscape ? 16 : 32),
        paddingBottom: insets.bottom + (landscape ? 16 : 32),
        paddingLeft: insets.left + 32,
        paddingRight: insets.right + 32,
      }}
      bounces={false}
    >
      <View className={cn('w-full', landscape ? 'max-w-2xl flex-row items-center gap-8' : 'gap-6')}>
        <View className={cn('gap-4', landscape ? 'flex-1 items-start' : 'items-center gap-6')}>
          <View className="bg-muted size-14 items-center justify-center rounded-full">
            <Icon as={icon} size={28} className="text-muted-foreground" />
          </View>
          <View className={cn('gap-2', !landscape && 'items-center')}>
            <Text className={cn('text-xl font-semibold', !landscape && 'text-center')}>
              {title}
            </Text>
            <Text className={cn('text-muted-foreground', !landscape && 'text-center')}>{body}</Text>
          </View>
        </View>
        <View className={cn('gap-3', landscape ? 'w-60' : 'w-full')}>
          <Button size="lg" onPress={primary.onPress}>
            <Text>{primary.label}</Text>
          </Button>
          {secondary ? (
            <Button size="lg" variant="ghost" onPress={secondary.onPress}>
              <Text>{secondary.label}</Text>
            </Button>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

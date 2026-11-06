/**
 * The frame and the overlay layout of the camera screens: the scan, the room in the camera view
 * and place freely.
 *
 * They run in landscape (app/(app)/_layout.tsx): a full-screen modal turned sideways over upright
 * screens. Meanwhile UIKit takes those screens out of the window, and the app's root safe-area
 * provider, under them, keeps their upright insets (checked on the iOS 27 simulator: top 59 and
 * bottom 34, where the landscape screen has 59 left and right and 20 at the bottom). So
 * `CameraScreen` measures the camera screen's own safe area, for everything on it.
 *
 * `CameraHud` lays the overlay out for the way the screen is. Landscape: the close button and the
 * title in the top left corner, messages at the top in the middle, round buttons in the top right
 * corner; the map at the bottom left and the controls at the bottom right, under the right thumb.
 * The middle, where the dot is, stays clear. Upright (while the screen turns, or if it did not):
 * a top bar with the messages under it, and the map and the controls at the bottom, as before.
 */
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaFrame,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** A camera screen: black, light status bar, and its own safe area (see the header). */
export function CameraScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider style={styles.screen}>
      <StatusBar style="light" />
      {children}
    </SafeAreaProvider>
  );
}

/** True while the camera screen is wider than it is tall. */
export function useLandscape(): boolean {
  const { width, height } = useSafeAreaFrame();
  return width > height;
}

/** Landscape: how wide the controls column is, for buttons and for cards with text (points). */
export const HUD_RAIL = { buttons: 224, card: 280 } as const;

/** Landscape: the top corners' width, so the messages sit in the middle of the screen. */
const CORNER = 140;
/** Landscape: the messages' widest, and the side panel's width (the scan's raw data). */
const MESSAGES_MAX = 440;
const ASIDE = 300;

/** The screen's edges kept clear of the Dynamic Island, the corners and the home bar. */
export function useHudPadding(landscape: boolean) {
  const insets = useSafeAreaInsets();
  return landscape
    ? {
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 8,
        paddingLeft: insets.left + 8,
        paddingRight: insets.right + 8,
      }
    : { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 };
}

export interface CameraHudProps {
  /** The round close button. */
  close: ReactNode;
  title: string;
  /** Under the title: how saving is going. */
  status?: ReactNode;
  /** Round buttons, top right. */
  actions?: ReactNode;
  /** Banners and notices. */
  messages?: ReactNode;
  /** A panel over the camera view (the scan's raw data). */
  aside?: ReactNode;
  /** The small map, bottom left. */
  map?: ReactNode;
  /** Buttons or a card: at the bottom upright, at the bottom right in landscape. */
  controls?: ReactNode;
  /** Landscape: the controls column's width (`HUD_RAIL`). */
  controlsWidth?: number;
}

/**
 * The overlay over the camera view. It lets touches through wherever it draws nothing, to the
 * finger gestures under it (the AR view's furniture and room moves).
 */
export function CameraHud(props: CameraHudProps) {
  const landscape = useLandscape();
  const padding = useHudPadding(landscape);
  return (
    <View className="absolute inset-0" pointerEvents="box-none" style={padding}>
      {landscape ? <Landscape {...props} /> : <Upright {...props} />}
    </View>
  );
}

function Upright({
  close,
  title,
  status,
  actions,
  messages,
  aside,
  map,
  controls,
}: CameraHudProps) {
  return (
    <>
      <View className="gap-3 px-4" pointerEvents="box-none">
        <View className="flex-row items-center justify-between gap-2" pointerEvents="box-none">
          {close}
          <Text className="flex-1 text-center text-base font-semibold text-white" numberOfLines={1}>
            {title}
          </Text>
          <View className="min-w-10 flex-row justify-end gap-2" pointerEvents="box-none">
            {actions}
          </View>
        </View>
        {status ? (
          <View className="self-center" pointerEvents="box-none">
            {status}
          </View>
        ) : null}
        {messages}
      </View>
      <View className={cn('flex-1 px-4', aside && 'py-3')} pointerEvents="box-none">
        {aside ? <View className="max-h-[70%]">{aside}</View> : null}
      </View>
      <View className="px-4" pointerEvents="box-none">
        {map ? (
          <View className="flex-row items-end gap-3" pointerEvents="box-none">
            {map}
            <View className="flex-1">{controls}</View>
          </View>
        ) : (
          controls
        )}
      </View>
    </>
  );
}

function Landscape({
  close,
  title,
  status,
  actions,
  messages,
  aside,
  map,
  controls,
  controlsWidth = HUD_RAIL.buttons,
}: CameraHudProps) {
  return (
    <>
      <View className="flex-row items-start gap-3" pointerEvents="box-none">
        <View className="gap-2" style={{ width: CORNER }} pointerEvents="box-none">
          <View className="flex-row items-center gap-2" pointerEvents="box-none">
            {close}
            <Text className="flex-1 text-sm font-semibold text-white" numberOfLines={2}>
              {title}
            </Text>
          </View>
          {status ? (
            <View className="self-start" pointerEvents="box-none">
              {status}
            </View>
          ) : null}
        </View>
        <View className="flex-1 items-center" pointerEvents="box-none">
          <View
            className="w-full gap-2"
            style={{ maxWidth: MESSAGES_MAX }}
            pointerEvents="box-none"
          >
            {messages}
          </View>
        </View>
        <View
          className="flex-row justify-end gap-2"
          style={{ width: CORNER }}
          pointerEvents="box-none"
        >
          {actions}
        </View>
      </View>
      <View className="flex-1 flex-row items-end gap-3 pt-3" pointerEvents="box-none">
        {aside || map ? (
          <View
            className="justify-end gap-3 self-stretch"
            style={aside ? { width: ASIDE } : undefined}
            pointerEvents="box-none"
          >
            {aside ? <View className="flex-1">{aside}</View> : null}
            {map}
          </View>
        ) : null}
        <View className="flex-1" pointerEvents="none" />
        <View
          className="justify-end self-stretch"
          style={{ width: controlsWidth }}
          pointerEvents="box-none"
        >
          {/* Sized to the controls (touches above them reach the camera view), and scrolls
              should they not fit, which only a tall card under long messages does. */}
          <ScrollView
            className="max-h-full grow-0"
            bounces={false}
            alwaysBounceVertical={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {controls}
          </ScrollView>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
});

/**
 * "Look around in real pictures": the room's 360° pictures from a turn-around scan, with its
 * furniture drawn in at true size. Full screen and in landscape (app/(app)/_layout.tsx). The
 * viewer is the website's (`/embed/tour`) in a WebView, handed the room, its furniture and the
 * pictures' download addresses before it loads (lib/tour-page.ts); the app keeps the close
 * button, the loading state and what to say when it fails.
 */
import type { TourEmbed } from '@youngvista/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { LuRefreshCw, LuTriangleAlert, LuX } from 'react-icons/lu';
import { CameraScreen } from '@/components/camera-hud';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { emulatorHost } from '@/lib/firebase';
import { useRoom } from '@/lib/rooms';
import { loadTourEmbed, useRoomTour } from '@/lib/tour';
import {
  readTourMessage,
  staysOnWebsite,
  tourInjection,
  tourPageUrl,
  websiteFor,
} from '@/lib/tour-page';

const NO_CONNECTION = 'The 360° pictures need a connection. Check it and try again.';

type Phase =
  | { kind: 'preparing' }
  | { kind: 'loading'; embed: TourEmbed }
  | { kind: 'ready'; embed: TourEmbed }
  | { kind: 'failed'; message: string; embed: TourEmbed | null };

/** Sideways, the app's own safe area stays upright: the screen measures its own (camera-hud). */
export default function RoomTourScreen() {
  return (
    <CameraScreen>
      <RoomTour />
    </CameraScreen>
  );
}

function RoomTour() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const roomId = String(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const room = useRoom(roomId);
  const tour = useRoomTour(roomId);
  const web = useRef<WebView>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'preparing' });
  const [attempt, setAttempt] = useState(0);
  const website = useMemo(
    () =>
      websiteFor({
        dev: typeof __DEV__ !== 'undefined' && __DEV__,
        emulatorHost,
        override: process.env.EXPO_PUBLIC_WEBSITE_URL,
      }),
    [],
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/rooms/[id]', params: { id: roomId } });
  };

  const data = room.status === 'ready' ? room.data : null;
  const plan = data?.room ?? null;
  // The room as the pictures open: furniture moved meanwhile shows the next time they open.
  const latest = useRef(data);
  useLayoutEffect(() => {
    latest.current = data;
  });
  // The pictures' addresses, once the room's plan and its tour are known (again after a retry).
  useEffect(() => {
    const summary = latest.current;
    if (!summary || !plan || !tour) return;
    let live = true;
    loadTourEmbed({
      name: summary.name,
      units: summary.units,
      room: plan,
      design: summary.design,
      tour,
    }).then(
      (embed) => live && setPhase({ kind: 'loading', embed }),
      () => live && setPhase({ kind: 'failed', message: NO_CONNECTION, embed: null }),
    );
    return () => {
      live = false;
    };
  }, [plan, tour, attempt]);

  const retry = () => {
    if (phase.kind === 'failed' && phase.embed) {
      setPhase({ kind: 'loading', embed: phase.embed });
      web.current?.reload();
    } else {
      setPhase({ kind: 'preparing' });
      setAttempt((n) => n + 1);
    }
  };

  const problem =
    room.status === 'missing'
      ? 'This room is no longer here.'
      : room.status === 'error'
        ? room.message
        : room.status === 'ready' && !plan
          ? 'This room has no floor plan yet.'
          : null;
  const embed = phase.kind === 'preparing' ? null : phase.embed;
  const failure = problem ?? (phase.kind === 'failed' ? phase.message : null);

  return (
    <View className="flex-1 bg-neutral-900">
      <StatusBar hidden />
      {embed ? (
        <WebView
          ref={web}
          source={{ uri: tourPageUrl(website) }}
          injectedJavaScriptBeforeContentLoaded={tourInjection(embed)}
          onMessage={(e) => {
            const message = readTourMessage(e.nativeEvent.data);
            if (message?.type === 'ready') setPhase({ kind: 'ready', embed });
            else if (message?.type === 'failed') {
              setPhase({ kind: 'failed', message: message.message || NO_CONNECTION, embed });
            } else if (message?.type === 'close') close();
          }}
          onError={() => setPhase({ kind: 'failed', message: NO_CONNECTION, embed })}
          onHttpError={() => setPhase({ kind: 'failed', message: NO_CONNECTION, embed })}
          // iOS may stop a page that holds large pictures when memory runs short: start again.
          onContentProcessDidTerminate={() => {
            setPhase({ kind: 'loading', embed });
            web.current?.reload();
          }}
          onShouldStartLoadWithRequest={(r) => staysOnWebsite(r.url, website)}
          originWhitelist={[website]}
          style={{ flex: 1, backgroundColor: '#171717' }}
          containerStyle={{ backgroundColor: '#171717' }}
          // The page fills the screen edge to edge and keeps its controls clear of the corners.
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          allowsLinkPreview={false}
          allowsBackForwardNavigationGestures={false}
          setSupportMultipleWindows={false}
          textInteractionEnabled={false}
          webviewDebuggingEnabled={typeof __DEV__ !== 'undefined' && __DEV__}
        />
      ) : null}

      {failure ? (
        <View className="absolute inset-0 items-center justify-center gap-4 bg-neutral-900 p-8">
          <Icon as={LuTriangleAlert} size={28} className="text-red-400" />
          <Text className="max-w-md text-center text-white">{failure}</Text>
          {problem ? null : (
            <Button variant="secondary" onPress={retry}>
              <Icon as={LuRefreshCw} size={16} />
              <Text>Try again</Text>
            </Button>
          )}
        </View>
      ) : phase.kind !== 'ready' ? (
        <View
          className="absolute inset-0 items-center justify-center gap-3 bg-neutral-900"
          accessibilityLabel="Loading the 360° pictures"
        >
          <ActivityIndicator color="#ffffff" />
          <Text className="text-sm text-white">Loading the 360° pictures…</Text>
        </View>
      ) : null}

      <Button
        size="icon"
        variant="secondary"
        onPress={close}
        accessibilityLabel="Close the 360° pictures"
        className="absolute rounded-full opacity-90"
        style={{ top: Math.max(insets.top, 8), left: Math.max(insets.left, 8) }}
      >
        <Icon as={LuX} size={20} />
      </Button>
    </View>
  );
}

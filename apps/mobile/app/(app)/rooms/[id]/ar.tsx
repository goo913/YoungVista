/**
 * "See it in your room": the saved room's furniture in the camera view. The AR session starts at
 * once (finding the floor takes a moment) while the room and the furniture list load.
 */
import { useKeepAwake } from 'expo-keep-awake';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ArController } from '@/ar/controller';
import { ArRoom } from '@/components/ar/ar-room';
import { initialArSceneState } from '@/components/ar/ar-scene';
import { ArView, type ArViewHandle } from '@/components/ar/ar-view';
import { CameraGate } from '@/components/scan/camera-gate';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { retryCatalog, useCatalog } from '@/lib/catalog';
import { useRoom } from '@/lib/rooms';
import { createStore } from '@/lib/store';

export default function RoomArScreen() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const roomId = String(id);
  const router = useRouter();
  const focused = useIsFocused();
  const room = useRoom(roomId);
  const catalog = useCatalog();
  const [controller] = useState(() => new ArController());
  const [scene] = useState(() => createStore(initialArSceneState()));
  const ar = useMemo(() => ({ controller, store: scene }), [controller, scene]);
  const view = useRef<ArViewHandle>(null);
  useEffect(() => () => controller.dispose(), [controller]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/rooms/[id]', params: { id: roomId } });
  };

  const problem =
    room.status === 'missing'
      ? { title: 'Room not found', text: 'This room does not exist or belongs to another account.' }
      : room.status === 'error'
        ? { title: 'Could not load', text: room.message }
        : room.status === 'ready' && !room.data.room
          ? { title: 'No floor plan', text: 'This room has no floor plan to show yet.' }
          : catalog.status === 'error'
            ? { title: 'No furniture list', text: catalog.message }
            : null;

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      {focused ? (
        <CameraGate onClose={close} purpose="ar">
          <ArView ref={view} ar={ar} />
          {/* The design opens from the room as Firestore has it, not an older copy. */}
          {room.status === 'ready' &&
          room.settled &&
          room.data.room &&
          catalog.status === 'ready' ? (
            <ArRoom
              summary={room.data}
              room={room.data.room}
              online={room.online}
              catalog={catalog.data}
              controller={controller}
              scene={scene}
              view={view}
              onClose={close}
            />
          ) : (
            <View className="absolute inset-0 items-center justify-center p-6">
              {problem ? (
                <Card className="w-full">
                  <CardHeader>
                    <CardTitle>{problem.title}</CardTitle>
                    <CardDescription>{problem.text}</CardDescription>
                  </CardHeader>
                  <CardContent className="gap-3">
                    {catalog.status === 'error' ? (
                      <Button onPress={retryCatalog}>
                        <Text>Try again</Text>
                      </Button>
                    ) : null}
                    <Button variant="outline" onPress={close}>
                      <Text>Back</Text>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <View className="items-center gap-3 rounded-2xl bg-black/60 px-6 py-5">
                  <ActivityIndicator color="white" />
                  <Text className="text-sm text-white">Loading the room…</Text>
                </View>
              )}
            </View>
          )}
        </CameraGate>
      ) : null}
    </View>
  );
}

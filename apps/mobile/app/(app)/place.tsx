/**
 * "Place freely": true-size furniture in the camera view, no room needed. Nothing is saved.
 */
import { useKeepAwake } from 'expo-keep-awake';
import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ArController } from '@/ar/controller';
import { ArFree } from '@/components/ar/ar-free';
import { initialArSceneState } from '@/components/ar/ar-scene';
import { ArView, type ArViewHandle } from '@/components/ar/ar-view';
import { CameraGate } from '@/components/scan/camera-gate';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { retryCatalog, useCatalog } from '@/lib/catalog';
import { createStore } from '@/lib/store';

export default function PlaceFreelyScreen() {
  useKeepAwake();
  const router = useRouter();
  const focused = useIsFocused();
  const catalog = useCatalog();
  const [controller] = useState(() => new ArController());
  const [scene] = useState(() => createStore(initialArSceneState()));
  const ar = useMemo(() => ({ controller, store: scene }), [controller, scene]);
  const view = useRef<ArViewHandle>(null);
  useEffect(() => () => controller.dispose(), [controller]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      {focused ? (
        <CameraGate onClose={close} purpose="ar">
          <ArView ref={view} ar={ar} />
          {catalog.status === 'ready' ? (
            <ArFree
              catalog={catalog.data}
              controller={controller}
              scene={scene}
              view={view}
              onClose={close}
            />
          ) : (
            <View className="absolute inset-0 items-center justify-center p-6">
              {catalog.status === 'error' ? (
                <Card className="w-full">
                  <CardHeader>
                    <CardTitle>No furniture list</CardTitle>
                    <CardDescription>{catalog.message}</CardDescription>
                  </CardHeader>
                  <CardContent className="gap-3">
                    <Button onPress={retryCatalog}>
                      <Text>Try again</Text>
                    </Button>
                    <Button variant="outline" onPress={close}>
                      <Text>Back</Text>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <View className="items-center gap-3 rounded-2xl bg-black/60 px-6 py-5">
                  <ActivityIndicator color="white" />
                  <Text className="text-sm text-white">Loading the furniture…</Text>
                </View>
              )}
            </View>
          )}
        </CameraGate>
      ) : null}
    </View>
  );
}

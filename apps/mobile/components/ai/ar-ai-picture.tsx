/**
 * "AI picture" in "See it in your room": the camera view, with the furniture placed at its true
 * size, made photo-real by AI. The best way in to an AI picture of a real room: the furniture is
 * already where and how big it really is, so AI only has to make it look real.
 *
 * Self-contained for the AR screen's controls: the button, the card that says how it goes, the
 * one-time consent and the picture viewer (both sideways over the camera). It shows once the room
 * is lined up. For the picture, the ghost walls, the dot on the floor and the selection marks are
 * hidden for a moment, then ViroReact's AR screenshot is taken (components/ar/ar-view.tsx).
 *
 * Mount it with the screen's AR view handle and scene store:
 * `<ArAiPicture view={view} scene={scene} roomId={summary.id} online={online} />`.
 */
import { useCallback } from 'react';
import { View } from 'react-native';
import { LuSparkles } from 'react-icons/lu';
import type { ArSceneState } from '@/components/ar/ar-scene';
import type { ArViewHandle } from '@/components/ar/ar-view';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useStore, type Store } from '@/lib/store';
import { useAiPicture } from './use-ai-picture';

/** The scene draws a few frames without the guides before the picture (ms). */
const SETTLE_MS = 300;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function ArAiPicture({
  view,
  scene,
  roomId,
  online,
}: {
  view: React.RefObject<ArViewHandle | null>;
  scene: Store<ArSceneState>;
  roomId: string;
  /** From the room's snapshot: false while the server cannot be reached. */
  online: boolean;
}) {
  const lined = useStore(scene, (s) => s.showRoom);
  const pieces = useStore(scene, (s) => s.items.length);
  const ai = useAiPicture({ roomId, online, overCamera: true });

  /** The camera view as it is, without the app's guides. */
  const takeView = useCallback(async (): Promise<string> => {
    const take = view.current?.takeScreenshot;
    if (!take) throw new Error('The camera view is not ready.');
    const before = scene.get();
    const plain = before.items.map((it) =>
      it.highlight === 'none' ? it : { ...it, highlight: 'none' as const },
    );
    scene.set((s) => ({ ...s, ghost: false, showAim: false, items: plain }));
    try {
      await wait(SETTLE_MS);
      const shot = await take(`youngvista-ai-${Date.now()}`);
      if (!shot.success || !shot.url) throw new Error(`No screenshot (${shot.errorCode ?? '?'})`);
      return shot.url.startsWith('file://') ? shot.url : `file://${shot.url}`;
    } finally {
      // Put the guides back, unless the screen changed them meanwhile.
      scene.set((s) => ({
        ...s,
        ghost: s.ghost === false ? before.ghost : s.ghost,
        showAim: s.showAim === false ? before.showAim : s.showAim,
        items: s.items === plain ? before.items : s.items,
      }));
    }
  }, [view, scene]);

  return (
    <View className="gap-2" pointerEvents="box-none">
      {ai.card}
      {lined ? (
        <Button
          variant="outline"
          className="border-white/40 bg-black/40"
          disabled={pieces === 0 || ai.busy}
          onPress={() => void ai.start({ use: 'ar', source: takeView })}
          accessibilityHint={
            pieces === 0
              ? 'Add furniture first.'
              : 'AI makes a photo-real picture of the camera view with the furniture in it.'
          }
        >
          <Icon as={LuSparkles} size={16} className="text-white" />
          <Text className="text-white">{ai.busy ? 'AI working…' : 'AI picture'}</Text>
        </Button>
      ) : null}
      {ai.modals}
    </View>
  );
}

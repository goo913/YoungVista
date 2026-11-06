/**
 * The one-time question before the first picture of the user's room goes to AI (a photo, the
 * camera view, or the 3D view of their room's layout): Apple requires apps to say when personal
 * data goes to a third-party AI and to ask first. It says what is sent, why, and what happens to
 * it, and never names who makes the AI. The answer is kept on this phone, per account
 * (lib/ai-picture.ts).
 */
import { Modal, ScrollView, View, type ModalProps } from 'react-native';
import { LuShieldCheck } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** Over a camera screen, which runs in landscape, the question stays sideways. */
export const CAMERA_ORIENTATIONS: ModalProps['supportedOrientations'] = [
  'landscape-left',
  'landscape-right',
];

const POINTS = [
  'To make an AI picture, YoungVista sends a picture of your room (a photo, the camera view or the 3D view) to an AI service run by another company.',
  'It is used only to make your picture, and it is not used to train AI.',
  'The picture and the AI picture are kept with this room until you delete them, and deleting the room deletes them too.',
  'Leave people, faces and papers out of your photos.',
];

export function AiConsent({
  visible,
  onAnswer,
  overCamera = false,
}: {
  visible: boolean;
  /** True: allowed (asked once per account on this phone). False: not now. */
  onAnswer: (allowed: boolean) => void;
  /** Opened over a camera screen (landscape). */
  overCamera?: boolean;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => onAnswer(false)}
      supportedOrientations={overCamera ? CAMERA_ORIENTATIONS : undefined}
    >
      <View className="flex-1 items-center justify-center bg-black/60 p-6">
        <View className="bg-background w-full max-w-md rounded-2xl" style={{ maxHeight: '100%' }}>
          <ScrollView contentContainerClassName="gap-4 p-5" bounces={false}>
            <View className="flex-row items-center gap-2">
              <Icon as={LuShieldCheck} size={22} className="text-primary" />
              <Text className="flex-1 text-lg font-semibold" accessibilityRole="header">
                Send a picture of your room to AI?
              </Text>
            </View>
            <View className="gap-2">
              {POINTS.map((point) => (
                <View key={point} className="flex-row gap-2">
                  <Text className="text-muted-foreground text-sm">•</Text>
                  <Text className="text-muted-foreground flex-1 text-sm">{point}</Text>
                </View>
              ))}
            </View>
            <Text className="text-muted-foreground text-xs">You are asked once on this phone.</Text>
            <View className="gap-2">
              <Button size="lg" onPress={() => onAnswer(true)}>
                <Text>Allow and continue</Text>
              </Button>
              <Button variant="outline" onPress={() => onAnswer(false)}>
                <Text>Not now</Text>
              </Button>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The card that says how an AI picture is going: taking the picture, sending it, AI working on it
 * (with the seconds so far), ready (Open), or why there is none (Try again when it can help).
 * Hiding it while AI works does not stop anything: the picture still lands in the room's pictures.
 */
import type { AiPictureUse } from '@youngvista/core';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  LuCircleCheck,
  LuImage,
  LuRefreshCw,
  LuSparkles,
  LuTriangleAlert,
  LuX,
} from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { aiCardText, canRetry, isAiBusy, type AiStep } from '@/lib/ai-picture-state';

export function AiCard({
  step,
  use,
  onOpen,
  onRetry,
  onDismiss,
}: {
  step: AiStep;
  use: AiPictureUse;
  /** Opens the finished picture. */
  onOpen: () => void;
  onRetry: () => void;
  /** Hides the card (AI keeps working if it is). */
  onDismiss: () => void;
}) {
  // While AI works, the card counts the seconds.
  const [now, setNow] = useState(() => Date.now());
  const making = step.kind === 'making';
  useEffect(() => {
    if (!making) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [making]);

  if (step.kind === 'idle') return null;
  const text = aiCardText(step, use, Math.max(now, step.kind === 'making' ? step.since : now));
  const busy = isAiBusy(step);
  return (
    <View
      className="bg-background border-border gap-2 rounded-xl border p-3 shadow-md shadow-black/15"
      accessibilityLiveRegion="polite"
    >
      <View className="flex-row items-start gap-3">
        <View className="mt-0.5 size-5 items-center justify-center">
          {busy ? (
            <ActivityIndicator size="small" />
          ) : (
            <Icon
              as={text.tone === 'done' ? LuCircleCheck : LuTriangleAlert}
              size={20}
              className={text.tone === 'done' ? 'text-green-600' : 'text-destructive'}
            />
          )}
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <Icon as={LuSparkles} size={14} className="text-primary" />
            <Text className="text-sm font-semibold">{text.title}</Text>
          </View>
          <Text className="text-muted-foreground text-xs">{text.detail}</Text>
        </View>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onPress={onDismiss}
          accessibilityLabel={busy ? 'Hide; the AI picture is still made' : 'Dismiss'}
        >
          <Icon as={LuX} size={16} />
        </Button>
      </View>
      {step.kind === 'done' ? (
        <Button size="sm" onPress={onOpen}>
          <Icon as={LuImage} size={14} className="text-primary-foreground" />
          <Text>Open the AI picture</Text>
        </Button>
      ) : step.kind === 'failed' && canRetry(step.failure) ? (
        <Button size="sm" variant="outline" onPress={onRetry}>
          <Icon as={LuRefreshCw} size={14} />
          <Text>Try again</Text>
        </Button>
      ) : null}
    </View>
  );
}

/**
 * Making an AI picture on the phone, for the 3D view, the camera view and the room page:
 * the one-time consent, then taking the picture, making it ready, sending it, and waiting for AI
 * (lib/ai-picture.ts), with a card that says how it goes (`card`) and the picture viewer that
 * opens on the result (`modals`). The new picture is in the room's pictures on the server, so it
 * shows on the room page and the website by itself. "Try again" sends the same picture again
 * under the same id: the server never makes or charges it twice.
 */
import {
  aiPictureFailure,
  aiSourcePath,
  type AiPictureRequest,
  type AiPictureUse,
} from '@youngvista/core';
import { getRandomBytes } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmDeletePicture } from '@/components/pictures/delete-picture';
import { PictureViewer } from '@/components/pictures/picture-viewer';
import {
  callAiImage,
  giveAiConsent,
  hasAiConsent,
  prepareSource,
  uploadSource,
  type LocalImage,
} from '@/lib/ai-picture';
import { aiResultPicture, isAiBusy, type AiStep } from '@/lib/ai-picture-state';
import { useUser } from '@/lib/auth';
import { newPictureId, type StripPicture } from '@/lib/picture-state';
import { AiCard } from './ai-card';
import { AiConsent } from './ai-consent';

export interface AiStart {
  use: AiPictureUse;
  /** Takes the picture to send: the 3D view, the camera view, or the chosen photo (`file://`). */
  source: () => Promise<string>;
  /** 'photo': the design items to show. */
  itemIds?: string[];
  /** 'photo': the user's own words. */
  request?: string;
}

interface Job {
  start: AiStart;
  pictureId: string;
  image: LocalImage | null;
}

export function useAiPicture({
  roomId,
  online,
  overCamera = false,
}: {
  roomId: string;
  /** From the room's snapshot: false while the server cannot be reached. */
  online: boolean;
  /** Over a camera screen (landscape): the consent and the viewer stay sideways. */
  overCamera?: boolean;
}) {
  const user = useUser();
  const [step, setStep] = useState<AiStep>({ kind: 'idle' });
  const [use, setUse] = useState<AiPictureUse>('render');
  const [asking, setAsking] = useState<((allowed: boolean) => void) | null>(null);
  const [viewing, setViewing] = useState<StripPicture | null>(null);
  // The card hidden while AI works: it comes back when AI is done or gives up.
  const [hidden, setHidden] = useState(false);
  const job = useRef<Job | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const show = useCallback((next: AiStep) => {
    if (!mounted.current) return;
    setStep(next);
    if (next.kind === 'done' || next.kind === 'failed' || next.kind === 'capturing') {
      setHidden(false);
    }
  }, []);

  const run = useCallback(
    async (j: Job) => {
      if (running.current) return;
      running.current = true;
      try {
        // The picture as the user framed it is kept for "Try again".
        if (!j.image) {
          show({ kind: 'capturing' });
          try {
            j.image = await prepareSource(await j.start.source());
          } catch {
            show({ kind: 'failed', failure: 'capture' });
            return;
          }
        }
        if (!online) {
          show({ kind: 'failed', failure: 'offline' });
          return;
        }
        show({ kind: 'uploading', progress: 0 });
        await uploadSource(
          { uid: user.uid, roomId, pictureId: j.pictureId, image: j.image },
          (progress) => show({ kind: 'uploading', progress }),
        );
        show({ kind: 'making', since: Date.now() });
        const request: AiPictureRequest = {
          roomId,
          pictureId: j.pictureId,
          use: j.start.use,
          itemIds: j.start.itemIds ?? [],
          request: j.start.request ?? '',
          platform: 'ios',
        };
        const result = await callAiImage(request);
        show({ kind: 'done', result });
        if (mounted.current) {
          setViewing(
            aiResultPicture(
              result,
              j.start.use,
              aiSourcePath(user.uid, roomId, j.pictureId),
              Date.now(),
            ),
          );
        }
      } catch (error) {
        show({ kind: 'failed', failure: aiPictureFailure(error, online) });
      } finally {
        running.current = false;
      }
    },
    [roomId, user.uid, online, show],
  );

  /** Starts an AI picture: asks the one-time consent first, the first time. */
  const start = useCallback(
    async (s: AiStart) => {
      if (running.current || isAiBusy(step)) return;
      if (!(await hasAiConsent(user.uid))) {
        const allowed = await new Promise<boolean>((resolve) => setAsking(() => resolve));
        setAsking(null);
        if (!allowed) return;
        await giveAiConsent(user.uid);
      }
      setUse(s.use);
      job.current = { start: s, pictureId: newPictureId(getRandomBytes), image: null };
      await run(job.current);
    },
    [run, step, user.uid],
  );

  const retry = useCallback(() => {
    if (job.current) void run(job.current);
  }, [run]);

  const dismiss = useCallback(() => {
    // Hiding the card while AI works only hides it: the picture still lands in the room.
    if (isAiBusy(step)) setHidden(true);
    else show({ kind: 'idle' });
  }, [show, step]);

  const open = useCallback(() => {
    if (step.kind !== 'done' || !job.current) return;
    setViewing(
      aiResultPicture(
        step.result,
        job.current.start.use,
        aiSourcePath(user.uid, roomId, job.current.pictureId),
        Date.now(),
      ),
    );
  }, [step, user.uid, roomId]);

  const card =
    step.kind === 'idle' || hidden ? null : (
      <AiCard step={step} use={use} onOpen={open} onRetry={retry} onDismiss={dismiss} />
    );

  const modals = (
    <>
      <AiConsent
        visible={asking !== null}
        onAnswer={(allowed) => asking?.(allowed)}
        overCamera={overCamera}
      />
      <PictureViewer
        picture={viewing}
        status={null}
        overCamera={overCamera}
        onClose={() => setViewing(null)}
        onDelete={(picture) =>
          confirmDeletePicture({
            uid: user.uid,
            roomId,
            picture,
            online,
            onStart: () => {
              setViewing(null);
              show({ kind: 'idle' });
            },
          })
        }
      />
    </>
  );

  return { step, busy: isAiBusy(step), start, retry, dismiss, card, modals };
}

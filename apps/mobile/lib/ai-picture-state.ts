/**
 * An AI picture being made on the phone, as plain data: the steps the card goes through, what it
 * says at each, and the picture to open when it is done. lib/ai-picture.ts does the work and
 * components/ai shows it. Always "AI": the model and who makes it are never named.
 */
import {
  AI_FAILURE_TEXT,
  AI_MAX_PIECES,
  AI_SOURCE_MAX_SIDE,
  AI_USE_LABEL,
  catalogVariant,
  type AiPictureFailure,
  type AiPictureResult,
  type AiPictureUse,
  type CatalogItem,
  type DesignItem,
} from '@youngvista/core';
import type { StripPicture } from './picture-state';

/** The size of the picture sent to AI: the same, or scaled down so the longest side is `max`. */
export function sourceSize(
  width: number,
  height: number,
  max = AI_SOURCE_MAX_SIDE,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const k = max / long;
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

/** Why no AI picture was made: the server's reasons, or the picture could not be taken here. */
export type AiFlowFailure = AiPictureFailure | 'capture';

export type AiStep =
  | { kind: 'idle' }
  /** Taking the 3D or camera view, or making the photo ready to send. */
  | { kind: 'capturing' }
  /** Sending the picture: 0 to 1. */
  | { kind: 'uploading'; progress: number }
  /** AI is working on it, since this time (ms). */
  | { kind: 'making'; since: number }
  | { kind: 'done'; result: AiPictureResult }
  | { kind: 'failed'; failure: AiFlowFailure };

export const isAiBusy = (step: AiStep): boolean =>
  step.kind === 'capturing' || step.kind === 'uploading' || step.kind === 'making';

export interface AiCardText {
  tone: 'busy' | 'done' | 'warn';
  title: string;
  detail: string;
}

const CAPTURE_TEXT: Record<AiPictureUse, string> = {
  render: 'Taking the 3D view…',
  ar: 'Taking the camera view…',
  photo: 'Getting your photo ready…',
};

/** About how long AI takes (ms): the card says so, then that it can take longer. */
export const AI_TYPICAL_MS = 45_000;

/** What the card says at a step. `now` (ms) counts the time AI has been working. */
export function aiCardText(step: AiStep, use: AiPictureUse, now: number): AiCardText {
  switch (step.kind) {
    case 'idle':
    case 'capturing':
      return { tone: 'busy', title: 'AI picture', detail: CAPTURE_TEXT[use] };
    case 'uploading':
      return {
        tone: 'busy',
        title: 'Sending the picture to AI…',
        detail: `${Math.round(Math.min(1, Math.max(0, step.progress)) * 100)}% sent.`,
      };
    case 'making': {
      const seconds = Math.max(0, Math.floor((now - step.since) / 1000));
      return {
        tone: 'busy',
        title: 'AI is making your picture…',
        detail:
          now - step.since < AI_TYPICAL_MS
            ? `It takes about half a minute (${seconds} s so far). You can keep looking around.`
            : `It can take up to two minutes (${seconds} s so far). It is saved in this room’s pictures when done.`,
      };
    }
    case 'done':
      return {
        tone: 'done',
        title: 'AI picture ready',
        detail: `Saved in this room’s pictures, ${AI_USE_LABEL[use]}.`,
      };
    case 'failed':
      return { tone: 'warn', ...aiFailureText(step.failure) };
  }
}

export function aiFailureText(failure: AiFlowFailure): { title: string; detail: string } {
  if (failure === 'capture') {
    return { title: 'No picture', detail: 'The picture could not be taken. Try again.' };
  }
  return AI_FAILURE_TEXT[failure];
}

/**
 * Whether "Try again" can help. Not after a refusal (the same picture would be refused again),
 * the daily limit, a missing room or plan, or being signed out.
 */
export function canRetry(failure: AiFlowFailure): boolean {
  switch (failure) {
    case 'blocked':
    case 'limit':
    case 'not-found':
    case 'no-plan':
    case 'signed-out':
    case 'bad-request':
      return false;
    default:
      return true;
  }
}

/* "Show my furniture in a photo": which of the room's pieces to show. */

/** One product in one colour from the room's design, with the pieces (design items) of it. */
export interface PhotoPiece {
  key: string;
  /** The product's name, with its colour when it comes in several. */
  name: string;
  itemIds: string[];
  product: CatalogItem;
  variant: string | undefined;
}

/** The room's pieces to choose from, one entry per product and colour, biggest first. */
export function photoPieces(
  items: readonly DesignItem[],
  product: (productId: string) => CatalogItem | null,
): PhotoPiece[] {
  const byKey = new Map<string, PhotoPiece>();
  for (const item of items) {
    const p = product(item.productId);
    if (!p) continue;
    const variant = catalogVariant(p, item.variant)?.id;
    const key = `${p.id}#${variant ?? ''}`;
    const known = byKey.get(key);
    if (known) {
      known.itemIds.push(item.id);
      continue;
    }
    const colour = p.variants.length > 1 ? (catalogVariant(p, variant) ?? p.variants[0]) : null;
    byKey.set(key, {
      key,
      name: colour ? `${p.name} (${colour.name})` : p.name,
      itemIds: [item.id],
      product: p,
      variant,
    });
  }
  const volume = (x: PhotoPiece) =>
    x.product.dimensions.w * x.product.dimensions.d * x.product.dimensions.h;
  return [...byKey.values()].sort((a, b) => volume(b) - volume(a));
}

/** The design items of the chosen entries, as the server takes them. */
export function chosenItemIds(
  pieces: readonly PhotoPiece[],
  chosen: ReadonlySet<string>,
): string[] {
  return pieces.filter((p) => chosen.has(p.key)).flatMap((p) => p.itemIds);
}

/** Whether `key` can be chosen too: at most `AI_MAX_PIECES` pieces in all. */
export function canAddPiece(
  pieces: readonly PhotoPiece[],
  chosen: ReadonlySet<string>,
  key: string,
): boolean {
  const piece = pieces.find((p) => p.key === key);
  if (!piece || chosen.has(key)) return Boolean(piece);
  return chosenItemIds(pieces, chosen).length + piece.itemIds.length <= AI_MAX_PIECES;
}

/** At first: the biggest pieces, as many as fit within `AI_MAX_PIECES`. */
export function firstChoice(pieces: readonly PhotoPiece[]): Set<string> {
  const chosen = new Set<string>();
  for (const p of pieces) if (canAddPiece(pieces, chosen, p.key)) chosen.add(p.key);
  return chosen;
}

/** The new AI picture as the picture viewer shows it (it is on the server already). */
export function aiResultPicture(
  result: AiPictureResult,
  use: AiPictureUse,
  sourcePath: string,
  now: number,
): StripPicture {
  return {
    id: result.pictureId,
    time: now,
    width: result.width,
    height: result.height,
    file: null,
    storagePath: result.storagePath,
    pending: null,
    kind: 'ai',
    sourcePath,
    sourceUse: use,
  };
}

/**
 * AI pictures, always called just "AI" in the app and on the website (never the model or who
 * makes it). Three uses:
 * - 'render': a picture of the 3D view, made photo-real;
 * - 'ar': a picture of the camera view with the furniture placed at true size, made photo-real;
 * - 'photo': a real photo of the room, shown with some of the room's furniture, or with a change
 *   the user asks for in their own words.
 *
 * The phone or the website uploads the source image to `aiSourcePath(...)` (next to the room's
 * pictures, so deleting the room deletes it), then calls the server's `aiImage` function with an
 * `AiPictureRequest`. The server makes the picture and saves it like any other: the JPEG at
 * `picturePath(...)` and its record in `rooms/{roomId}/pictures/{pictureId}`, with `kind: 'ai'`
 * (picture.ts). Calling again with the same `pictureId` never makes a second picture.
 */
import type { AiPictureUse, CapturePlatform } from './types';

export const AI_PICTURE_USES: readonly AiPictureUse[] = ['render', 'ar', 'photo'];

/** Most pieces of furniture one AI picture of a photo can show (each goes as a product picture). */
export const AI_MAX_PIECES = 8;

/** Longest request in the user's own words, in characters. */
export const AI_MAX_REQUEST_LENGTH = 300;

/** Longest side of the source image the apps upload (pixels): AI makes 2K pictures. */
export const AI_SOURCE_MAX_SIDE = 2048;

/** How long the apps wait for the server before saying it is taking longer than usual (ms). */
export const AI_CALL_TIMEOUT_MS = 240_000;

/** What the room's pictures say an AI picture was made from. */
export const AI_USE_LABEL: Record<AiPictureUse, string> = {
  render: 'from the 3D view',
  ar: 'from the camera view',
  photo: 'from a photo',
};

/** The input of the server's `aiImage` function. */
export interface AiPictureRequest {
  roomId: string;
  /**
   * The new picture's id, chosen by the app (20 letters and digits, like the room's other
   * pictures). Its source image is uploaded first, to `aiSourcePath(uid, roomId, pictureId)`.
   */
  pictureId: string;
  use: AiPictureUse;
  /**
   * 'photo': the design items (their ids in the room's design) to show in the photo, at most
   * `AI_MAX_PIECES`. 'render' and 'ar' show the furniture already in the picture: the server
   * reads it from the room, and this is empty.
   */
  itemIds: string[];
  /** A change asked for in the user's own words (`cleanAiRequest`), or ''. */
  request: string;
  /** Where the user asked for it. */
  platform: CapturePlatform;
}

/** What `aiImage` answers: the new picture, already in the room's pictures. */
export interface AiPictureResult {
  pictureId: string;
  storagePath: string;
  width: number;
  height: number;
  /** AI pictures the user can still make today. */
  remaining: number;
}

/** True for an id the apps make for pictures: 20 letters and digits (Firestore's own ids too). */
export function isAiPictureId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{20}$/.test(value);
}

/**
 * Storage path of an AI picture's source image:
 * `users/{uid}/rooms/{roomId}/pictures/{pictureId}-source.jpg`.
 */
export function aiSourcePath(uid: string, roomId: string, pictureId: string): string {
  return `users/${uid}/rooms/${roomId}/pictures/${pictureId}-source.jpg`;
}

const chars = (...codes: number[]) => String.fromCharCode(...codes);
/** Control characters, and the line and paragraph separators. */
const CONTROL_CHARACTERS = new RegExp(`[\\x00-\\x1f\\x7f-\\x9f${chars(0x2028, 0x2029)}]`, 'g');
/** Straight, curly and angle double quotes. */
const DOUBLE_QUOTES = new RegExp(`["${chars(0x201c, 0x201d, 0x201e, 0xab, 0xbb)}]`, 'g');

/**
 * The user's request, ready to send: one line, no control characters, single spaces, double
 * quotes as single ones (the server quotes it), at most `AI_MAX_REQUEST_LENGTH` characters.
 */
export function cleanAiRequest(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(DOUBLE_QUOTES, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AI_MAX_REQUEST_LENGTH)
    .trim();
}

const isId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 128 && !v.includes('/');

export type AiRequestCheck =
  { ok: true; request: AiPictureRequest } | { ok: false; problem: string };

/**
 * Checks the input of `aiImage` (the server checks everything again; the apps use it before
 * sending). Unknown fields are dropped.
 */
export function parseAiPictureRequest(data: unknown): AiRequestCheck {
  const no = (problem: string): AiRequestCheck => ({ ok: false, problem });
  if (typeof data !== 'object' || data === null) return no('No request.');
  const d = data as Record<string, unknown>;
  if (!isId(d.roomId)) return no('No room.');
  if (!isAiPictureId(d.pictureId)) return no('The picture id is not valid.');
  if (!AI_PICTURE_USES.includes(d.use as AiPictureUse)) return no('Unknown kind of AI picture.');
  const use = d.use as AiPictureUse;
  const platform: CapturePlatform =
    d.platform === 'android' || d.platform === 'web' ? d.platform : 'ios';

  if (d.request !== undefined && typeof d.request !== 'string')
    return no('The request is not text.');
  if (typeof d.request === 'string' && d.request.length > AI_MAX_REQUEST_LENGTH * 2) {
    return no('The request is too long.');
  }
  const request = cleanAiRequest(d.request);

  let itemIds: string[] = [];
  if (use === 'photo') {
    if (d.itemIds !== undefined && !Array.isArray(d.itemIds)) return no('No furniture list.');
    const ids = (d.itemIds as unknown[] | undefined) ?? [];
    if (!ids.every(isId)) return no('A piece of furniture is not valid.');
    itemIds = [...new Set(ids as string[])];
    if (itemIds.length > AI_MAX_PIECES) {
      return no(`Choose at most ${AI_MAX_PIECES} pieces of furniture.`);
    }
    if (itemIds.length === 0 && !request) {
      return no('Choose some furniture, or say what to change.');
    }
  }
  return {
    ok: true,
    request: { roomId: d.roomId, pictureId: d.pictureId, use, itemIds, request, platform },
  };
}

/**
 * Why no AI picture was made. The server sends it as the error's `details.reason`; the rest come
 * from the connection.
 */
export type AiPictureFailure =
  | 'signed-out'
  | 'not-found'
  | 'no-plan'
  | 'no-source'
  | 'bad-source'
  | 'bad-request'
  | 'limit'
  | 'blocked'
  | 'no-image'
  | 'busy'
  | 'in-progress'
  | 'slow'
  | 'offline'
  | 'failed';

const FAILURES: readonly AiPictureFailure[] = [
  'signed-out',
  'not-found',
  'no-plan',
  'no-source',
  'bad-source',
  'bad-request',
  'limit',
  'blocked',
  'no-image',
  'busy',
  'in-progress',
  'slow',
  'offline',
  'failed',
];

/** What to tell the user, in plain words. Never names who makes the AI. */
export const AI_FAILURE_TEXT: Record<AiPictureFailure, { title: string; detail: string }> = {
  'signed-out': {
    title: 'Sign in again',
    detail: 'You were signed out. Sign in, then try again.',
  },
  'not-found': {
    title: 'Room not found',
    detail: 'This room was deleted or belongs to another account.',
  },
  'no-plan': {
    title: 'No floor plan',
    detail: 'AI pictures need the room’s floor plan. Finish scanning the room first.',
  },
  'no-source': {
    title: 'The picture did not arrive',
    detail: 'Check your connection and try again.',
  },
  'bad-source': {
    title: 'AI cannot use this picture',
    detail: 'Try another photo of the room: a normal photo, at least 512 pixels wide.',
  },
  'bad-request': {
    title: 'Something is missing',
    detail: 'Choose some furniture or say what to change, then try again.',
  },
  limit: {
    title: 'No more AI pictures today',
    detail: 'You have made today’s AI pictures. You can make more tomorrow.',
  },
  blocked: {
    title: 'AI couldn’t process this photo',
    detail:
      'Try a photo without people, faces or papers in it, or ask for a different change. Nothing was saved.',
  },
  'no-image': {
    title: 'AI did not make a picture',
    detail: 'Try again, or ask for the change in other words.',
  },
  busy: {
    title: 'AI is busy',
    detail: 'Too many pictures are being made right now. Try again in a minute.',
  },
  'in-progress': {
    title: 'Still working on it',
    detail: 'This AI picture is still being made. It shows in the room’s pictures when it is done.',
  },
  slow: {
    title: 'Taking longer than usual',
    detail: 'If AI finishes, the picture shows in the room’s pictures by itself.',
  },
  offline: {
    title: 'No connection',
    detail: 'AI pictures need a connection. Check it and try again.',
  },
  failed: {
    title: 'No AI picture',
    detail: 'Something went wrong. Try again in a moment.',
  },
};

/**
 * Reads why a call to `aiImage` failed. `error` is what the Firebase Functions SDK threw: its
 * `code` is `functions/<code>` and its `details` what the server sent. `online` is false when
 * the app knows it has no connection.
 */
export function aiPictureFailure(error: unknown, online = true): AiPictureFailure {
  if (!online) return 'offline';
  if (typeof error !== 'object' || error === null) return 'failed';
  const { code, details } = error as { code?: unknown; details?: unknown };
  const reason =
    typeof details === 'object' && details !== null
      ? (details as { reason?: unknown }).reason
      : undefined;
  if (FAILURES.includes(reason as AiPictureFailure)) return reason as AiPictureFailure;
  switch (typeof code === 'string' ? code.replace(/^functions\//, '') : '') {
    case 'unauthenticated':
      return 'signed-out';
    case 'not-found':
    case 'permission-denied':
      return 'not-found';
    case 'resource-exhausted':
      return 'limit';
    case 'invalid-argument':
      return 'bad-request';
    case 'already-exists':
      return 'in-progress';
    case 'deadline-exceeded':
      return 'slow';
    case 'unavailable':
      return 'busy';
    case 'storage/retry-limit-exceeded':
    case 'storage/canceled':
    case 'auth/network-request-failed':
      return 'offline';
    default:
      return 'failed';
  }
}

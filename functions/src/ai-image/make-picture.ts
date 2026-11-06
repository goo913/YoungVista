/**
 * Making one AI picture, start to end, with everything it touches passed in (`AiImageDeps`), so
 * it is tested without Firebase or the model:
 *
 * 1. check the request and that the caller owns the room (which has a floor plan);
 * 2. start the job: an id already made is answered again, one being made is refused, and the
 *    daily limit is counted (all in one Firestore transaction);
 * 3. read and check the source image the app uploaded;
 * 4. pick the furniture and fetch the biggest pieces' product pictures from Hosting;
 * 5. ask the model, with the use's prompt;
 * 6. save the JPEG next to the room's other pictures and its record (only if the room still
 *    exists), and finish the job.
 *
 * Failures are HttpsErrors whose `details.reason` is core's `AiPictureFailure`; the apps turn it
 * into plain words. A failure the user did not cause gives back today's count; the uploaded
 * source is deleted whenever no picture was made.
 */
import {
  AI_FAILURE_TEXT,
  aiSourcePath,
  buildPictureDoc,
  parseAiPictureRequest,
  picturePath,
  type AiPictureFailure,
  type AiPictureRequest,
  type AiPictureResult,
  type AiPictureUse,
  type Catalog,
  type CatalogItem,
  type Design,
  type PictureDoc,
  type Room,
} from '@youngvista/core';
import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import type { AiImageConfig } from './config';
import { closestAspectRatio, imageInfo, sourceProblem } from './images';
import type { ImageModel, ModelImage, ModelUsage } from './model';
import { groupPieces, numberImages, referenceCandidates } from './pieces';
import { buildAiPrompt, productLabel, roomFacts, sourceLabel, thinkingLevel } from './prompts';
import type { JobResult, StartDecision } from './usage';

/** The room as the function needs it. */
export interface RoomForAi {
  ownerId: string;
  room: Room | null;
  design: Design;
}

export type JobEnd =
  | { status: 'done'; result: JobResult }
  | { status: 'failed'; reason: AiPictureFailure; refund: boolean };

export interface AiImageLog {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export interface AiImageDeps {
  config: AiImageConfig;
  now(): number;
  readRoom(roomId: string): Promise<RoomForAi | null>;
  /** Step 2, in one transaction. */
  startJob(
    uid: string,
    pictureId: string,
    job: { roomId: string; use: AiPictureUse; limit: number },
  ): Promise<StartDecision>;
  finishJob(uid: string, pictureId: string, end: JobEnd): Promise<void>;
  /** A file in Storage, or null when there is none. */
  readFile(path: string): Promise<Uint8Array | null>;
  writeFile(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Deletes a file in Storage; one that is not there counts as deleted. */
  deleteFile(path: string): Promise<void>;
  /** Writes the picture's record, only if the room still exists: false when it is gone. */
  writePicture(roomId: string, pictureId: string, doc: PictureDoc<unknown>): Promise<boolean>;
  /** A server timestamp for `createdAt`. */
  serverTime(): unknown;
  /** The catalog on Hosting, or null when it cannot be read. */
  catalog(): Promise<Catalog | null>;
  /** A product picture on Hosting, or null when it cannot be fetched. */
  thumb(url: string): Promise<ModelImage | null>;
  model: ImageModel;
  log: AiImageLog;
}

/** An HttpsError the apps understand: the reason in `details`, plain words as the message. */
export function aiError(reason: AiPictureFailure, code: FunctionsErrorCode, message?: string) {
  return new HttpsError(code, message ?? AI_FAILURE_TEXT[reason].detail, { reason });
}

const HTTPS_CODE: Record<AiPictureFailure, FunctionsErrorCode> = {
  'signed-out': 'unauthenticated',
  'not-found': 'not-found',
  'no-plan': 'failed-precondition',
  'no-source': 'failed-precondition',
  'bad-source': 'invalid-argument',
  'bad-request': 'invalid-argument',
  limit: 'resource-exhausted',
  blocked: 'failed-precondition',
  'no-image': 'internal',
  busy: 'unavailable',
  'in-progress': 'already-exists',
  slow: 'deadline-exceeded',
  offline: 'unavailable',
  failed: 'internal',
};

/** The design items the picture shows: all of them, or for a photo the ones chosen. */
function chosenItems(req: AiPictureRequest, design: Design) {
  if (req.use !== 'photo') return design.items;
  const wanted = new Set(req.itemIds);
  return design.items.filter((it) => wanted.has(it.id));
}

export async function makeAiPicture(
  uid: string,
  data: unknown,
  deps: AiImageDeps,
): Promise<AiPictureResult> {
  const { config, log } = deps;
  const check = parseAiPictureRequest(data);
  if (!check.ok) throw aiError('bad-request', 'invalid-argument', check.problem);
  const req = check.request;
  const where = { uid, roomId: req.roomId, pictureId: req.pictureId, use: req.use };

  // 1. The caller's room, with a floor plan. Another account's room looks like a missing one.
  const roomDoc = await deps.readRoom(req.roomId);
  if (!roomDoc || roomDoc.ownerId !== uid) throw aiError('not-found', 'not-found');
  if (!roomDoc.room) throw aiError('no-plan', 'failed-precondition');
  const room = roomDoc.room;
  const items = chosenItems(req, roomDoc.design);
  if (req.use === 'photo' && req.itemIds.length > 0 && items.length === 0 && !req.request) {
    throw aiError(
      'bad-request',
      'failed-precondition',
      'Those pieces are no longer in the room. Choose others.',
    );
  }

  // 2. The job and the daily limit.
  const decision = await deps.startJob(uid, req.pictureId, {
    roomId: req.roomId,
    use: req.use,
    limit: config.dailyLimit,
  });
  if (decision.kind === 'done') return { ...decision.result, remaining: decision.remaining };
  if (decision.kind === 'running') throw aiError('in-progress', 'already-exists');
  if (decision.kind === 'limit') {
    log.info('ai picture refused: daily limit', where);
    throw aiError('limit', 'resource-exhausted');
  }

  const sourcePath = aiSourcePath(uid, req.roomId, req.pictureId);
  const outputPath = picturePath(uid, req.roomId, req.pictureId);
  const started = deps.now();
  /**
   * Ends the job as failed and deletes the source (and a picture saved without its record), then
   * returns the error to throw.
   */
  const giveUp = async (reason: AiPictureFailure, refund: boolean, detail?: string) => {
    log.warn('ai picture not made', { ...where, reason, detail, ms: deps.now() - started });
    await Promise.allSettled([
      deps.finishJob(uid, req.pictureId, { status: 'failed', reason, refund }),
      deps.deleteFile(sourcePath),
      deps.deleteFile(outputPath),
    ]);
    return aiError(reason, HTTPS_CODE[reason]);
  };

  try {
    // 3. The source image.
    const bytes = await deps.readFile(sourcePath);
    if (!bytes) throw await giveUp('no-source', true);
    const info = imageInfo(bytes);
    const problem = sourceProblem(info);
    if (problem || !info) throw await giveUp('bad-source', true, problem ?? undefined);

    // 4. The furniture, and the biggest pieces' product pictures.
    const catalog = items.length > 0 ? await deps.catalog() : null;
    if (!catalog && req.use === 'photo' && items.length > 0) {
      throw await giveUp('busy', true, 'catalog unavailable');
    }
    const byId = new Map<string, CatalogItem>((catalog?.items ?? []).map((p) => [p.id, p]));
    const groups = groupPieces(items, (id) => byId.get(id) ?? null);
    const candidates = referenceCandidates(groups, config.maxReferences);
    const thumbs = await Promise.all(candidates.map((g) => deps.thumb(g.thumbUrl!)));
    const pieces = numberImages(
      groups,
      candidates,
      thumbs.map((t) => t !== null),
    );
    // In the order of their numbers (image 2, 3, …), as `numberImages` gave them.
    const references = candidates.flatMap((c, i) => {
      const image = thumbs[i];
      const piece = pieces[groups.indexOf(c)];
      return image && piece?.image != null ? [{ label: productLabel(piece), image }] : [];
    });

    // 5. The model.
    const prompt = buildAiPrompt({
      use: req.use,
      room: roomFacts(room),
      pieces,
      request: req.request,
    });
    const outcome = await deps.model.generate({
      sourceLabel: sourceLabel(req.use),
      source: { bytes, mime: info.mime },
      references,
      prompt,
      aspectRatio: closestAspectRatio(info.width, info.height),
      thinking: thinkingLevel(pieces, config.highThinkingFrom),
    });
    if (!outcome.ok) {
      // A refusal or an answer without a picture was still charged; a busy model was not.
      const refund = outcome.reason === 'busy' || outcome.reason === 'failed';
      throw await giveUp(outcome.reason, refund, outcome.detail);
    }
    const made = imageInfo(outcome.image.bytes);
    if (!made) throw await giveUp('no-image', false, `unreadable ${outcome.image.mime} image`);

    // 6. Saved like any other picture of the room.
    await deps.writeFile(outputPath, outcome.image.bytes, made.mime);
    const written = await deps.writePicture(
      req.roomId,
      req.pictureId,
      buildPictureDoc({
        uid,
        roomId: req.roomId,
        pictureId: req.pictureId,
        width: made.width,
        height: made.height,
        platform: req.platform,
        createdAt: deps.serverTime(),
        ai: { sourcePath, use: req.use },
      }),
    );
    // The room was deleted while AI worked: nothing of the picture stays.
    if (!written) throw await giveUp('not-found', false, 'room deleted meanwhile');
    const result: JobResult = {
      pictureId: req.pictureId,
      storagePath: outputPath,
      width: made.width,
      height: made.height,
    };
    // The picture is in the room now: a job record that cannot be written must not undo it (it
    // only answers a repeated call).
    await deps.finishJob(uid, req.pictureId, { status: 'done', result }).catch((error: unknown) =>
      log.warn('ai picture made, but its job was not recorded', {
        ...where,
        error: String(error),
      }),
    );
    log.info('ai picture made', {
      ...where,
      ms: deps.now() - started,
      model: config.model,
      size: `${made.width}x${made.height}`,
      mime: made.mime,
      pieces: pieces.length,
      references: references.length,
      requestLength: req.request.length,
      usage: outcome.usage satisfies ModelUsage | null,
    });
    return { ...result, remaining: decision.remaining };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    log.error('ai picture failed', {
      ...where,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    throw await giveUp('failed', true);
  }
}

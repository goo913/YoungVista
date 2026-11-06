/**
 * The call to the image model on Vertex AI, through Google's Gen AI SDK. It runs as the
 * function's own service account (no API key), on the `global` endpoint, in the `young-vista`
 * project, billed there. Never sends `seed`, `temperature`, `topP`, `topK` or `logprobs`: the
 * model card says any of them is an error.
 */
import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentResponse,
  type GoogleGenAIOptions,
  type Part,
} from '@google/genai';
import type { AiImageConfig } from './config';

export interface ModelImage {
  bytes: Uint8Array;
  mime: string;
}

export interface GenerateInput {
  /** The words before the source image ("Image 1: …"). */
  sourceLabel: string;
  source: ModelImage;
  /** Product pictures, each with the words before it ("Image 2: …"). */
  references: { label: string; image: ModelImage }[];
  /** The instructions, after the images. */
  prompt: string;
  aspectRatio: string;
  thinking: 'MEDIUM' | 'HIGH';
}

/** Tokens the call used, as Vertex reports them (for the cost). */
export interface ModelUsage {
  prompt: number;
  output: number;
  thoughts: number;
  total: number;
}

export type GenerateOutcome =
  | { ok: true; image: ModelImage; usage: ModelUsage | null; text: string }
  | {
      ok: false;
      /** blocked: refused for safety; no-image: answered without a picture; busy: try later. */
      reason: 'blocked' | 'no-image' | 'busy' | 'failed';
      /** For the logs only (never shown to users: it can name the provider). */
      detail: string;
    };

export interface ImageModel {
  generate(input: GenerateInput): Promise<GenerateOutcome>;
}

/** Finish and block reasons that mean the content was refused. */
const REFUSED = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.IMAGE_SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.IMAGE_PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.RECITATION,
  FinishReason.IMAGE_RECITATION,
  'MODEL_ARMOR',
  'JAILBREAK',
]);

const inline = (image: ModelImage): Part => ({
  inlineData: { mimeType: image.mime, data: Buffer.from(image.bytes).toString('base64') },
});

/** The request's parts: each image after the words that name it, then the instructions. */
export function requestParts(input: GenerateInput): Part[] {
  return [
    { text: input.sourceLabel },
    inline(input.source),
    ...input.references.flatMap((r) => [{ text: r.label }, inline(r.image)]),
    { text: input.prompt },
  ];
}

/** Reads the model's answer: the picture it made, or why there is none. */
export function readImageResponse(response: GenerateContentResponse): GenerateOutcome {
  const blocked = response.promptFeedback?.blockReason;
  if (blocked && blocked !== 'BLOCKED_REASON_UNSPECIFIED') {
    return { ok: false, reason: 'blocked', detail: `prompt blocked: ${blocked}` };
  }
  const candidate = response.candidates?.[0];
  if (!candidate) return { ok: false, reason: 'no-image', detail: 'no candidate' };
  const finish = candidate.finishReason ?? '';
  const parts = candidate.content?.parts ?? [];
  const text = parts
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join(' ')
    .trim();
  // The last image that is not one of the model's thinking drafts.
  const image = parts
    .filter((p) => !p.thought && p.inlineData?.data && p.inlineData.mimeType?.startsWith('image/'))
    .at(-1)?.inlineData;
  if (REFUSED.has(finish) && !image) {
    return { ok: false, reason: 'blocked', detail: `finish ${finish}: ${text}`.trim() };
  }
  if (!image?.data) {
    return { ok: false, reason: 'no-image', detail: `finish ${finish || 'none'}: ${text}`.trim() };
  }
  const meta = response.usageMetadata;
  return {
    ok: true,
    image: { bytes: Buffer.from(image.data, 'base64'), mime: image.mimeType ?? 'image/png' },
    text,
    usage: meta
      ? {
          prompt: meta.promptTokenCount ?? 0,
          output: meta.candidatesTokenCount ?? 0,
          thoughts: meta.thoughtsTokenCount ?? 0,
          total: meta.totalTokenCount ?? 0,
        }
      : null,
  };
}

/** What a failed call means: worth trying again later ('busy'), or not ('failed'). */
export function callFailure(error: unknown): { reason: 'busy' | 'failed'; detail: string } {
  if (error instanceof ApiError) {
    const busy = [429, 500, 502, 503, 504].includes(error.status);
    return { reason: busy ? 'busy' : 'failed', detail: `HTTP ${error.status}: ${error.message}` };
  }
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  // The SDK's own timeout aborts the request.
  if (name === 'AbortError' || name === 'TimeoutError') {
    return { reason: 'busy', detail: `timed out: ${message}` };
  }
  return { reason: 'failed', detail: `${name || 'error'}: ${message}` };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The model on Vertex AI. `auth` is for running outside Google Cloud (the end-to-end check from
 * a computer); in the function it is left out and the runtime's service account is used.
 */
export function vertexImageModel(
  config: AiImageConfig,
  project: string,
  auth?: GoogleGenAIOptions['googleAuthOptions'],
): ImageModel {
  let client: GoogleGenAI | null = null;
  const ai = () =>
    (client ??= new GoogleGenAI({
      vertexai: true,
      project,
      location: config.location,
      ...(auth ? { googleAuthOptions: auth } : {}),
    }));

  const call = (input: GenerateInput) =>
    ai().models.generateContent({
      model: config.model,
      contents: [{ role: 'user', parts: requestParts(input) }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: input.aspectRatio,
          imageSize: config.imageSize,
          personGeneration: config.personGeneration,
          outputMimeType: 'image/jpeg',
          outputCompressionQuality: config.jpegQuality,
        },
        thinkingConfig: {
          thinkingLevel: input.thinking === 'HIGH' ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM,
        },
        httpOptions: { timeout: config.modelTimeoutMs },
      },
    });

  return {
    async generate(input) {
      // One more try, a moment later, when the model is only busy (not after a timeout: the
      // person has waited long enough).
      for (let attempt = 1; ; attempt++) {
        try {
          return readImageResponse(await call(input));
        } catch (error) {
          const failure = callFailure(error);
          const retry =
            attempt === 1 &&
            error instanceof ApiError &&
            (error.status === 429 || error.status === 503);
          if (!retry) return { ok: false, ...failure };
          await wait(3_000);
        }
      }
    },
  };
}

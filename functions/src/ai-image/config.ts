/**
 * The AI picture settings, in one place: which model makes the pictures and where it runs, how
 * big they are, and how many one person can make a day. To swap the model (Google retires image
 * models about 45 days after a successor ships), change `model` here, or set AI_IMAGE_MODEL in
 * the functions' environment (functions/.env) for the next deploy, then re-run the comparison
 * set. The app and the website never see any of this: to them it is always just "AI".
 */

const env = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const positive = (name: string, fallback: number): number => {
  const value = Number(env(name));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

export interface AiImageConfig {
  /** The Vertex AI model id (Nano Banana 2.1, GA since 2026-10-06). */
  model: string;
  /** Vertex AI location: the model is served only on the `global` endpoint. */
  location: string;
  /** Output size: '1K', '2K' or '4K'. */
  imageSize: '1K' | '2K' | '4K';
  /** JPEG quality of the saved picture, 1 to 100. */
  jpegQuality: number;
  /** People in pictures: adults only, never children (Vertex's `personGeneration`). */
  personGeneration: 'ALLOW_ADULT' | 'ALLOW_NONE' | 'ALLOW_ALL';
  /** AI pictures one person can make per day (UTC). */
  dailyLimit: number;
  /** Product pictures sent with one request (the model takes 14 images in all). */
  maxReferences: number;
  /** Longest wait for the model (ms). */
  modelTimeoutMs: number;
  /** More pieces than this: the model thinks harder ('HIGH' instead of 'MEDIUM'). */
  highThinkingFrom: number;
}

export const AI_IMAGE_CONFIG: AiImageConfig = {
  model: env('AI_IMAGE_MODEL') ?? 'gemini-nano-banana-2.1',
  location: env('AI_IMAGE_LOCATION') ?? 'global',
  imageSize: '2K',
  jpegQuality: 90,
  personGeneration: 'ALLOW_ADULT',
  dailyLimit: positive('AI_IMAGE_DAILY_LIMIT', 30),
  maxReferences: 8,
  modelTimeoutMs: 180_000,
  highThinkingFrom: 5,
};

import { ApiError, type GenerateContentResponse } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { callFailure, readImageResponse, requestParts } from '../src/ai-image/model';

const image = (data: string, extra: Record<string, unknown> = {}) => ({
  inlineData: { mimeType: 'image/jpeg', data: Buffer.from(data).toString('base64') },
  ...extra,
});
const answer = (parts: unknown[], finishReason = 'STOP', extra: Record<string, unknown> = {}) =>
  ({
    candidates: [{ content: { role: 'model', parts }, finishReason }],
    usageMetadata: {
      promptTokenCount: 5113,
      candidatesTokenCount: 1680,
      thoughtsTokenCount: 2532,
      totalTokenCount: 9325,
    },
    ...extra,
  }) as unknown as GenerateContentResponse;

describe("the model's answer", () => {
  it('is the last picture that is not a thinking draft', () => {
    const outcome = readImageResponse(
      answer([image('draft', { thought: true }), { text: 'Here it is.' }, image('final')]),
    );
    expect(outcome).toEqual({
      ok: true,
      image: { bytes: Buffer.from('final'), mime: 'image/jpeg' },
      text: 'Here it is.',
      usage: { prompt: 5113, output: 1680, thoughts: 2532, total: 9325 },
    });
  });

  it('is a refusal when the request or the picture was blocked', () => {
    const prompt = readImageResponse({
      promptFeedback: { blockReason: 'PROHIBITED_CONTENT' },
    } as unknown as GenerateContentResponse);
    expect(prompt).toMatchObject({ ok: false, reason: 'blocked' });
    expect(readImageResponse(answer([], 'IMAGE_SAFETY'))).toMatchObject({
      ok: false,
      reason: 'blocked',
    });
    expect(readImageResponse(answer([{ text: 'No.' }], 'SAFETY'))).toMatchObject({
      reason: 'blocked',
      detail: expect.stringContaining('No.'),
    });
  });

  it('has no picture when the model only wrote, or said nothing', () => {
    expect(readImageResponse(answer([{ text: 'Which wall?' }]))).toMatchObject({
      ok: false,
      reason: 'no-image',
      detail: expect.stringContaining('Which wall?'),
    });
    expect(readImageResponse(answer([image('draft', { thought: true })]))).toMatchObject({
      reason: 'no-image',
    });
    expect(
      readImageResponse({ candidates: [] } as unknown as GenerateContentResponse),
    ).toMatchObject({ reason: 'no-image' });
  });
});

describe('failed calls', () => {
  it('are worth trying later when the model is busy or slow', () => {
    expect(callFailure(new ApiError({ message: 'quota', status: 429 })).reason).toBe('busy');
    expect(callFailure(new ApiError({ message: 'down', status: 503 })).reason).toBe('busy');
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    expect(callFailure(timeout).reason).toBe('busy');
  });

  it('are failures otherwise', () => {
    expect(callFailure(new ApiError({ message: 'bad field', status: 400 }))).toEqual({
      reason: 'failed',
      detail: 'HTTP 400: bad field',
    });
    expect(callFailure(new ApiError({ message: 'no', status: 403 })).reason).toBe('failed');
    expect(callFailure(new TypeError('fetch failed')).reason).toBe('failed');
  });
});

describe('the request', () => {
  it('names each image before it, then gives the instructions', () => {
    const source = { bytes: new Uint8Array([1, 2]), mime: 'image/jpeg' };
    const thumb = { bytes: new Uint8Array([3]), mime: 'image/webp' };
    const parts = requestParts({
      sourceLabel: 'Image 1: a photo of the room.',
      source,
      references: [{ label: 'Image 2: product picture of the sofa.', image: thumb }],
      prompt: 'Show the sofa.',
      aspectRatio: '4:3',
      thinking: 'MEDIUM',
    });
    expect(parts).toEqual([
      { text: 'Image 1: a photo of the room.' },
      { inlineData: { mimeType: 'image/jpeg', data: Buffer.from([1, 2]).toString('base64') } },
      { text: 'Image 2: product picture of the sofa.' },
      { inlineData: { mimeType: 'image/webp', data: Buffer.from([3]).toString('base64') } },
      { text: 'Show the sofa.' },
    ]);
  });
});

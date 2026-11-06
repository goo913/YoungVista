import { describe, expect, it } from 'vitest';
import { arLights, BASE_LIGHTS, LIGHT_SCALE_MAX, LIGHT_SCALE_MIN, lightScale } from '@/ar/light';

describe('AR lights from the light estimate', () => {
  it('keeps the base lights without an estimate or in a normally lit room', () => {
    expect(lightScale(null)).toBe(1);
    expect(lightScale(Number.NaN)).toBe(1);
    expect(lightScale(1000)).toBe(1);
    expect(arLights(null)).toEqual(BASE_LIGHTS);
  });

  it('dims in a dim room and brightens in a bright one, within limits', () => {
    expect(lightScale(500)).toBe(0.5);
    expect(lightScale(1300)).toBe(1.3);
    expect(lightScale(0)).toBe(LIGHT_SCALE_MIN);
    expect(lightScale(-20)).toBe(LIGHT_SCALE_MIN);
    expect(lightScale(5000)).toBe(LIGHT_SCALE_MAX);
    expect(arLights(500)).toEqual({ ambient: 150, directional: 425 });
  });

  it('changes in steps, not with every flicker of the estimate', () => {
    expect(lightScale(980)).toBe(1);
    expect(lightScale(1040)).toBe(1);
    expect(arLights(980)).toEqual(arLights(1040));
    expect(lightScale(1060)).toBe(1.1);
  });
});

import { describe, expect, it } from 'vitest';
import { FIXED_GAME_CONFIG } from '../config.ts';
import { generateInteriorPropsForChunk, sampleInteriorHeight } from './interior.ts';

const INTERIOR_CONFIG = {
  ...FIXED_GAME_CONFIG,
  worldMode: 'interior' as const,
};

describe('interior world', () => {
  it('stays continuous across chunk borders', () => {
    const border = INTERIOR_CONFIG.chunkSize;
    const samples = [4, 11.5, 18, 29.25, 46];

    for (const z of samples) {
      const left = sampleInteriorHeight(border - 0.001, z, INTERIOR_CONFIG);
      const right = sampleInteriorHeight(border + 0.001, z, INTERIOR_CONFIG);
      expect(left).toBeCloseTo(right, 8);
    }
  });

  it('introduces staircase elevation changes along the hallway', () => {
    const flatHeight = sampleInteriorHeight(INTERIOR_CONFIG.spawnX, 8, INTERIOR_CONFIG);
    const stairHeight = sampleInteriorHeight(INTERIOR_CONFIG.spawnX, 34, INTERIOR_CONFIG);
    const landingHeight = sampleInteriorHeight(INTERIOR_CONFIG.spawnX, 58, INTERIOR_CONFIG);

    expect(stairHeight).toBeGreaterThan(flatHeight);
    expect(landingHeight).toBeGreaterThanOrEqual(stairHeight);
  });

  it('places furniture deterministically for the same chunk', () => {
    const propsA = generateInteriorPropsForChunk({ x: 0, z: 1 }, INTERIOR_CONFIG);
    const propsB = generateInteriorPropsForChunk({ x: 0, z: 1 }, INTERIOR_CONFIG);

    expect(propsA).toEqual(propsB);
  });
});

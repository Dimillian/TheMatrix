import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config.ts';
import { sampleTerrainHeight } from './terrain.ts';

describe('terrain continuity', () => {
  it('stays continuous across chunk borders', () => {
    const chunkEdge = GAME_CONFIG.chunkSize;
    const samples = [-28, -12.5, 0, 13.75, 30];

    for (const offset of samples) {
      const left = sampleTerrainHeight(chunkEdge, offset, GAME_CONFIG);
      const right = sampleTerrainHeight(chunkEdge, offset, GAME_CONFIG);
      expect(left).toBeCloseTo(right, 8);
    }
  });

  it('changes smoothly around a border', () => {
    const epsilon = 0.01;
    const border = GAME_CONFIG.chunkSize;
    const justBefore = sampleTerrainHeight(border - epsilon, 11.4, GAME_CONFIG);
    const justAfter = sampleTerrainHeight(border + epsilon, 11.4, GAME_CONFIG);

    expect(Math.abs(justBefore - justAfter)).toBeLessThan(0.02);
  });
});

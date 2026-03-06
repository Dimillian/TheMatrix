import { describe, expect, it } from 'vitest';
import { FIXED_GAME_CONFIG } from '../config.ts';
import { sampleTerrain, sampleTerrainHeight } from './terrain.ts';

describe('terrain continuity', () => {
  it('stays continuous across chunk borders', () => {
    const chunkEdge = FIXED_GAME_CONFIG.chunkSize;
    const samples = [-28, -12.5, 0, 13.75, 30];

    for (const offset of samples) {
      const left = sampleTerrainHeight(chunkEdge, offset, FIXED_GAME_CONFIG);
      const right = sampleTerrainHeight(chunkEdge, offset, FIXED_GAME_CONFIG);
      expect(left).toBeCloseTo(right, 8);
    }
  });

  it('changes smoothly around a border', () => {
    const epsilon = 0.01;
    const border = FIXED_GAME_CONFIG.chunkSize;
    const justBefore = sampleTerrainHeight(border - epsilon, 11.4, FIXED_GAME_CONFIG);
    const justAfter = sampleTerrainHeight(border + epsilon, 11.4, FIXED_GAME_CONFIG);

    expect(Math.abs(justBefore - justAfter)).toBeLessThan(0.02);
  });

  it('returns stable biome and climate fields for the same sample point', () => {
    const first = sampleTerrain(87.5, -42.25, FIXED_GAME_CONFIG);
    const second = sampleTerrain(87.5, -42.25, FIXED_GAME_CONFIG);

    expect(first).toEqual(second);
    expect(first.moisture).toBeGreaterThanOrEqual(0);
    expect(first.moisture).toBeLessThanOrEqual(1);
    expect(first.temperature).toBeGreaterThanOrEqual(0);
    expect(first.temperature).toBeLessThanOrEqual(1);
    expect(first.vegetation).toBeGreaterThanOrEqual(0);
    expect(first.vegetation).toBeLessThanOrEqual(1);
    expect(first.rockiness).toBeGreaterThanOrEqual(0);
    expect(first.rockiness).toBeLessThanOrEqual(1);
    expect(first.biome).toMatch(/wetlands|plains|forest|rocky_highlands|barren_ridge/);
  });
});

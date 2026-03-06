import { describe, expect, it } from 'vitest';
import { FIXED_GAME_CONFIG } from '../config.ts';
import { generateTreesForChunk } from './trees.ts';

describe('tree generation', () => {
  it('is deterministic for the same seed and chunk', () => {
    const treesA = generateTreesForChunk({ x: 3, z: -2 }, FIXED_GAME_CONFIG);
    const treesB = generateTreesForChunk({ x: 3, z: -2 }, FIXED_GAME_CONFIG);

    expect(treesA).toEqual(treesB);
  });

  it('varies across chunk coordinates', () => {
    const treesA = generateTreesForChunk({ x: 0, z: 0 }, FIXED_GAME_CONFIG);
    const treesB = generateTreesForChunk({ x: 1, z: 0 }, FIXED_GAME_CONFIG);

    expect(treesA).not.toEqual(treesB);
  });

  it('keeps the spawn area clear', () => {
    const nearbyChunks = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: 1, z: 1 },
      { x: 0, z: -1 },
      { x: 1, z: -1 },
      { x: -1, z: 0 },
      { x: -1, z: 1 },
      { x: -1, z: -1 },
    ];

    for (const coord of nearbyChunks) {
      const trees = generateTreesForChunk(coord, FIXED_GAME_CONFIG);
      for (const tree of trees) {
        const dx = tree.x - FIXED_GAME_CONFIG.spawnX;
        const dz = tree.z - FIXED_GAME_CONFIG.spawnZ;
        expect(dx * dx + dz * dz).toBeGreaterThanOrEqual(
          FIXED_GAME_CONFIG.spawnClearRadius * FIXED_GAME_CONFIG.spawnClearRadius,
        );
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config.ts';
import { generateTreesForChunk } from './trees.ts';

describe('tree generation', () => {
  it('is deterministic for the same seed and chunk', () => {
    const treesA = generateTreesForChunk({ x: 3, z: -2 }, GAME_CONFIG);
    const treesB = generateTreesForChunk({ x: 3, z: -2 }, GAME_CONFIG);

    expect(treesA).toEqual(treesB);
  });

  it('varies across chunk coordinates', () => {
    const treesA = generateTreesForChunk({ x: 0, z: 0 }, GAME_CONFIG);
    const treesB = generateTreesForChunk({ x: 1, z: 0 }, GAME_CONFIG);

    expect(treesA).not.toEqual(treesB);
  });
});

import { describe, expect, it } from 'vitest';
import { chunkKey, enumerateChunkRing, worldToChunkCoord } from './chunks.ts';

describe('chunk helpers', () => {
  it('maps world positions to deterministic chunk coordinates', () => {
    expect(worldToChunkCoord(0, 0, 64)).toEqual({ x: 0, z: 0 });
    expect(worldToChunkCoord(63.9, -0.1, 64)).toEqual({ x: 0, z: -1 });
    expect(worldToChunkCoord(-64.01, 128.4, 64)).toEqual({ x: -2, z: 2 });
  });

  it('creates stable chunk keys', () => {
    expect(chunkKey({ x: -3, z: 5 })).toBe('-3,5');
    expect(chunkKey({ x: 0, z: 0 })).toBe('0,0');
  });

  it('enumerates the active ring with the center first', () => {
    const coords = enumerateChunkRing({ x: 4, z: 7 }, 1);
    expect(coords[0]).toEqual({ x: 4, z: 7 });
    expect(coords).toHaveLength(9);
  });
});

import { describe, expect, it } from 'vitest';
import { FIXED_GAME_CONFIG } from '../config.ts';
import { generatePropsForChunk } from './props.ts';

describe('prop generation', () => {
  it('is deterministic for the same seed and chunk', () => {
    const propsA = generatePropsForChunk({ x: 3, z: -2 }, FIXED_GAME_CONFIG);
    const propsB = generatePropsForChunk({ x: 3, z: -2 }, FIXED_GAME_CONFIG);

    expect(propsA).toEqual(propsB);
  });

  it('varies across chunk coordinates', () => {
    const propsA = generatePropsForChunk({ x: 0, z: 0 }, FIXED_GAME_CONFIG);
    const propsB = generatePropsForChunk({ x: 1, z: 0 }, FIXED_GAME_CONFIG);

    expect(propsA).not.toEqual(propsB);
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
      const props = generatePropsForChunk(coord, FIXED_GAME_CONFIG);
      for (const prop of props) {
        const dx = prop.x - FIXED_GAME_CONFIG.spawnX;
        const dz = prop.z - FIXED_GAME_CONFIG.spawnZ;
        expect(dx * dx + dz * dz).toBeGreaterThanOrEqual(
          FIXED_GAME_CONFIG.spawnClearRadius * FIXED_GAME_CONFIG.spawnClearRadius,
        );
      }
    }
  });

  it('produces multiple silhouette families over nearby chunks', () => {
    const kinds = new Set<string>();
    const nearbyChunks = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: -1, z: 0 },
      { x: 2, z: -1 },
    ];

    for (const coord of nearbyChunks) {
      for (const prop of generatePropsForChunk(coord, FIXED_GAME_CONFIG)) {
        kinds.add(prop.kind);
      }
    }

    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });
});

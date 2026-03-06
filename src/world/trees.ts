import type { ChunkCoord, GameConfig, TreeInstanceData } from '../types.ts';
import { chunkOrigin } from './chunks.ts';
import { sampleTerrain } from './terrain.ts';

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function chunkSeed(coord: ChunkCoord, seed: number): number {
  const x = coord.x * 374761393;
  const z = coord.z * 668265263;
  return (seed ^ x ^ z) >>> 0;
}

export function generateTreesForChunk(coord: ChunkCoord, config: GameConfig): TreeInstanceData[] {
  const random = mulberry32(chunkSeed(coord, config.seed));
  const origin = chunkOrigin(coord, config.chunkSize);
  const minSpacing = 6.5;
  const spawnClearRadiusSq = config.spawnClearRadius * config.spawnClearRadius;
  const trees: TreeInstanceData[] = [];

  for (let candidate = 0; candidate < config.treeCandidatesPerChunk; candidate += 1) {
    const x = origin.x + random() * config.chunkSize;
    const z = origin.z + random() * config.chunkSize;
    const terrain = sampleTerrain(x, z, config);

    if (terrain.slope > 1.55 || terrain.density < 0.42) {
      continue;
    }

    const spawnDx = x - config.spawnX;
    const spawnDz = z - config.spawnZ;
    if (spawnDx * spawnDx + spawnDz * spawnDz < spawnClearRadiusSq) {
      continue;
    }

    const tooClose = trees.some((tree) => {
      const dx = tree.x - x;
      const dz = tree.z - z;
      return dx * dx + dz * dz < minSpacing * minSpacing;
    });

    if (tooClose) {
      continue;
    }

    const fullHeight = 7 + random() * 7 + terrain.density * 4;
    const trunkHeight = fullHeight * (0.32 + random() * 0.06);
    const canopyHeight = fullHeight - trunkHeight;
    const canopyRadius = fullHeight * (0.22 + random() * 0.04);

    trees.push({
      x,
      y: terrain.height,
      z,
      trunkHeight,
      canopyHeight,
      canopyRadius,
    });
  }

  return trees;
}

import type { ChunkCoord, GameConfig, PropInstanceData, PropKind, TerrainSample } from '../types.ts';
import { hash2D } from './noise.ts';
import { chunkOrigin } from './chunks.ts';
import { sampleTerrain } from './terrain.ts';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

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

function clusterInfluence(x: number, z: number, frequency: number, seed: number): number {
  const scaledX = x * frequency;
  const scaledZ = z * frequency;
  const baseX = Math.floor(scaledX);
  const baseZ = Math.floor(scaledZ);
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const cellX = baseX + offsetX;
      const cellZ = baseZ + offsetZ;
      const pointX = cellX + hash2D(cellX, cellZ, seed);
      const pointZ = cellZ + hash2D(cellX, cellZ, seed + 17);
      const dx = scaledX - pointX;
      const dz = scaledZ - pointZ;
      nearestDistanceSq = Math.min(nearestDistanceSq, dx * dx + dz * dz);
    }
  }

  return clamp01(1 - Math.sqrt(nearestDistanceSq) * 1.3);
}

function buildWeights(
  terrain: TerrainSample,
  groveCluster: number,
  stoneCluster: number,
  ruinCluster: number,
): Partial<Record<PropKind, number>> {
  switch (terrain.biome) {
    case 'wetlands':
      return {
        shrub: terrain.moisture * 0.95 + groveCluster * 0.42,
        dead_tree: terrain.moisture * 0.52 + terrain.ridge * 0.16 + groveCluster * 0.18,
        pine: terrain.vegetation * 0.3 + groveCluster * 0.18,
        rock: terrain.rockiness * 0.18 + stoneCluster * 0.12,
      };
    case 'forest':
      return {
        pine: terrain.vegetation * 1.05 + groveCluster * 0.9,
        shrub: terrain.moisture * 0.36 + groveCluster * 0.3,
        rock: terrain.rockiness * 0.28 + stoneCluster * 0.24,
        dead_tree: terrain.ridge * 0.18 + terrain.erosion * 0.12,
      };
    case 'rocky_highlands':
      return {
        rock: terrain.rockiness * 0.9 + stoneCluster * 0.82,
        dead_tree: terrain.vegetation * 0.14 + terrain.ridge * 0.16,
        pine: terrain.vegetation * 0.16 + groveCluster * 0.12,
        obelisk: ruinCluster * 0.18 + terrain.ridge * 0.1,
      };
    case 'barren_ridge':
      return {
        obelisk: ruinCluster * 0.6 + terrain.ridge * 0.46 + terrain.elevation * 0.18,
        rock: terrain.rockiness * 0.72 + stoneCluster * 0.5,
        dead_tree: terrain.vegetation * 0.1 + terrain.erosion * 0.08,
      };
    case 'plains':
    default:
      return {
        shrub: terrain.vegetation * 0.34 + terrain.moisture * 0.24,
        pine: terrain.vegetation * 0.2 + groveCluster * 0.14,
        rock: terrain.rockiness * 0.28 + stoneCluster * 0.18,
        obelisk: ruinCluster * 0.1,
      };
  }
}

function pickWeightedKind(
  weights: Partial<Record<PropKind, number>>,
  random: () => number,
): PropKind | null {
  const entries = Object.entries(weights)
    .map(([kind, weight]) => [kind as PropKind, Math.max(0, weight ?? 0)] as const)
    .filter((entry) => entry[1] > 0);
  const totalWeight = entries.reduce((sum, entry) => sum + entry[1], 0);

  if (totalWeight <= 0) {
    return null;
  }

  const densityGate = clamp01((totalWeight - 0.18) / 1.28);
  if (random() > densityGate) {
    return null;
  }

  let cursor = random() * totalWeight;
  for (const [kind, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) {
      return kind;
    }
  }

  return entries[entries.length - 1]?.[0] ?? null;
}

function getMinSpacing(kind: PropKind): number {
  switch (kind) {
    case 'pine':
      return 5.6;
    case 'dead_tree':
      return 5.1;
    case 'rock':
      return 4.8;
    case 'obelisk':
      return 7.8;
    case 'shrub':
    default:
      return 3.4;
  }
}

function createPropInstance(
  kind: PropKind,
  x: number,
  z: number,
  terrain: TerrainSample,
  random: () => number,
): PropInstanceData {
  const yaw = random() * Math.PI * 2;

  switch (kind) {
    case 'pine': {
      const totalHeight = 7 + random() * 7 + terrain.vegetation * 4.5;
      const trunkHeight = totalHeight * (0.34 + random() * 0.06);
      const crownHeight = totalHeight - trunkHeight;
      const crownRadius = totalHeight * (0.2 + random() * 0.05);
      return {
        kind,
        x,
        y: terrain.height,
        z,
        yaw,
        pitch: (random() - 0.5) * 0.08,
        width: crownRadius * 0.42,
        height: totalHeight,
        depth: crownRadius * 0.42,
        trunkHeight,
        trunkRadius: 0.34 + random() * 0.12,
        crownHeight,
        crownRadius,
      };
    }
    case 'dead_tree': {
      const trunkHeight = 6 + random() * 6.5 + terrain.ridge * 2.4;
      const trunkRadius = 0.28 + random() * 0.12;
      return {
        kind,
        x,
        y: terrain.height,
        z,
        yaw,
        pitch: (random() - 0.5) * 0.18,
        width: trunkRadius * 2.2,
        height: trunkHeight,
        depth: trunkRadius * 2.2,
        trunkHeight,
        trunkRadius,
      };
    }
    case 'shrub':
      return {
        kind,
        x,
        y: terrain.height,
        z,
        yaw,
        pitch: (random() - 0.5) * 0.14,
        width: 1.2 + random() * 1.8 + terrain.moisture * 0.9,
        height: 0.85 + random() * 1.15 + terrain.vegetation * 0.7,
        depth: 1.1 + random() * 1.6 + terrain.moisture * 0.7,
      };
    case 'rock':
      return {
        kind,
        x,
        y: terrain.height,
        z,
        yaw,
        pitch: (random() - 0.5) * 0.34,
        width: 1.4 + random() * 3.2 + terrain.rockiness * 1.1,
        height: 0.95 + random() * 2.4 + terrain.ridge * 0.8,
        depth: 1.3 + random() * 2.6 + terrain.rockiness * 1.3,
      };
    case 'obelisk':
    default:
      return {
        kind,
        x,
        y: terrain.height,
        z,
        yaw,
        pitch: (random() - 0.5) * 0.08,
        width: 0.9 + random() * 0.85,
        height: 4.8 + random() * 5.4 + terrain.ridge * 2.6,
        depth: 0.9 + random() * 0.85,
      };
  }
}

export function generatePropsForChunk(coord: ChunkCoord, config: GameConfig): PropInstanceData[] {
  const random = mulberry32(chunkSeed(coord, config.seed));
  const origin = chunkOrigin(coord, config.chunkSize);
  const spawnClearRadiusSq = config.spawnClearRadius * config.spawnClearRadius;
  const props: PropInstanceData[] = [];

  for (let candidate = 0; candidate < config.propCandidatesPerChunk; candidate += 1) {
    const x = origin.x + random() * config.chunkSize;
    const z = origin.z + random() * config.chunkSize;
    const terrain = sampleTerrain(x, z, config);

    const spawnDx = x - config.spawnX;
    const spawnDz = z - config.spawnZ;
    if (spawnDx * spawnDx + spawnDz * spawnDz < spawnClearRadiusSq) {
      continue;
    }

    if (terrain.slope > 1.85) {
      continue;
    }

    const groveCluster = clusterInfluence(x, z, 0.055, config.seed + 401);
    const stoneCluster = clusterInfluence(x, z, 0.05, config.seed + 503);
    const ruinCluster = clusterInfluence(x, z, 0.018, config.seed + 607);
    const kind = pickWeightedKind(buildWeights(terrain, groveCluster, stoneCluster, ruinCluster), random);

    if (!kind) {
      continue;
    }

    const minSpacing = getMinSpacing(kind);
    const tooClose = props.some((prop) => {
      const spacing = Math.max(minSpacing, getMinSpacing(prop.kind));
      const dx = prop.x - x;
      const dz = prop.z - z;
      return dx * dx + dz * dz < spacing * spacing;
    });

    if (tooClose) {
      continue;
    }

    props.push(createPropInstance(kind, x, z, terrain, random));
  }

  return props;
}

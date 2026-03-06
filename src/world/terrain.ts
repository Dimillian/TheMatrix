import type { GameConfig, TerrainSample } from '../types.ts';
import { fbm2D, valueNoise2D } from './noise.ts';
import { TERRAIN_RULES } from './rules/terrainRules.ts';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function sampleBaseHeight(x: number, z: number, config: GameConfig): number {
  const { broad, hills, detail, basin } = TERRAIN_RULES.height;
  const broadNoise = fbm2D(
    x * broad.scale,
    z * broad.scale,
    config.seed + broad.seedOffset,
    broad.octaves,
    broad.lacunarity,
    broad.gain,
  );
  const hillNoise = fbm2D(
    x * hills.scale,
    z * hills.scale,
    config.seed + hills.seedOffset,
    hills.octaves,
    hills.lacunarity,
    hills.gain,
  );
  const detailNoise = fbm2D(
    x * detail.scale,
    z * detail.scale,
    config.seed + detail.seedOffset,
    detail.octaves,
    detail.lacunarity,
    detail.gain,
  );
  const basinNoise = valueNoise2D(x * basin.scale, z * basin.scale, config.seed + basin.seedOffset);

  const broadHeight = (broadNoise - 0.5) * config.terrainHeight * broad.amplitude;
  const hillHeight = (hillNoise - 0.5) * config.terrainHeight * hills.amplitude;
  const detailHeight = (detailNoise - 0.5) * detail.amplitude;
  const basinOffset = (basinNoise - 0.5) * basin.amplitude;

  return config.terrainBaseHeight + broadHeight + hillHeight + detailHeight - basinOffset;
}

export function sampleTerrainHeight(x: number, z: number, config: GameConfig): number {
  return sampleBaseHeight(x, z, config);
}

export function sampleTerrain(x: number, z: number, config: GameConfig): TerrainSample {
  const height = sampleBaseHeight(x, z, config);
  const sampleStep = TERRAIN_RULES.sampling.slopeStep;
  const dx = sampleBaseHeight(x + sampleStep, z, config) - sampleBaseHeight(x - sampleStep, z, config);
  const dz = sampleBaseHeight(x, z + sampleStep, config) - sampleBaseHeight(x, z - sampleStep, config);
  const slope = Math.sqrt(dx * dx + dz * dz) / (sampleStep * 2);
  const moisture = fbm2D(
    x * TERRAIN_RULES.ecology.moisture.scale,
    z * TERRAIN_RULES.ecology.moisture.scale,
    config.seed + TERRAIN_RULES.ecology.moisture.seedOffset,
    TERRAIN_RULES.ecology.moisture.octaves,
    TERRAIN_RULES.ecology.moisture.lacunarity,
    TERRAIN_RULES.ecology.moisture.gain,
  );
  const treeNoise = fbm2D(
    x * TERRAIN_RULES.ecology.treeNoise.scale,
    z * TERRAIN_RULES.ecology.treeNoise.scale,
    config.seed + TERRAIN_RULES.ecology.treeNoise.seedOffset,
    TERRAIN_RULES.ecology.treeNoise.octaves,
    TERRAIN_RULES.ecology.treeNoise.lacunarity,
    TERRAIN_RULES.ecology.treeNoise.gain,
  );
  const densityRules = TERRAIN_RULES.ecology.density;
  const heightPenalty = Math.max(
    0,
    (height - (config.terrainBaseHeight + config.terrainHeight * densityRules.highAltitudeStart)) *
      densityRules.highAltitudePenalty,
  );
  const density = clamp01(
    treeNoise * densityRules.treeWeight +
      moisture * densityRules.moistureWeight -
      slope * densityRules.slopePenalty -
      heightPenalty,
  );

  return {
    height,
    slope,
    density,
    moisture,
  };
}

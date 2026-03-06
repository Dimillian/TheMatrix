import type { GameConfig, TerrainSample } from '../types.ts';
import { resolveBiome } from './biomes.ts';
import { fbm2D, ridgedNoise2D, valueNoise2D } from './noise.ts';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

interface TerrainFieldSample {
  height: number;
  elevation: number;
  erosion: number;
  ridge: number;
}

function sampleTerrainFields(x: number, z: number, config: GameConfig): TerrainFieldSample {
  const continentalness = fbm2D(x * 0.0018, z * 0.0018, config.seed + 11, 5, 2.02, 0.54);
  const foothills = fbm2D(x * 0.0095, z * 0.0095, config.seed + 37, 4, 2.06, 0.5);
  const ridgeNoise = ridgedNoise2D(x * 0.0045, z * 0.0045, config.seed + 71, 4, 2.02, 0.5);
  const erosion = fbm2D(x * 0.0062, z * 0.0062, config.seed + 113, 4, 2.1, 0.52);
  const basin = valueNoise2D(x * 0.0022, z * 0.0022, config.seed + 151);
  const detail = fbm2D(x * 0.036, z * 0.036, config.seed + 197, 3, 2.45, 0.42);

  const uplift = clamp01((continentalness - 0.4) * 1.8);
  const ridge = Math.pow(ridgeNoise, 1.7) * clamp01(0.35 + uplift * 1.25);
  const basinMask = Math.pow(clamp01((0.56 - basin) / 0.56), 2);
  const erosionCarve = clamp01((erosion - 0.44) * 1.95);

  const continentalLift = (continentalness - 0.5) * config.terrainHeight * 1.85;
  const ridgeLift = ridge * (config.terrainHeight * 1.05);
  const foothillLift = (foothills - 0.5) * config.terrainHeight * (0.38 + uplift * 0.34);
  const detailLift = (detail - 0.5) * (2.8 + ridge * 2.1);
  const basinDepth = basinMask * (4.5 + (1 - uplift) * 4.8);
  const erosionDepth = erosionCarve * (2.4 + ridge * 6.1);

  const height =
    config.terrainBaseHeight +
    continentalLift +
    ridgeLift +
    foothillLift +
    detailLift -
    basinDepth -
    erosionDepth;
  const minHeight = config.terrainBaseHeight - config.terrainHeight * 1.15;
  const maxHeight = config.terrainBaseHeight + config.terrainHeight * 1.95;
  const elevation = clamp01((height - minHeight) / (maxHeight - minHeight));

  return {
    height,
    elevation,
    erosion,
    ridge,
  };
}

export function sampleTerrainHeight(x: number, z: number, config: GameConfig): number {
  return sampleTerrainFields(x, z, config).height;
}

export function sampleTerrain(x: number, z: number, config: GameConfig): TerrainSample {
  const terrainFields = sampleTerrainFields(x, z, config);
  const { height, elevation, erosion, ridge } = terrainFields;
  const sampleStep = 1.5;
  const dx =
    sampleTerrainFields(x + sampleStep, z, config).height -
    sampleTerrainFields(x - sampleStep, z, config).height;
  const dz =
    sampleTerrainFields(x, z + sampleStep, config).height -
    sampleTerrainFields(x, z - sampleStep, config).height;
  const slope = Math.sqrt(dx * dx + dz * dz) / (sampleStep * 2);
  const moistureNoise = fbm2D(x * 0.0075, z * 0.0075, config.seed + 241, 4, 2.04, 0.52);
  const drainage = fbm2D(x * 0.018, z * 0.018, config.seed + 281, 3, 2.2, 0.48);
  const temperatureNoise = fbm2D(x * 0.0046, z * 0.0046, config.seed + 331, 3, 2.02, 0.54);
  const basinWetness = clamp01(0.72 - elevation) * clamp01(1 - slope * 0.5);
  const moisture = clamp01(
    moistureNoise * 0.68 +
      basinWetness * 0.28 +
      drainage * 0.12 -
      slope * 0.22 -
      elevation * 0.08,
  );
  const temperature = clamp01(temperatureNoise * 0.74 + (1 - elevation) * 0.22 - ridge * 0.1);
  const rockiness = clamp01(ridge * 0.62 + slope * 0.42 + elevation * 0.2 - moisture * 0.24);
  const vegetation = clamp01(
    moisture * 0.78 +
      temperature * 0.16 +
      clamp01(1 - slope * 0.42) * 0.22 -
      rockiness * 0.38,
  );
  const biome = resolveBiome({
    elevation,
    slope,
    moisture,
    temperature,
    ridge,
    vegetation,
    rockiness,
  });

  return {
    height,
    slope,
    elevation,
    moisture,
    temperature,
    erosion,
    ridge,
    vegetation,
    rockiness,
    biome,
  };
}

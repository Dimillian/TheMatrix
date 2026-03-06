import type { GameConfig, TerrainSample } from '../types.ts';
import { fbm2D, valueNoise2D } from './noise.ts';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function sampleBaseHeight(x: number, z: number, config: GameConfig): number {
  const broad = fbm2D(x * 0.0035, z * 0.0035, config.seed + 11, 5, 2, 0.52);
  const hills = fbm2D(x * 0.011, z * 0.011, config.seed + 29, 4, 2.1, 0.48);
  const detail = fbm2D(x * 0.04, z * 0.04, config.seed + 53, 3, 2.4, 0.42);
  const basin = valueNoise2D(x * 0.0015, z * 0.0015, config.seed + 101);

  const broadHeight = (broad - 0.5) * config.terrainHeight * 1.45;
  const hillHeight = (hills - 0.5) * config.terrainHeight * 0.65;
  const detailHeight = (detail - 0.5) * 5.5;
  const basinOffset = (basin - 0.5) * 7.5;

  return config.terrainBaseHeight + broadHeight + hillHeight + detailHeight - basinOffset;
}

export function sampleTerrainHeight(x: number, z: number, config: GameConfig): number {
  return sampleBaseHeight(x, z, config);
}

export function sampleTerrain(x: number, z: number, config: GameConfig): TerrainSample {
  const height = sampleBaseHeight(x, z, config);
  const sampleStep = 1.5;
  const dx = sampleBaseHeight(x + sampleStep, z, config) - sampleBaseHeight(x - sampleStep, z, config);
  const dz = sampleBaseHeight(x, z + sampleStep, config) - sampleBaseHeight(x, z - sampleStep, config);
  const slope = Math.sqrt(dx * dx + dz * dz) / (sampleStep * 2);
  const moisture = fbm2D(x * 0.016, z * 0.016, config.seed + 149, 3, 2.05, 0.55);
  const treeNoise = fbm2D(x * 0.02, z * 0.02, config.seed + 211, 4, 2.2, 0.5);
  const heightPenalty = Math.max(0, (height - (config.terrainBaseHeight + config.terrainHeight * 0.45)) * 0.02);
  const density = clamp01(treeNoise * 0.9 + moisture * 0.35 - slope * 0.55 - heightPenalty);

  return {
    height,
    slope,
    density,
    moisture,
  };
}

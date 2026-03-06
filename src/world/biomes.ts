import type { TerrainBiomeId } from '../types.ts';

interface BiomeInputs {
  elevation: number;
  slope: number;
  moisture: number;
  temperature: number;
  ridge: number;
  vegetation: number;
  rockiness: number;
}

export function resolveBiome({
  elevation,
  slope,
  moisture,
  temperature,
  ridge,
  vegetation,
  rockiness,
}: BiomeInputs): TerrainBiomeId {
  if (moisture > 0.72 && slope < 0.82 && elevation < 0.5) {
    return 'wetlands';
  }

  if ((ridge > 0.62 && elevation > 0.58) || (rockiness > 0.74 && slope > 0.9)) {
    return moisture < 0.5 || elevation > 0.7 ? 'barren_ridge' : 'rocky_highlands';
  }

  if (vegetation > 0.58 && moisture > 0.48 && temperature > 0.34) {
    return 'forest';
  }

  if (rockiness > 0.56 || slope > 1.02) {
    return 'rocky_highlands';
  }

  return 'plains';
}

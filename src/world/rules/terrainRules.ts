export const TERRAIN_RULES = {
  height: {
    broad: {
      scale: 0.0035,
      seedOffset: 11,
      octaves: 5,
      lacunarity: 2,
      gain: 0.52,
      amplitude: 1.45,
    },
    hills: {
      scale: 0.011,
      seedOffset: 29,
      octaves: 4,
      lacunarity: 2.1,
      gain: 0.48,
      amplitude: 0.65,
    },
    detail: {
      scale: 0.04,
      seedOffset: 53,
      octaves: 3,
      lacunarity: 2.4,
      gain: 0.42,
      amplitude: 5.5,
    },
    basin: {
      scale: 0.0015,
      seedOffset: 101,
      amplitude: 7.5,
    },
  },
  sampling: {
    slopeStep: 1.5,
  },
  ecology: {
    moisture: {
      scale: 0.016,
      seedOffset: 149,
      octaves: 3,
      lacunarity: 2.05,
      gain: 0.55,
    },
    treeNoise: {
      scale: 0.02,
      seedOffset: 211,
      octaves: 4,
      lacunarity: 2.2,
      gain: 0.5,
    },
    density: {
      treeWeight: 0.9,
      moistureWeight: 0.35,
      slopePenalty: 0.55,
      highAltitudeStart: 0.45,
      highAltitudePenalty: 0.02,
    },
  },
} as const;

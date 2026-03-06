export const INTERIOR_LAYOUT_RULES = {
  gridSize: 8,
  cellSize: 8,
  floorHeightOffset: 1.25,
  edgeOpenings: {
    extraOpeningChance: 0.88,
    minSecondOpeningGap: 3,
  },
  hub: {
    minInset: 2,
    range: 4,
  },
  spine: {
    axisThreshold: 0.5,
  },
  rooms: {
    targetBase: 1,
    targetRange: 2,
    sizeThresholds: {
      medium: 0.4,
      large: 0.82,
    },
    dimensions: {
      small: 3,
      medium: 4,
      large: 5,
    },
    maxPlacementAttempts: 10,
  },
  corridors: {
    branchBase: 1,
    branchRange: 2,
    loopRange: 2,
    minLoopDistance: 4,
    carveStepBudgetMultiplier: 3,
    horizontalBiasThreshold: 0.28,
    verticalBiasThreshold: 0.72,
  },
  props: {
    maxStairsPerChunk: 2,
    stairChanceThreshold: 0.82,
    junctionPillarThreshold: 0.8,
    junctionSideOffsetThreshold: 0.9,
    junctionDepthOffsetThreshold: 0.86,
    consoleThreshold: 0.92,
  },
  roomTypes: ['storage', 'server', 'maintenance', 'control'] as const,
  edges: ['north', 'east', 'south', 'west'] as const,
} as const;

export const INTERIOR_GEOMETRY_RULES = {
  ceilingClearance: 8.8,
  ceilingPanelHeight: 0.8,
  ceilingStripHeight: 0.14,
  ceilingStripGap: 0.16,
  floorThickness: 1.2,
  wallThickness: 1.1,
  trimThickness: 0.3,
  playerRadius: 1.35,
  door: {
    clearWidth: 4.8,
    clearHeight: 7.2,
  },
} as const;

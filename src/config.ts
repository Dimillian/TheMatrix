import type { GameConfig } from './types.ts';

export const DEFAULT_SEED = 1337;

const SHARED_CONFIG: Omit<GameConfig, 'seed'> = {
  spawnX: 32,
  spawnZ: 32,
  chunkSize: 64,
  terrainResolution: 40,
  activeRadius: 2,
  unloadRadius: 3,
  glyphDensity: 1,
  glyphCellWidth: 7,
  glyphCellHeight: 11,
  renderScale: 0.42,
  moveSpeed: 18,
  mouseSensitivity: 0.0022,
  animationSpeed: 1,
  eyeHeight: 5.8,
  maxPitch: Math.PI * 0.48,
  terrainBaseHeight: 4,
  terrainHeight: 26,
  terrainContrast: 1,
  fixedTimeStep: 1 / 60,
  maxChunkBuildsPerFrame: 2,
  treeCandidatesPerChunk: 30,
  spawnClearRadius: 18,
};

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

export function createGameConfig(seed = randomSeed()): GameConfig {
  return {
    seed,
    ...SHARED_CONFIG,
  };
}

export const FIXED_GAME_CONFIG = createGameConfig(DEFAULT_SEED);

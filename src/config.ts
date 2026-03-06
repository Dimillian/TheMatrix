import type { GameConfig } from './types.ts';

export const GAME_CONFIG: GameConfig = {
  seed: 1337,
  spawnX: 32,
  spawnZ: 32,
  chunkSize: 64,
  terrainResolution: 40,
  activeRadius: 2,
  unloadRadius: 3,
  glyphCellWidth: 7,
  glyphCellHeight: 11,
  renderScale: 0.42,
  moveSpeed: 18,
  mouseSensitivity: 0.0022,
  eyeHeight: 5.8,
  maxPitch: Math.PI * 0.48,
  terrainBaseHeight: 4,
  terrainHeight: 26,
  fixedTimeStep: 1 / 60,
  maxChunkBuildsPerFrame: 2,
  treeCandidatesPerChunk: 30,
  spawnClearRadius: 18,
};

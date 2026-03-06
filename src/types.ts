import type * as THREE from 'three';

export interface GameConfig {
  seed: number;
  spawnX: number;
  spawnZ: number;
  chunkSize: number;
  terrainResolution: number;
  activeRadius: number;
  unloadRadius: number;
  glyphDensity: number;
  glyphCellWidth: number;
  glyphCellHeight: number;
  renderScale: number;
  moveSpeed: number;
  mouseSensitivity: number;
  animationSpeed: number;
  eyeHeight: number;
  maxPitch: number;
  terrainBaseHeight: number;
  terrainHeight: number;
  terrainContrast: number;
  fixedTimeStep: number;
  maxChunkBuildsPerFrame: number;
  propCandidatesPerChunk: number;
  spawnClearRadius: number;
}

export interface ChunkCoord {
  x: number;
  z: number;
}

export type TerrainBiomeId =
  | 'wetlands'
  | 'plains'
  | 'forest'
  | 'rocky_highlands'
  | 'barren_ridge';

export interface TerrainSample {
  height: number;
  slope: number;
  elevation: number;
  moisture: number;
  temperature: number;
  erosion: number;
  ridge: number;
  vegetation: number;
  rockiness: number;
  biome: TerrainBiomeId;
}

export type PropKind = 'pine' | 'dead_tree' | 'shrub' | 'rock' | 'obelisk';

export interface PropInstanceData {
  kind: PropKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  width: number;
  height: number;
  depth: number;
  trunkHeight?: number;
  trunkRadius?: number;
  crownHeight?: number;
  crownRadius?: number;
}

export interface ChunkData {
  coord: ChunkCoord;
  key: string;
  group: THREE.Group;
  terrainMesh: THREE.Mesh;
  propInstances: PropInstanceData[];
  bounds: THREE.Box3;
  lastTouchedFrame: number;
}

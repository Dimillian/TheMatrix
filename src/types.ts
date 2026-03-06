import type * as THREE from 'three';

export interface GameConfig {
  seed: number;
  chunkSize: number;
  terrainResolution: number;
  activeRadius: number;
  unloadRadius: number;
  glyphCellWidth: number;
  glyphCellHeight: number;
  renderScale: number;
  moveSpeed: number;
  mouseSensitivity: number;
  eyeHeight: number;
  maxPitch: number;
  terrainBaseHeight: number;
  terrainHeight: number;
  fixedTimeStep: number;
  maxChunkBuildsPerFrame: number;
  treeCandidatesPerChunk: number;
}

export interface ChunkCoord {
  x: number;
  z: number;
}

export interface TerrainSample {
  height: number;
  slope: number;
  density: number;
  moisture: number;
}

export interface TreeInstanceData {
  x: number;
  y: number;
  z: number;
  trunkHeight: number;
  canopyHeight: number;
  canopyRadius: number;
}

export interface ChunkData {
  coord: ChunkCoord;
  key: string;
  group: THREE.Group;
  terrainMesh: THREE.Mesh;
  treeInstances: TreeInstanceData[];
  bounds: THREE.Box3;
  lastTouchedFrame: number;
}

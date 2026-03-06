import type * as THREE from 'three';

export const GLYPH_RENDER_MODES = ['classic', 'rain'] as const;

export type GlyphRenderMode = (typeof GLYPH_RENDER_MODES)[number];

export const GLYPH_RENDER_MODE_LABELS: Record<GlyphRenderMode, string> = {
  classic: 'Classic',
  rain: 'Rain Mask',
};

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
  renderMode: GlyphRenderMode;
  fixedTimeStep: number;
  maxChunkBuildsPerFrame: number;
  treeCandidatesPerChunk: number;
  spawnClearRadius: number;
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

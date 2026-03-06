import type { ChunkCoord, GameConfig } from '../types.ts';
import { chunkOrigin } from './chunks.ts';

export interface InteriorFloorSpan {
  startZ: number;
  endZ: number;
  height: number;
}

export interface InteriorPropInstance {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

const INTERIOR_FLAT_RUN = 28;
const INTERIOR_STEP_COUNT = 8;
const INTERIOR_STEP_DEPTH = 2.75;
const INTERIOR_STEP_RISE = 0.82;
const INTERIOR_LANDING_RUN = 22;
const INTERIOR_MODULE_LENGTH =
  INTERIOR_FLAT_RUN + INTERIOR_STEP_COUNT * INTERIOR_STEP_DEPTH + INTERIOR_LANDING_RUN;
const INTERIOR_LEVEL_GAIN = INTERIOR_STEP_COUNT * INTERIOR_STEP_RISE;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function chunkSeed(coord: ChunkCoord, seed: number): number {
  const x = coord.x * 2246822519;
  const z = coord.z * 3266489917;
  return (seed ^ x ^ z) >>> 0;
}

function getModuleIndex(z: number): number {
  return Math.floor(z / INTERIOR_MODULE_LENGTH);
}

function getLocalModuleZ(z: number): number {
  const moduleIndex = getModuleIndex(z);
  return z - moduleIndex * INTERIOR_MODULE_LENGTH;
}

function getModuleBaseHeight(z: number, config: GameConfig): number {
  return config.terrainBaseHeight + 1.25 + getModuleIndex(z) * INTERIOR_LEVEL_GAIN;
}

export function sampleInteriorHeight(_x: number, z: number, config: GameConfig): number {
  const localZ = getLocalModuleZ(z);
  const baseHeight = getModuleBaseHeight(z, config);

  if (localZ < INTERIOR_FLAT_RUN) {
    return baseHeight;
  }

  const stairDistance = localZ - INTERIOR_FLAT_RUN;
  const totalStairDistance = INTERIOR_STEP_COUNT * INTERIOR_STEP_DEPTH;

  if (stairDistance < totalStairDistance) {
    const stairIndex = Math.floor(stairDistance / INTERIOR_STEP_DEPTH) + 1;
    return baseHeight + stairIndex * INTERIOR_STEP_RISE;
  }

  return baseHeight + INTERIOR_LEVEL_GAIN;
}

export function enumerateInteriorFloorSpans(
  startZ: number,
  endZ: number,
  config: GameConfig,
): InteriorFloorSpan[] {
  const spans: InteriorFloorSpan[] = [];
  let cursor = startZ;

  while (cursor < endZ - 0.0001) {
    const moduleIndex = getModuleIndex(cursor);
    const moduleStart = moduleIndex * INTERIOR_MODULE_LENGTH;
    const localZ = cursor - moduleStart;
    const baseHeight = getModuleBaseHeight(cursor, config);
    let nextBoundary = moduleStart + INTERIOR_MODULE_LENGTH;
    let height = baseHeight + INTERIOR_LEVEL_GAIN;

    if (localZ < INTERIOR_FLAT_RUN) {
      nextBoundary = moduleStart + INTERIOR_FLAT_RUN;
      height = baseHeight;
    } else if (localZ < INTERIOR_FLAT_RUN + INTERIOR_STEP_COUNT * INTERIOR_STEP_DEPTH) {
      const stairIndex = Math.floor((localZ - INTERIOR_FLAT_RUN) / INTERIOR_STEP_DEPTH);
      nextBoundary = moduleStart + INTERIOR_FLAT_RUN + (stairIndex + 1) * INTERIOR_STEP_DEPTH;
      height = baseHeight + (stairIndex + 1) * INTERIOR_STEP_RISE;
    }

    const spanEnd = Math.min(endZ, nextBoundary);
    spans.push({
      startZ: cursor,
      endZ: spanEnd,
      height,
    });
    cursor = spanEnd;
  }

  return spans;
}

export function generateInteriorPropsForChunk(
  coord: ChunkCoord,
  config: GameConfig,
): InteriorPropInstance[] {
  const random = mulberry32(chunkSeed(coord, config.seed + 907));
  const origin = chunkOrigin(coord, config.chunkSize);
  const hallwayCenterX = origin.x + config.chunkSize * 0.5;
  const propAnchors = [0.2, 0.5, 0.8];
  const props: InteriorPropInstance[] = [];

  for (const anchor of propAnchors) {
    if (random() < 0.22) {
      continue;
    }

    const z = origin.z + config.chunkSize * anchor;
    const height = sampleInteriorHeight(hallwayCenterX, z, config);
    const side = random() < 0.5 ? -1 : 1;
    const width = 2.2 + random() * 3.6;
    const depth = 1.1 + random() * 2.2;
    const propHeight = 1 + random() * 2.8;
    const x = hallwayCenterX + side * (config.chunkSize * 0.28 + random() * 4.5);

    props.push({
      x,
      y: height + propHeight * 0.5,
      z,
      width,
      height: propHeight,
      depth,
    });
  }

  return props;
}

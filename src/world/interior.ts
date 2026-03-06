import type { ChunkCoord, GameConfig } from '../types.ts';
import { chunkOrigin, worldToChunkCoord } from './chunks.ts';
import { INTERIOR_LAYOUT_RULES } from './rules/interiorRules.ts';

export type InteriorEdge = 'north' | 'east' | 'south' | 'west';
export type InteriorCellKind = 'void' | 'hall' | 'junction' | 'room';
export type InteriorRoomType = 'storage' | 'server' | 'maintenance' | 'control';
export type InteriorPropKind = 'crateStack' | 'serverRack' | 'console' | 'bench' | 'pillar' | 'stairRun';

export interface InteriorCell {
  x: number;
  z: number;
  walkable: boolean;
  kind: InteriorCellKind;
  roomType?: InteriorRoomType;
  roomId?: number;
}

export interface InteriorRoom {
  id: number;
  x: number;
  z: number;
  width: number;
  depth: number;
  type: InteriorRoomType;
  doorway?: {
    x: number;
    z: number;
    side: InteriorEdge;
  };
}

export interface InteriorPropInstance {
  kind: InteriorPropKind;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  orientation?: 'x' | 'z';
}

export interface InteriorLayout {
  coord: ChunkCoord;
  origin: { x: number; z: number };
  gridSize: number;
  cellSize: number;
  floorHeight: number;
  hub: { x: number; z: number };
  edgeOpenings: Record<InteriorEdge, number[]>;
  cells: InteriorCell[][];
  rooms: InteriorRoom[];
  props: InteriorPropInstance[];
}

const {
  gridSize: INTERIOR_GRID_SIZE,
  cellSize: INTERIOR_CELL_SIZE,
  floorHeightOffset: INTERIOR_FLOOR_HEIGHT_OFFSET,
  edgeOpenings: { extraOpeningChance: EXTRA_OPENING_CHANCE, minSecondOpeningGap: MIN_SECOND_OPENING_GAP },
  hub: HUB_RULES,
  spine: SPINE_RULES,
  rooms: ROOM_RULES,
  corridors: CORRIDOR_RULES,
  props: PROP_RULES,
  roomTypes: ROOM_TYPES,
  edges: EDGE_ORDER,
} = INTERIOR_LAYOUT_RULES;

function hash(seed: number, a: number, b: number, c: number): number {
  const value = Math.sin(seed * 0.013 + a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}

function createEmptyCells(): InteriorCell[][] {
  return Array.from({ length: INTERIOR_GRID_SIZE }, (_, z) =>
    Array.from({ length: INTERIOR_GRID_SIZE }, (_, x) => ({
      x,
      z,
      walkable: false,
      kind: 'void' as const,
    })),
  );
}

function createMask(): boolean[][] {
  return Array.from({ length: INTERIOR_GRID_SIZE }, () =>
    Array.from({ length: INTERIOR_GRID_SIZE }, () => false),
  );
}

function isInsideGrid(x: number, z: number): boolean {
  return x >= 0 && x < INTERIOR_GRID_SIZE && z >= 0 && z < INTERIOR_GRID_SIZE;
}

function getFloorHeight(config: GameConfig): number {
  return config.terrainBaseHeight + INTERIOR_FLOOR_HEIGHT_OFFSET;
}

function getEdgeSignature(coord: ChunkCoord, side: InteriorEdge): { axis: number; a: number; b: number } {
  switch (side) {
    case 'north':
      return { axis: 0, a: coord.x, b: coord.z };
    case 'south':
      return { axis: 0, a: coord.x, b: coord.z + 1 };
    case 'west':
      return { axis: 1, a: coord.x, b: coord.z };
    case 'east':
      return { axis: 1, a: coord.x + 1, b: coord.z };
  }
}

function getEdgeOpenings(
  coord: ChunkCoord,
  side: InteriorEdge,
  config: GameConfig,
): number[] {
  const signature = getEdgeSignature(coord, side);
  const first =
    1 + Math.floor(hash(config.seed, signature.axis + 0.31, signature.a, signature.b) * (INTERIOR_GRID_SIZE - 2));
  const openings = [first];
  const extraChance = hash(config.seed, signature.axis + 1.91, signature.a, signature.b);

  if (extraChance > EXTRA_OPENING_CHANCE) {
    const rawSecond =
      1 +
      Math.floor(hash(config.seed, signature.axis + 3.17, signature.a, signature.b) * (INTERIOR_GRID_SIZE - 2));
    let second = rawSecond;

    if (Math.abs(second - first) < MIN_SECOND_OPENING_GAP) {
      second =
        second <= first
          ? Math.max(1, first - MIN_SECOND_OPENING_GAP)
          : Math.min(INTERIOR_GRID_SIZE - 2, first + MIN_SECOND_OPENING_GAP);
    }

    if (!openings.includes(second)) {
      openings.push(second);
    }
  }

  return openings.sort((left, right) => left - right);
}

function getPortalCell(side: InteriorEdge, index: number): { x: number; z: number } {
  switch (side) {
    case 'north':
      return { x: index, z: 0 };
    case 'south':
      return { x: index, z: INTERIOR_GRID_SIZE - 1 };
    case 'west':
      return { x: 0, z: index };
    case 'east':
      return { x: INTERIOR_GRID_SIZE - 1, z: index };
  }
}

function setWalkable(
  cells: InteriorCell[][],
  x: number,
  z: number,
  roomMask: boolean[][],
  roomTypeMask: (InteriorRoomType | undefined)[][],
  roomIdMask: (number | undefined)[][],
): void {
  if (!isInsideGrid(x, z)) {
    return;
  }

  const cell = cells[z]?.[x];

  if (!cell) {
    return;
  }

  cell.walkable = true;
  cell.kind = roomMask[z]?.[x] ? 'room' : 'hall';
  cell.roomType = roomTypeMask[z]?.[x];
  cell.roomId = roomIdMask[z]?.[x];
}

function carvePath(
  cells: InteriorCell[][],
  roomMask: boolean[][],
  roomTypeMask: (InteriorRoomType | undefined)[][],
  roomIdMask: (number | undefined)[][],
  start: { x: number; z: number },
  end: { x: number; z: number },
  config: GameConfig,
  salt: number,
): void {
  let x = start.x;
  let z = start.z;

  setWalkable(cells, x, z, roomMask, roomTypeMask, roomIdMask);

  for (let step = 0; step < INTERIOR_GRID_SIZE * INTERIOR_GRID_SIZE * CORRIDOR_RULES.carveStepBudgetMultiplier; step += 1) {
    if (x === end.x && z === end.z) {
      break;
    }

    const dx = end.x - x;
    const dz = end.z - z;
    const favorHorizontal = Math.abs(dx) > Math.abs(dz);
    const turnNoise = hash(config.seed, x + salt, z - salt, step + 0.37);
    const useX =
      dx !== 0 &&
      (dz === 0 ||
        (favorHorizontal
          ? turnNoise > CORRIDOR_RULES.horizontalBiasThreshold
          : turnNoise > CORRIDOR_RULES.verticalBiasThreshold));

    if (useX) {
      x += Math.sign(dx);
    } else if (dz !== 0) {
      z += Math.sign(dz);
    } else {
      x += Math.sign(dx);
    }

    setWalkable(cells, x, z, roomMask, roomTypeMask, roomIdMask);
  }
}

function roomOverlaps(
  roomMask: boolean[][],
  x: number,
  z: number,
  width: number,
  depth: number,
): boolean {
  for (let row = z - 1; row <= z + depth; row += 1) {
    for (let column = x - 1; column <= x + width; column += 1) {
      if (!isInsideGrid(column, row)) {
        continue;
      }

      if (roomMask[row]?.[column]) {
        return true;
      }
    }
  }

  return false;
}

function markRoom(
  cells: InteriorCell[][],
  roomMask: boolean[][],
  roomTypeMask: (InteriorRoomType | undefined)[][],
  roomIdMask: (number | undefined)[][],
  room: InteriorRoom,
): void {
  for (let row = room.z; row < room.z + room.depth; row += 1) {
    for (let column = room.x; column < room.x + room.width; column += 1) {
      roomMask[row]![column] = true;
      roomTypeMask[row]![column] = room.type;
      roomIdMask[row]![column] = room.id;
      setWalkable(cells, column, row, roomMask, roomTypeMask, roomIdMask);
    }
  }
}

function findNearestWalkable(
  cells: InteriorCell[][],
  roomMask: boolean[][],
  target: { x: number; z: number },
  allowRooms = true,
  exclude?: InteriorRoom,
): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let z = 0; z < INTERIOR_GRID_SIZE; z += 1) {
    for (let x = 0; x < INTERIOR_GRID_SIZE; x += 1) {
      if (!cells[z]?.[x]?.walkable) {
        continue;
      }

      if (!allowRooms && roomMask[z]?.[x]) {
        continue;
      }

      if (
        exclude &&
        x >= exclude.x &&
        x < exclude.x + exclude.width &&
        z >= exclude.z &&
        z < exclude.z + exclude.depth
      ) {
        continue;
      }

      const distance = Math.abs(target.x - x) + Math.abs(target.z - z);

      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x, z };
      }
    }
  }

  return best;
}

function countWalkableNeighbors(cells: InteriorCell[][], x: number, z: number): number {
  let count = 0;
  const neighbors = [
    [x, z - 1],
    [x + 1, z],
    [x, z + 1],
    [x - 1, z],
  ];

  for (const [neighborX, neighborZ] of neighbors) {
    if (cells[neighborZ]?.[neighborX]?.walkable) {
      count += 1;
    }
  }

  return count;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function findRoomDoorway(
  room: InteriorRoom,
  anchor: { x: number; z: number },
): { x: number; z: number; side: InteriorEdge } {
  if (anchor.x < room.x) {
    return {
      x: room.x,
      z: clamp(anchor.z, room.z, room.z + room.depth - 1),
      side: 'west',
    };
  }

  if (anchor.x > room.x + room.width - 1) {
    return {
      x: room.x + room.width - 1,
      z: clamp(anchor.z, room.z, room.z + room.depth - 1),
      side: 'east',
    };
  }

  if (anchor.z < room.z) {
    return {
      x: clamp(anchor.x, room.x, room.x + room.width - 1),
      z: room.z,
      side: 'north',
    };
  }

  if (anchor.z > room.z + room.depth - 1) {
    return {
      x: clamp(anchor.x, room.x, room.x + room.width - 1),
      z: room.z + room.depth - 1,
      side: 'south',
    };
  }

  const distances = [
    { side: 'west' as const, distance: Math.abs(anchor.x - room.x) },
    { side: 'east' as const, distance: Math.abs(anchor.x - (room.x + room.width - 1)) },
    { side: 'north' as const, distance: Math.abs(anchor.z - room.z) },
    { side: 'south' as const, distance: Math.abs(anchor.z - (room.z + room.depth - 1)) },
  ].sort((left, right) => left.distance - right.distance);

  switch (distances[0]?.side) {
    case 'west':
      return { x: room.x, z: clamp(anchor.z, room.z, room.z + room.depth - 1), side: 'west' };
    case 'east':
      return { x: room.x + room.width - 1, z: clamp(anchor.z, room.z, room.z + room.depth - 1), side: 'east' };
    case 'north':
      return { x: clamp(anchor.x, room.x, room.x + room.width - 1), z: room.z, side: 'north' };
    default:
      return { x: clamp(anchor.x, room.x, room.x + room.width - 1), z: room.z + room.depth - 1, side: 'south' };
  }
}

function isStraightHallCell(cells: InteriorCell[][], x: number, z: number): 'x' | 'z' | null {
  const north = Boolean(cells[z - 1]?.[x]?.walkable);
  const south = Boolean(cells[z + 1]?.[x]?.walkable);
  const west = Boolean(cells[z]?.[x - 1]?.walkable);
  const east = Boolean(cells[z]?.[x + 1]?.walkable);

  if (west && east && !north && !south) {
    return 'x';
  }

  if (north && south && !west && !east) {
    return 'z';
  }

  return null;
}

function finalizeCellKinds(
  cells: InteriorCell[][],
  roomMask: boolean[][],
  roomTypeMask: (InteriorRoomType | undefined)[][],
  roomIdMask: (number | undefined)[][],
): void {
  for (let z = 0; z < INTERIOR_GRID_SIZE; z += 1) {
    for (let x = 0; x < INTERIOR_GRID_SIZE; x += 1) {
      const cell = cells[z]?.[x];

      if (!cell || !cell.walkable) {
        continue;
      }

      if (roomMask[z]?.[x]) {
        cell.kind = 'room';
        cell.roomType = roomTypeMask[z]?.[x];
        cell.roomId = roomIdMask[z]?.[x];
        continue;
      }

      cell.kind = countWalkableNeighbors(cells, x, z) >= 3 ? 'junction' : 'hall';
      cell.roomId = undefined;
    }
  }
}

function worldPositionForCell(
  layout: InteriorLayout,
  x: number,
  z: number,
): { x: number; z: number } {
  return {
    x: layout.origin.x + (x + 0.5) * layout.cellSize,
    z: layout.origin.z + (z + 0.5) * layout.cellSize,
  };
}

function generateRoomProps(layout: InteriorLayout, room: InteriorRoom): InteriorPropInstance[] {
  const props: InteriorPropInstance[] = [];
  const center = worldPositionForCell(
    layout,
    room.x + Math.floor(room.width * 0.5),
    room.z + Math.floor(room.depth * 0.5),
  );
  const roomWidth = room.width * layout.cellSize;
  const roomDepth = room.depth * layout.cellSize;
  const baseY = layout.floorHeight;

  switch (room.type) {
    case 'storage':
      props.push({
        kind: 'crateStack',
        x: center.x - roomWidth * 0.22,
        y: baseY + 1.25,
        z: center.z - roomDepth * 0.18,
        width: 2.8,
        height: 2.5,
        depth: 2.8,
      });
      props.push({
        kind: 'crateStack',
        x: center.x + roomWidth * 0.2,
        y: baseY + 0.9,
        z: center.z + roomDepth * 0.16,
        width: 2.2,
        height: 1.8,
        depth: 2.2,
      });
      props.push({
        kind: 'bench',
        x: center.x,
        y: baseY + 0.65,
        z: center.z + roomDepth * 0.3,
        width: Math.max(3.2, roomWidth * 0.34),
        height: 1.3,
        depth: 1.4,
      });
      break;
    case 'server':
      props.push({
        kind: 'serverRack',
        x: center.x - roomWidth * 0.26,
        y: baseY + 1.8,
        z: center.z,
        width: 1.9,
        height: 3.6,
        depth: Math.max(4.5, roomDepth * 0.42),
      });
      props.push({
        kind: 'serverRack',
        x: center.x + roomWidth * 0.26,
        y: baseY + 1.8,
        z: center.z,
        width: 1.9,
        height: 3.6,
        depth: Math.max(4.5, roomDepth * 0.42),
      });
      props.push({
        kind: 'pillar',
        x: center.x,
        y: baseY + 2,
        z: center.z + roomDepth * 0.26,
        width: 1.1,
        height: 4,
        depth: 1.1,
      });
      break;
    case 'maintenance':
      props.push({
        kind: 'console',
        x: center.x - roomWidth * 0.24,
        y: baseY + 1.05,
        z: center.z + roomDepth * 0.22,
        width: 3.2,
        height: 2.1,
        depth: 1.3,
      });
      props.push({
        kind: 'bench',
        x: center.x + roomWidth * 0.18,
        y: baseY + 0.7,
        z: center.z - roomDepth * 0.18,
        width: 2.8,
        height: 1.4,
        depth: 1.2,
      });
      break;
    case 'control':
      props.push({
        kind: 'console',
        x: center.x,
        y: baseY + 1.15,
        z: center.z - roomDepth * 0.24,
        width: Math.max(3.4, roomWidth * 0.38),
        height: 2.3,
        depth: 1.4,
      });
      props.push({
        kind: 'pillar',
        x: center.x - roomWidth * 0.24,
        y: baseY + 1.7,
        z: center.z + roomDepth * 0.18,
        width: 1,
        height: 3.4,
        depth: 1,
      });
      break;
  }

  return props;
}

function generateHallProps(layout: InteriorLayout, cells: InteriorCell[][], config: GameConfig): InteriorPropInstance[] {
  const props: InteriorPropInstance[] = [];
  let stairCount = 0;
  let stairFallback:
    | { x: number; z: number; axis: 'x' | 'z'; score: number }
    | null = null;

  for (let z = 0; z < layout.gridSize; z += 1) {
    for (let x = 0; x < layout.gridSize; x += 1) {
      const cell = cells[z]?.[x];

      if (!cell?.walkable || cell.kind === 'room') {
        continue;
      }

      const placementChance = hash(config.seed, layout.coord.x * 19 + x, layout.coord.z * 23 + z, 8.7);
      const straightAxis = isStraightHallCell(cells, x, z);

      if (straightAxis) {
        const stairScore = hash(config.seed, layout.coord.x * 13 + x, layout.coord.z * 17 + z, 42.4);

        if (!stairFallback || stairScore > stairFallback.score) {
          stairFallback = { x, z, axis: straightAxis, score: stairScore };
        }
      }

      if (
        straightAxis &&
        stairCount < PROP_RULES.maxStairsPerChunk &&
        placementChance > PROP_RULES.stairChanceThreshold
      ) {
        const position = worldPositionForCell(layout, x, z);
        props.push({
          kind: 'stairRun',
          x: straightAxis === 'x' ? position.x : position.x + 1.9,
          y: layout.floorHeight,
          z: straightAxis === 'z' ? position.z : position.z + 1.9,
          width: straightAxis === 'x' ? 5.6 : 2.2,
          height: 2.9,
          depth: straightAxis === 'z' ? 5.6 : 2.2,
          orientation: straightAxis,
        });
        stairCount += 1;
        continue;
      }

      if (cell.kind === 'junction' && placementChance > PROP_RULES.junctionPillarThreshold) {
        const position = worldPositionForCell(layout, x, z);
        props.push({
          kind: 'pillar',
          x: position.x + (placementChance > PROP_RULES.junctionSideOffsetThreshold ? -1.8 : 1.8),
          y: layout.floorHeight + 1.75,
          z: position.z + (placementChance > PROP_RULES.junctionDepthOffsetThreshold ? -1.2 : 1.2),
          width: 0.9,
          height: 3.5,
          depth: 0.9,
        });
      } else if (placementChance > PROP_RULES.consoleThreshold) {
        const position = worldPositionForCell(layout, x, z);
        props.push({
          kind: 'console',
          x: position.x,
          y: layout.floorHeight + 0.95,
          z: position.z,
          width: 2.6,
          height: 1.9,
          depth: 1,
        });
      }
    }
  }

  if (stairCount === 0 && stairFallback) {
    const position = worldPositionForCell(layout, stairFallback.x, stairFallback.z);
    props.push({
      kind: 'stairRun',
      x: stairFallback.axis === 'x' ? position.x : position.x + 1.9,
      y: layout.floorHeight,
      z: stairFallback.axis === 'z' ? position.z : position.z + 1.9,
      width: stairFallback.axis === 'x' ? 5.6 : 2.2,
      height: 2.9,
      depth: stairFallback.axis === 'z' ? 5.6 : 2.2,
      orientation: stairFallback.axis,
    });
  }

  return props;
}

export function generateInteriorLayoutForChunk(
  coord: ChunkCoord,
  config: GameConfig,
): InteriorLayout {
  const cells = createEmptyCells();
  const roomMask = createMask();
  const roomTypeMask = Array.from({ length: INTERIOR_GRID_SIZE }, () =>
    Array.from<InteriorRoomType | undefined>({ length: INTERIOR_GRID_SIZE }).fill(undefined),
  );
  const roomIdMask = Array.from({ length: INTERIOR_GRID_SIZE }, () =>
    Array.from<number | undefined>({ length: INTERIOR_GRID_SIZE }).fill(undefined),
  );
  const edgeOpenings = {
    north: getEdgeOpenings(coord, 'north', config),
    east: getEdgeOpenings(coord, 'east', config),
    south: getEdgeOpenings(coord, 'south', config),
    west: getEdgeOpenings(coord, 'west', config),
  };
  const hub = {
    x: HUB_RULES.minInset + Math.floor(hash(config.seed, coord.x, coord.z, 1.7) * HUB_RULES.range),
    z: HUB_RULES.minInset + Math.floor(hash(config.seed, coord.x, coord.z, 3.9) * HUB_RULES.range),
  };
  const spineAxis = hash(config.seed, coord.x, coord.z, 4.7) > SPINE_RULES.axisThreshold ? 'x' : 'z';
  const rooms: InteriorRoom[] = [];
  const floorHeight = getFloorHeight(config);
  const origin = chunkOrigin(coord, config.chunkSize);

  setWalkable(cells, hub.x, hub.z, roomMask, roomTypeMask, roomIdMask);

  if (spineAxis === 'x') {
    const row = hub.z;
    const westPortal = getPortalCell('west', edgeOpenings.west[0] ?? row);
    const eastPortal = getPortalCell('east', edgeOpenings.east[0] ?? row);
    carvePath(cells, roomMask, roomTypeMask, roomIdMask, westPortal, { x: hub.x, z: row }, config, 5.2);
    carvePath(cells, roomMask, roomTypeMask, roomIdMask, { x: hub.x, z: row }, eastPortal, config, 6.4);
  } else {
    const column = hub.x;
    const northPortal = getPortalCell('north', edgeOpenings.north[0] ?? column);
    const southPortal = getPortalCell('south', edgeOpenings.south[0] ?? column);
    carvePath(cells, roomMask, roomTypeMask, roomIdMask, northPortal, { x: column, z: hub.z }, config, 5.2);
    carvePath(cells, roomMask, roomTypeMask, roomIdMask, { x: column, z: hub.z }, southPortal, config, 6.4);
  }

  for (const side of EDGE_ORDER) {
    for (const opening of edgeOpenings[side]) {
      carvePath(
        cells,
        roomMask,
        roomTypeMask,
        roomIdMask,
        getPortalCell(side, opening),
        hub,
        config,
        opening + EDGE_ORDER.indexOf(side) * 11.3,
      );
    }
  }

  const roomTarget = ROOM_RULES.targetBase + Math.floor(hash(config.seed, coord.x, coord.z, 5.7) * ROOM_RULES.targetRange);
  for (let attempt = 0; attempt < ROOM_RULES.maxPlacementAttempts && rooms.length < roomTarget; attempt += 1) {
    const widthRoll = hash(config.seed, coord.x + attempt, coord.z, 7.1);
    const depthRoll = hash(config.seed, coord.x, coord.z + attempt, 9.3);
    const width =
      widthRoll > ROOM_RULES.sizeThresholds.large
        ? ROOM_RULES.dimensions.large
        : widthRoll > ROOM_RULES.sizeThresholds.medium
          ? ROOM_RULES.dimensions.medium
          : ROOM_RULES.dimensions.small;
    const depth =
      depthRoll > ROOM_RULES.sizeThresholds.large
        ? ROOM_RULES.dimensions.large
        : depthRoll > ROOM_RULES.sizeThresholds.medium
          ? ROOM_RULES.dimensions.medium
          : ROOM_RULES.dimensions.small;
    const x =
      1 + Math.floor(hash(config.seed, coord.x * 7 + attempt, coord.z * 3, 11.2) * (INTERIOR_GRID_SIZE - width - 1));
    const z =
      1 + Math.floor(hash(config.seed, coord.x * 5, coord.z * 11 + attempt, 13.8) * (INTERIOR_GRID_SIZE - depth - 1));

    if (roomOverlaps(roomMask, x, z, width, depth)) {
      continue;
    }

    const typeIndex = Math.floor(hash(config.seed, coord.x, coord.z, 15.4 + attempt) * ROOM_TYPES.length);
    const type = ROOM_TYPES[typeIndex] ?? ROOM_TYPES[0];
    const roomId = rooms.length;
    const room: InteriorRoom = { id: roomId, x, z, width, depth, type };
    const target = {
      x: x + Math.floor(width * 0.5),
      z: z + Math.floor(depth * 0.5),
    };
    const anchor = findNearestWalkable(cells, roomMask, target, false);

    if (!anchor) {
      continue;
    }

    room.doorway = findRoomDoorway(room, anchor);
    markRoom(cells, roomMask, roomTypeMask, roomIdMask, room);
    rooms.push(room);
    carvePath(
      cells,
      roomMask,
      roomTypeMask,
      roomIdMask,
      { x: room.doorway.x, z: room.doorway.z },
      anchor,
      config,
      21.5 + attempt * 3.1,
    );
  }

  const branchTarget =
    CORRIDOR_RULES.branchBase + Math.floor(hash(config.seed, coord.x, coord.z, 17.9) * CORRIDOR_RULES.branchRange);
  for (let branch = 0; branch < branchTarget; branch += 1) {
    const start = {
      x: Math.floor(hash(config.seed, coord.x + branch, coord.z, 19.1) * INTERIOR_GRID_SIZE),
      z: Math.floor(hash(config.seed, coord.x, coord.z + branch, 21.7) * INTERIOR_GRID_SIZE),
    };
    const anchor = findNearestWalkable(cells, roomMask, start, false);

    if (!anchor) {
      continue;
    }

    carvePath(cells, roomMask, roomTypeMask, roomIdMask, start, anchor, config, 27.4 + branch * 5.2);
  }

  const loopTarget = Math.floor(hash(config.seed, coord.x, coord.z, 23.6) * CORRIDOR_RULES.loopRange);
  for (let loop = 0; loop < loopTarget; loop += 1) {
    const first = {
      x: Math.floor(hash(config.seed, coord.x + loop * 2, coord.z, 25.4) * INTERIOR_GRID_SIZE),
      z: Math.floor(hash(config.seed, coord.x, coord.z + loop * 3, 27.2) * INTERIOR_GRID_SIZE),
    };
    const second = {
      x: Math.floor(hash(config.seed, coord.x - loop * 3, coord.z + 1, 29.1) * INTERIOR_GRID_SIZE),
      z: Math.floor(hash(config.seed, coord.x + 1, coord.z - loop * 2, 31.4) * INTERIOR_GRID_SIZE),
    };
    const firstAnchor = findNearestWalkable(cells, roomMask, first, false);
    const secondAnchor = findNearestWalkable(cells, roomMask, second, false);

    if (!firstAnchor || !secondAnchor) {
      continue;
    }

    if (
      Math.abs(firstAnchor.x - secondAnchor.x) + Math.abs(firstAnchor.z - secondAnchor.z) <
      CORRIDOR_RULES.minLoopDistance
    ) {
      continue;
    }

    carvePath(cells, roomMask, roomTypeMask, roomIdMask, firstAnchor, secondAnchor, config, 33.8 + loop * 4.9);
  }

  finalizeCellKinds(cells, roomMask, roomTypeMask, roomIdMask);

  const layout: InteriorLayout = {
    coord,
    origin,
    gridSize: INTERIOR_GRID_SIZE,
    cellSize: INTERIOR_CELL_SIZE,
    floorHeight,
    hub,
    edgeOpenings,
    cells,
    rooms,
    props: [],
  };

  layout.props = [
    ...rooms.flatMap((room) => generateRoomProps(layout, room)),
    ...generateHallProps(layout, cells, config),
  ];

  return layout;
}

export function generateInteriorPropsForChunk(
  coord: ChunkCoord,
  config: GameConfig,
): InteriorPropInstance[] {
  return generateInteriorLayoutForChunk(coord, config).props;
}

export function sampleInteriorHeight(_x: number, _z: number, config: GameConfig): number {
  return getFloorHeight(config);
}

export function sampleInteriorCell(
  x: number,
  z: number,
  config: GameConfig,
): InteriorCell | null {
  const coord = worldToChunkCoord(x, z, config.chunkSize);
  const layout = generateInteriorLayoutForChunk(coord, config);
  const localX = x - layout.origin.x;
  const localZ = z - layout.origin.z;
  const cellX = Math.min(layout.gridSize - 1, Math.max(0, Math.floor(localX / layout.cellSize)));
  const cellZ = Math.min(layout.gridSize - 1, Math.max(0, Math.floor(localZ / layout.cellSize)));

  return layout.cells[cellZ]?.[cellX] ?? null;
}

export function isInteriorWalkable(
  x: number,
  z: number,
  config: GameConfig,
): boolean {
  return sampleInteriorCell(x, z, config)?.walkable ?? false;
}

export function getInteriorSpawnPoint(config: GameConfig): { x: number; z: number } {
  const layout = generateInteriorLayoutForChunk({ x: 0, z: 0 }, config);
  return worldPositionForCell(layout, layout.hub.x, layout.hub.z);
}

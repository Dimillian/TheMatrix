import * as THREE from 'three';
import type { ChunkCoord, ChunkData, GameConfig, TreeInstanceData, WorldMode } from '../types.ts';
import { chunkKey, chunkOrigin, enumerateChunkRing, worldToChunkCoord } from './chunks.ts';
import {
  generateInteriorLayoutForChunk,
  getInteriorSpawnPoint,
  type InteriorCell,
  type InteriorEdge,
  type InteriorLayout,
  type InteriorPropInstance,
  sampleInteriorHeight,
} from './interior.ts';
import { sampleTerrainHeight } from './terrain.ts';
import { generateTreesForChunk } from './trees.ts';

const INTERIOR_CEILING_CLEARANCE = 8.8;
const INTERIOR_CEILING_PANEL_HEIGHT = 0.8;
const INTERIOR_CEILING_STRIP_HEIGHT = 0.14;
const INTERIOR_CEILING_STRIP_GAP = 0.16;
const INTERIOR_FLOOR_THICKNESS = 1.2;
const INTERIOR_WALL_THICKNESS = 1.1;
const INTERIOR_TRIM_THICKNESS = 0.3;
const INTERIOR_PLAYER_RADIUS = 1.35;
const INTERIOR_DOOR_CLEAR_WIDTH = 4.8;
const INTERIOR_DOOR_CLEAR_HEIGHT = 7.2;

export class WorldManager {
  private readonly scene: THREE.Scene;
  private readonly config: GameConfig;
  private readonly chunks = new Map<string, ChunkData>();
  private readonly interiorLayoutCache = new Map<string, InteriorLayout>();
  private readonly queuedKeys = new Set<string>();
  private readonly generationQueue: ChunkCoord[] = [];

  private readonly terrainMaterial = new THREE.MeshStandardMaterial({
    color: 0x79ff93,
    emissive: 0x0f2f16,
    flatShading: false,
    roughness: 0.92,
    metalness: 0,
    vertexColors: true,
  });

  private readonly terrainLineMaterial = new THREE.LineBasicMaterial({
    color: 0x7cff97,
    transparent: true,
    opacity: 0.34,
  });

  private readonly trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x4dff86,
    emissive: 0x0b2312,
    roughness: 1,
    metalness: 0,
  });

  private readonly canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0x9cffb0,
    emissive: 0x12381c,
    roughness: 0.9,
    metalness: 0,
  });

  private readonly interiorFloorMaterial = new THREE.MeshStandardMaterial({
    color: 0x5ced86,
    emissive: 0x0b1f11,
    roughness: 0.94,
    metalness: 0.02,
  });

  private readonly interiorWallMaterial = new THREE.MeshStandardMaterial({
    color: 0x7cffac,
    emissive: 0x11271a,
    roughness: 0.88,
    metalness: 0.04,
  });

  private readonly interiorAccentMaterial = new THREE.MeshStandardMaterial({
    color: 0xa6ffca,
    emissive: 0x173325,
    roughness: 0.78,
    metalness: 0.08,
  });

  private readonly interiorFurnitureMaterial = new THREE.MeshStandardMaterial({
    color: 0x83ffb1,
    emissive: 0x102519,
    roughness: 0.9,
    metalness: 0.06,
  });

  private readonly trunkGeometry = new THREE.CylinderGeometry(0.35, 0.45, 1, 6);
  private readonly canopyGeometry = new THREE.ConeGeometry(1, 1, 6);
  private readonly unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);

  constructor(scene: THREE.Scene, config: GameConfig) {
    this.scene = scene;
    this.config = config;
  }

  update(playerPosition: THREE.Vector3, frame: number): void {
    const playerChunk = worldToChunkCoord(playerPosition.x, playerPosition.z, this.config.chunkSize);
    const desiredCoords = enumerateChunkRing(playerChunk, this.config.activeRadius);
    const desiredKeys = new Set<string>();

    for (const coord of desiredCoords) {
      const key = chunkKey(coord);
      desiredKeys.add(key);
      const existing = this.chunks.get(key);

      if (existing) {
        existing.lastTouchedFrame = frame;
        continue;
      }

      if (!this.queuedKeys.has(key)) {
        this.generationQueue.push(coord);
        this.queuedKeys.add(key);
      }
    }

    let builds = 0;
    while (builds < this.config.maxChunkBuildsPerFrame && this.generationQueue.length > 0) {
      const coord = this.generationQueue.shift();

      if (!coord) {
        break;
      }

      const key = chunkKey(coord);
      this.queuedKeys.delete(key);

      if (this.chunks.has(key) || !desiredKeys.has(key)) {
        continue;
      }

      const chunk = this.buildChunk(coord, frame);
      this.chunks.set(key, chunk);
      this.scene.add(chunk.group);
      builds += 1;
    }

    for (const [key, chunk] of this.chunks) {
      const dx = Math.abs(chunk.coord.x - playerChunk.x);
      const dz = Math.abs(chunk.coord.z - playerChunk.z);

      if (dx <= this.config.unloadRadius && dz <= this.config.unloadRadius) {
        continue;
      }

      this.disposeChunk(chunk);
      this.scene.remove(chunk.group);
      this.chunks.delete(key);
    }

    for (const [key, layout] of this.interiorLayoutCache) {
      const dx = Math.abs(layout.coord.x - playerChunk.x);
      const dz = Math.abs(layout.coord.z - playerChunk.z);

      if (dx > this.config.unloadRadius + 1 || dz > this.config.unloadRadius + 1) {
        this.interiorLayoutCache.delete(key);
      }
    }
  }

  setWorldMode(mode: WorldMode): void {
    if (this.config.worldMode === mode) {
      return;
    }

    this.config.worldMode = mode;
    this.clearWorld();
  }

  getSpawnPoint(): { x: number; z: number } {
    if (this.config.worldMode === 'interior') {
      return getInteriorSpawnPoint(this.config);
    }

    return {
      x: this.config.spawnX,
      z: this.config.spawnZ,
    };
  }

  getHeightAt(x: number, z: number): number {
    if (this.config.worldMode === 'interior') {
      return sampleInteriorHeight(x, z, this.config);
    }

    return sampleTerrainHeight(x, z, this.config);
  }

  canOccupy(x: number, z: number): boolean {
    if (this.config.worldMode !== 'interior') {
      return true;
    }

    const samples = [
      [0, 0],
      [INTERIOR_PLAYER_RADIUS, 0],
      [-INTERIOR_PLAYER_RADIUS, 0],
      [0, INTERIOR_PLAYER_RADIUS],
      [0, -INTERIOR_PLAYER_RADIUS],
      [INTERIOR_PLAYER_RADIUS * 0.72, INTERIOR_PLAYER_RADIUS * 0.72],
      [INTERIOR_PLAYER_RADIUS * 0.72, -INTERIOR_PLAYER_RADIUS * 0.72],
      [-INTERIOR_PLAYER_RADIUS * 0.72, INTERIOR_PLAYER_RADIUS * 0.72],
      [-INTERIOR_PLAYER_RADIUS * 0.72, -INTERIOR_PLAYER_RADIUS * 0.72],
    ];

    return samples.every(([offsetX, offsetZ]) => {
      const cell = this.getInteriorCellAt(x + offsetX, z + offsetZ);
      return cell?.walkable ?? false;
    });
  }

  getDebugStats(): { activeChunks: number; queuedChunks: number } {
    return {
      activeChunks: this.chunks.size,
      queuedChunks: this.generationQueue.length,
    };
  }

  dispose(): void {
    this.clearWorld();
    this.terrainMaterial.dispose();
    this.trunkMaterial.dispose();
    this.canopyMaterial.dispose();
    this.terrainLineMaterial.dispose();
    this.interiorFloorMaterial.dispose();
    this.interiorWallMaterial.dispose();
    this.interiorAccentMaterial.dispose();
    this.interiorFurnitureMaterial.dispose();
    this.trunkGeometry.dispose();
    this.canopyGeometry.dispose();
    this.unitBoxGeometry.dispose();
  }

  private clearWorld(): void {
    for (const chunk of this.chunks.values()) {
      this.disposeChunk(chunk);
      this.scene.remove(chunk.group);
    }

    this.chunks.clear();
    this.interiorLayoutCache.clear();
    this.queuedKeys.clear();
    this.generationQueue.length = 0;
  }

  private buildChunk(coord: ChunkCoord, frame: number): ChunkData {
    return this.config.worldMode === 'interior'
      ? this.buildInteriorChunk(coord, frame)
      : this.buildTerrainChunk(coord, frame);
  }

  private buildTerrainChunk(coord: ChunkCoord, frame: number): ChunkData {
    const group = new THREE.Group();
    group.name = `chunk:${this.config.worldMode}:${chunkKey(coord)}`;

    const terrainMesh = this.createTerrainMesh(coord);
    group.add(terrainMesh);
    group.add(this.createTerrainWireframe(terrainMesh.geometry));

    const trees = generateTreesForChunk(coord, this.config);
    const treeMeshes = this.createTreeMeshes(trees);

    for (const mesh of treeMeshes) {
      group.add(mesh);
    }

    const bounds = new THREE.Box3().setFromObject(group);

    return {
      coord,
      key: chunkKey(coord),
      group,
      bounds,
      lastTouchedFrame: frame,
    };
  }

  private buildInteriorChunk(coord: ChunkCoord, frame: number): ChunkData {
    const group = new THREE.Group();
    group.name = `chunk:${this.config.worldMode}:${chunkKey(coord)}`;
    const layout = this.getInteriorLayout(coord);

    for (let z = 0; z < layout.gridSize; z += 1) {
      for (let x = 0; x < layout.gridSize; x += 1) {
        const cell = layout.cells[z]?.[x];

        if (!cell?.walkable) {
          continue;
        }

        const worldX = layout.origin.x + (x + 0.5) * layout.cellSize;
        const worldZ = layout.origin.z + (z + 0.5) * layout.cellSize;
        const ceilingY = layout.floorHeight + INTERIOR_CEILING_CLEARANCE;

        group.add(
          this.createBox(
            layout.cellSize + 0.08,
            INTERIOR_FLOOR_THICKNESS,
            layout.cellSize + 0.08,
            worldX,
            layout.floorHeight - INTERIOR_FLOOR_THICKNESS * 0.5,
            worldZ,
            this.interiorFloorMaterial,
          ),
        );
        group.add(
          this.createBox(
            layout.cellSize - 0.16,
            INTERIOR_CEILING_PANEL_HEIGHT,
            layout.cellSize - 0.16,
            worldX,
            ceilingY,
            worldZ,
            this.interiorWallMaterial,
          ),
        );

        if (cell.kind === 'room') {
          group.add(
            this.createBox(
              layout.cellSize - 1.2,
              INTERIOR_TRIM_THICKNESS,
              layout.cellSize - 1.2,
              worldX,
              layout.floorHeight + 0.05,
              worldZ,
              this.interiorAccentMaterial,
            ),
          );
        } else {
          const ceilingBottomY = ceilingY - INTERIOR_CEILING_PANEL_HEIGHT * 0.5;
          const stripCenterY =
            ceilingBottomY -
            INTERIOR_CEILING_STRIP_GAP -
            INTERIOR_CEILING_STRIP_HEIGHT * 0.5;

          group.add(
            this.createBox(
              layout.cellSize * 0.62,
              INTERIOR_CEILING_STRIP_HEIGHT,
              0.5,
              worldX,
              stripCenterY,
              worldZ,
              this.interiorAccentMaterial,
            ),
          );
        }

        for (const side of ['north', 'east', 'south', 'west'] as const) {
          if (!this.hasInteriorOpening(layout, x, z, side)) {
            group.add(this.createInteriorWallSegment(layout, worldX, worldZ, side));
          }
        }

        for (const side of ['east', 'south'] as const) {
          if (this.shouldPlaceDoorFrame(layout, x, z, side)) {
            this.addInteriorDoorFrame(group, layout, worldX, worldZ, side);
          }
        }
      }
    }

    for (const prop of layout.props) {
      this.addInteriorProp(group, prop);
    }

    const bounds = new THREE.Box3().setFromObject(group);

    return {
      coord,
      key: chunkKey(coord),
      group,
      bounds,
      lastTouchedFrame: frame,
    };
  }

  private getInteriorLayout(coord: ChunkCoord): InteriorLayout {
    const key = chunkKey(coord);
    const cached = this.interiorLayoutCache.get(key);

    if (cached) {
      return cached;
    }

    const layout = generateInteriorLayoutForChunk(coord, this.config);
    this.interiorLayoutCache.set(key, layout);
    return layout;
  }

  private getInteriorCellAt(x: number, z: number): InteriorCell | null {
    const coord = worldToChunkCoord(x, z, this.config.chunkSize);
    const layout = this.getInteriorLayout(coord);
    const localX = x - layout.origin.x;
    const localZ = z - layout.origin.z;
    const cellX = Math.min(layout.gridSize - 1, Math.max(0, Math.floor(localX / layout.cellSize)));
    const cellZ = Math.min(layout.gridSize - 1, Math.max(0, Math.floor(localZ / layout.cellSize)));

    return layout.cells[cellZ]?.[cellX] ?? null;
  }

  private hasInteriorOpening(
    layout: InteriorLayout,
    x: number,
    z: number,
    side: InteriorEdge,
  ): boolean {
    switch (side) {
      case 'north':
        return z === 0 ? layout.edgeOpenings.north.includes(x) : Boolean(layout.cells[z - 1]?.[x]?.walkable);
      case 'south':
        return z === layout.gridSize - 1
          ? layout.edgeOpenings.south.includes(x)
          : Boolean(layout.cells[z + 1]?.[x]?.walkable);
      case 'west':
        return x === 0 ? layout.edgeOpenings.west.includes(z) : Boolean(layout.cells[z]?.[x - 1]?.walkable);
      case 'east':
        return x === layout.gridSize - 1
          ? layout.edgeOpenings.east.includes(z)
          : Boolean(layout.cells[z]?.[x + 1]?.walkable);
    }
  }

  private getInteriorNeighbor(
    layout: InteriorLayout,
    x: number,
    z: number,
    side: InteriorEdge,
  ): InteriorCell | null {
    switch (side) {
      case 'north':
        return z > 0 ? layout.cells[z - 1]?.[x] ?? null : null;
      case 'south':
        return z < layout.gridSize - 1 ? layout.cells[z + 1]?.[x] ?? null : null;
      case 'west':
        return x > 0 ? layout.cells[z]?.[x - 1] ?? null : null;
      case 'east':
        return x < layout.gridSize - 1 ? layout.cells[z]?.[x + 1] ?? null : null;
    }
  }

  private createInteriorWallSegment(
    layout: InteriorLayout,
    worldX: number,
    worldZ: number,
    side: InteriorEdge,
  ): THREE.Mesh {
    const wallHeight = INTERIOR_CEILING_CLEARANCE + 0.9;
    const centerY = layout.floorHeight + wallHeight * 0.5;
    const halfCell = layout.cellSize * 0.5;

    switch (side) {
      case 'north':
        return this.createBox(
          layout.cellSize,
          wallHeight,
          INTERIOR_WALL_THICKNESS,
          worldX,
          centerY,
          worldZ - halfCell + INTERIOR_WALL_THICKNESS * 0.5,
          this.interiorWallMaterial,
        );
      case 'south':
        return this.createBox(
          layout.cellSize,
          wallHeight,
          INTERIOR_WALL_THICKNESS,
          worldX,
          centerY,
          worldZ + halfCell - INTERIOR_WALL_THICKNESS * 0.5,
          this.interiorWallMaterial,
        );
      case 'west':
        return this.createBox(
          INTERIOR_WALL_THICKNESS,
          wallHeight,
          layout.cellSize,
          worldX - halfCell + INTERIOR_WALL_THICKNESS * 0.5,
          centerY,
          worldZ,
          this.interiorWallMaterial,
        );
      case 'east':
        return this.createBox(
          INTERIOR_WALL_THICKNESS,
          wallHeight,
          layout.cellSize,
          worldX + halfCell - INTERIOR_WALL_THICKNESS * 0.5,
          centerY,
          worldZ,
          this.interiorWallMaterial,
        );
    }
  }

  private shouldPlaceDoorFrame(
    layout: InteriorLayout,
    x: number,
    z: number,
    side: 'east' | 'south',
  ): boolean {
    if (!this.hasInteriorOpening(layout, x, z, side)) {
      return false;
    }

    const cell = layout.cells[z]?.[x];
    const neighbor = this.getInteriorNeighbor(layout, x, z, side);

    if (!cell || !neighbor?.walkable) {
      return false;
    }

    if (cell.kind !== 'room' && neighbor.kind !== 'room') {
      return false;
    }

    if (cell.kind === 'room' && cell.roomId !== undefined) {
      const room = layout.rooms[cell.roomId];
      return room?.doorway?.x === x && room.doorway?.z === z && room.doorway?.side === side;
    }

    if (neighbor.kind === 'room' && neighbor.roomId !== undefined) {
      const room = layout.rooms[neighbor.roomId];
      const oppositeSide = side === 'east' ? 'west' : 'north';
      return room?.doorway?.x === neighbor.x && room.doorway?.z === neighbor.z && room.doorway?.side === oppositeSide;
    }

    return false;
  }

  private addInteriorDoorFrame(
    group: THREE.Group,
    layout: InteriorLayout,
    worldX: number,
    worldZ: number,
    side: 'east' | 'south',
  ): void {
    const halfCell = layout.cellSize * 0.5;
    const wallHeight = INTERIOR_CEILING_CLEARANCE + 0.9;
    const jambHeight = INTERIOR_DOOR_CLEAR_HEIGHT;
    const jambY = layout.floorHeight + jambHeight * 0.5;
    const lintelHeight = wallHeight - INTERIOR_DOOR_CLEAR_HEIGHT;
    const lintelY = layout.floorHeight + INTERIOR_DOOR_CLEAR_HEIGHT + lintelHeight * 0.5;
    const sideFillDepth = Math.max(0.2, (layout.cellSize - INTERIOR_DOOR_CLEAR_WIDTH) * 0.5);
    const trimThickness = INTERIOR_WALL_THICKNESS + 0.1;
    const doorThresholdY = layout.floorHeight + 0.08;

    if (side === 'east') {
      const frameX = worldX + halfCell - INTERIOR_WALL_THICKNESS * 0.5;
      group.add(
        this.createBox(trimThickness, wallHeight, sideFillDepth, frameX, layout.floorHeight + wallHeight * 0.5, worldZ - (INTERIOR_DOOR_CLEAR_WIDTH * 0.5 + sideFillDepth * 0.5), this.interiorWallMaterial),
      );
      group.add(
        this.createBox(trimThickness, wallHeight, sideFillDepth, frameX, layout.floorHeight + wallHeight * 0.5, worldZ + (INTERIOR_DOOR_CLEAR_WIDTH * 0.5 + sideFillDepth * 0.5), this.interiorWallMaterial),
      );
      group.add(
        this.createBox(trimThickness, lintelHeight, INTERIOR_DOOR_CLEAR_WIDTH, frameX, lintelY, worldZ, this.interiorWallMaterial),
      );
      group.add(
        this.createBox(0.26, jambHeight, 0.34, frameX, jambY, worldZ - INTERIOR_DOOR_CLEAR_WIDTH * 0.5, this.interiorAccentMaterial),
      );
      group.add(
        this.createBox(0.26, jambHeight, 0.34, frameX, jambY, worldZ + INTERIOR_DOOR_CLEAR_WIDTH * 0.5, this.interiorAccentMaterial),
      );
      group.add(
        this.createBox(0.26, 0.26, INTERIOR_DOOR_CLEAR_WIDTH, frameX, layout.floorHeight + INTERIOR_DOOR_CLEAR_HEIGHT, worldZ, this.interiorAccentMaterial),
      );
      group.add(
        this.createBox(0.22, 0.12, INTERIOR_DOOR_CLEAR_WIDTH - 0.28, frameX, doorThresholdY, worldZ, this.interiorAccentMaterial),
      );
      return;
    }

    const frameZ = worldZ + halfCell - INTERIOR_WALL_THICKNESS * 0.5;
    group.add(
      this.createBox(sideFillDepth, wallHeight, trimThickness, worldX - (INTERIOR_DOOR_CLEAR_WIDTH * 0.5 + sideFillDepth * 0.5), layout.floorHeight + wallHeight * 0.5, frameZ, this.interiorWallMaterial),
    );
    group.add(
      this.createBox(sideFillDepth, wallHeight, trimThickness, worldX + (INTERIOR_DOOR_CLEAR_WIDTH * 0.5 + sideFillDepth * 0.5), layout.floorHeight + wallHeight * 0.5, frameZ, this.interiorWallMaterial),
    );
    group.add(
      this.createBox(INTERIOR_DOOR_CLEAR_WIDTH, lintelHeight, trimThickness, worldX, lintelY, frameZ, this.interiorWallMaterial),
    );
    group.add(
      this.createBox(0.34, jambHeight, 0.26, worldX - INTERIOR_DOOR_CLEAR_WIDTH * 0.5, jambY, frameZ, this.interiorAccentMaterial),
    );
    group.add(
      this.createBox(0.34, jambHeight, 0.26, worldX + INTERIOR_DOOR_CLEAR_WIDTH * 0.5, jambY, frameZ, this.interiorAccentMaterial),
    );
    group.add(
      this.createBox(INTERIOR_DOOR_CLEAR_WIDTH, 0.26, 0.26, worldX, layout.floorHeight + INTERIOR_DOOR_CLEAR_HEIGHT, frameZ, this.interiorAccentMaterial),
    );
    group.add(
      this.createBox(INTERIOR_DOOR_CLEAR_WIDTH - 0.28, 0.12, 0.22, worldX, doorThresholdY, frameZ, this.interiorAccentMaterial),
    );
  }

  private addInteriorProp(group: THREE.Group, prop: InteriorPropInstance): void {
    if (prop.kind === 'stairRun') {
      this.addInteriorStairProp(group, prop);
      return;
    }

    group.add(
      this.createBox(
        prop.width,
        prop.height,
        prop.depth,
        prop.x,
        prop.y,
        prop.z,
        this.interiorFurnitureMaterial,
      ),
    );

    switch (prop.kind) {
      case 'crateStack':
        group.add(
          this.createBox(
            Math.max(0.8, prop.width * 0.65),
            0.28,
            Math.max(0.8, prop.depth * 0.65),
            prop.x,
            prop.y + prop.height * 0.36,
            prop.z,
            this.interiorAccentMaterial,
          ),
        );
        break;
      case 'serverRack':
        for (let stripe = -1; stripe <= 1; stripe += 1) {
          group.add(
            this.createBox(
              Math.max(0.18, prop.width * 0.18),
              prop.height * 0.74,
              0.16,
              prop.x,
              prop.y,
              prop.z + stripe * Math.min(0.7, prop.depth * 0.18),
              this.interiorAccentMaterial,
            ),
          );
        }
        break;
      case 'console':
        group.add(
          this.createBox(
            Math.max(0.9, prop.width * 0.78),
            0.24,
            Math.max(0.45, prop.depth * 0.72),
            prop.x,
            prop.y + prop.height * 0.32,
            prop.z,
            this.interiorAccentMaterial,
          ),
        );
        break;
      case 'bench':
        group.add(
          this.createBox(
            prop.width,
            0.2,
            prop.depth,
            prop.x,
            prop.y + prop.height * 0.12,
            prop.z,
            this.interiorAccentMaterial,
          ),
        );
        break;
      case 'pillar':
        group.add(
          this.createBox(
            prop.width + 0.12,
            0.2,
            prop.depth + 0.12,
            prop.x,
            prop.y + prop.height * 0.5 - 0.1,
            prop.z,
            this.interiorAccentMaterial,
          ),
        );
        break;
    }
  }

  private addInteriorStairProp(group: THREE.Group, prop: InteriorPropInstance): void {
    const stepCount = 6;
    const axis = prop.orientation ?? (prop.depth > prop.width ? 'z' : 'x');
    const stepHeight = prop.height / stepCount;
    const totalRun = axis === 'x' ? prop.width : prop.depth;
    const treadDepth = totalRun / stepCount;
    const stairWidth = axis === 'x' ? prop.depth : prop.width;
    const baseX = prop.x;
    const baseZ = prop.z;

    for (let index = 0; index < stepCount; index += 1) {
      const height = stepHeight * (index + 1);

      if (axis === 'x') {
        const centerX = baseX - prop.width * 0.5 + treadDepth * (index + 0.5);
        group.add(
          this.createBox(
            treadDepth,
            height,
            stairWidth,
            centerX,
            prop.y + height * 0.5,
            baseZ,
            this.interiorFurnitureMaterial,
          ),
        );
      } else {
        const centerZ = baseZ - prop.depth * 0.5 + treadDepth * (index + 0.5);
        group.add(
          this.createBox(
            stairWidth,
            height,
            treadDepth,
            baseX,
            prop.y + height * 0.5,
            centerZ,
            this.interiorFurnitureMaterial,
          ),
        );
      }
    }

    if (axis === 'x') {
      group.add(
        this.createBox(prop.width, 0.12, 0.18, baseX, prop.y + prop.height + 0.04, baseZ - stairWidth * 0.5 + 0.12, this.interiorAccentMaterial),
      );
      group.add(
        this.createBox(prop.width, 0.12, 0.18, baseX, prop.y + prop.height + 0.04, baseZ + stairWidth * 0.5 - 0.12, this.interiorAccentMaterial),
      );
      return;
    }

    group.add(
      this.createBox(0.18, 0.12, prop.depth, baseX - stairWidth * 0.5 + 0.12, prop.y + prop.height + 0.04, baseZ, this.interiorAccentMaterial),
    );
    group.add(
      this.createBox(0.18, 0.12, prop.depth, baseX + stairWidth * 0.5 - 0.12, prop.y + prop.height + 0.04, baseZ, this.interiorAccentMaterial),
    );
  }

  private createTerrainMesh(coord: ChunkCoord): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(
      this.config.chunkSize,
      this.config.chunkSize,
      this.config.terrainResolution,
      this.config.terrainResolution,
    );
    geometry.rotateX(-Math.PI / 2);

    const origin = chunkOrigin(coord, this.config.chunkSize);
    const centerX = origin.x + this.config.chunkSize * 0.5;
    const centerZ = origin.z + this.config.chunkSize * 0.5;

    const positions = geometry.attributes.position.array as Float32Array;
    const colors = new Float32Array((positions.length / 3) * 3);

    for (let index = 0; index < positions.length; index += 3) {
      const localX = positions[index];
      const localZ = positions[index + 2];
      const worldX = centerX + localX;
      const worldZ = centerZ + localZ;
      const height = sampleTerrainHeight(worldX, worldZ, this.config);
      positions[index + 1] = height;

      const normalizedHeight = THREE.MathUtils.clamp(
        (height - (this.config.terrainBaseHeight - this.config.terrainHeight)) /
          (this.config.terrainHeight * 2.4),
        0,
        1,
      );
      colors[index] = 0.08 + normalizedHeight * 0.22;
      colors[index + 1] = 0.35 + normalizedHeight * 0.58;
      colors[index + 2] = 0.12 + normalizedHeight * 0.18;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, this.terrainMaterial);
    mesh.position.set(centerX, 0, centerZ);
    mesh.receiveShadow = false;
    return mesh;
  }

  private createTerrainWireframe(terrainGeometry: THREE.BufferGeometry): THREE.LineSegments {
    const wireframe = new THREE.WireframeGeometry(terrainGeometry);
    return new THREE.LineSegments(wireframe, this.terrainLineMaterial);
  }

  private createTreeMeshes(trees: TreeInstanceData[]): THREE.Object3D[] {
    if (trees.length === 0) {
      return [];
    }

    const trunks = new THREE.InstancedMesh(this.trunkGeometry, this.trunkMaterial, trees.length);
    const canopies = new THREE.InstancedMesh(this.canopyGeometry, this.canopyMaterial, trees.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();

    trees.forEach((tree, index) => {
      matrix.compose(
        new THREE.Vector3(tree.x, tree.y + tree.trunkHeight * 0.5, tree.z),
        quaternion,
        new THREE.Vector3(1, tree.trunkHeight, 1),
      );
      trunks.setMatrixAt(index, matrix);

      matrix.compose(
        new THREE.Vector3(tree.x, tree.y + tree.trunkHeight + tree.canopyHeight * 0.5, tree.z),
        quaternion,
        new THREE.Vector3(tree.canopyRadius, tree.canopyHeight, tree.canopyRadius),
      );
      canopies.setMatrixAt(index, matrix);
    });

    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    return [trunks, canopies];
  }

  private createBox(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(this.unitBoxGeometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    return mesh;
  }

  private disposeChunk(chunk: ChunkData): void {
    chunk.group.traverse((object) => {
      const renderObject = object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
      };

      if (!renderObject.geometry) {
        return;
      }

      if (
        renderObject.geometry === this.trunkGeometry ||
        renderObject.geometry === this.canopyGeometry ||
        renderObject.geometry === this.unitBoxGeometry
      ) {
        return;
      }

      renderObject.geometry.dispose();
    });
  }
}

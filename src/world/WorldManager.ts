import * as THREE from 'three';
import type { ChunkCoord, ChunkData, GameConfig, TreeInstanceData, WorldMode } from '../types.ts';
import { chunkKey, chunkOrigin, enumerateChunkRing, worldToChunkCoord } from './chunks.ts';
import {
  enumerateInteriorFloorSpans,
  generateInteriorPropsForChunk,
  sampleInteriorHeight,
} from './interior.ts';
import { sampleTerrainHeight } from './terrain.ts';
import { generateTreesForChunk } from './trees.ts';

const INTERIOR_CORRIDOR_WIDTH = 44;
const INTERIOR_CEILING_CLEARANCE = 8.8;
const INTERIOR_FLOOR_THICKNESS = 1.2;
const INTERIOR_WALL_THICKNESS = 1.1;
const INTERIOR_FRAME_SPACING = 12;

export class WorldManager {
  private readonly scene: THREE.Scene;
  private readonly config: GameConfig;
  private readonly chunks = new Map<string, ChunkData>();
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
      return {
        x: this.config.chunkSize * 0.5,
        z: 18,
      };
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

    const origin = chunkOrigin(coord, this.config.chunkSize);
    const centerX = origin.x + this.config.chunkSize * 0.5;
    const zStart = origin.z;
    const zEnd = origin.z + this.config.chunkSize;
    const floorSpans = enumerateInteriorFloorSpans(zStart, zEnd, this.config);
    const corridorLeft = centerX - INTERIOR_CORRIDOR_WIDTH * 0.5;
    const corridorRight = centerX + INTERIOR_CORRIDOR_WIDTH * 0.5;

    for (const span of floorSpans) {
      const spanCenterZ = (span.startZ + span.endZ) * 0.5;
      const spanDepth = Math.max(0.5, span.endZ - span.startZ);
      const ceilingY = span.height + INTERIOR_CEILING_CLEARANCE;

      group.add(
        this.createBox(
          INTERIOR_CORRIDOR_WIDTH + 8,
          INTERIOR_FLOOR_THICKNESS,
          spanDepth,
          centerX,
          span.height - INTERIOR_FLOOR_THICKNESS * 0.5,
          spanCenterZ,
          this.interiorFloorMaterial,
        ),
      );
      group.add(
        this.createBox(
          INTERIOR_CORRIDOR_WIDTH,
          0.9,
          spanDepth,
          centerX,
          ceilingY,
          spanCenterZ,
          this.interiorWallMaterial,
        ),
      );
      group.add(
        this.createBox(
          INTERIOR_WALL_THICKNESS,
          INTERIOR_CEILING_CLEARANCE + 0.9,
          spanDepth,
          corridorLeft,
          span.height + INTERIOR_CEILING_CLEARANCE * 0.5,
          spanCenterZ,
          this.interiorWallMaterial,
        ),
      );
      group.add(
        this.createBox(
          INTERIOR_WALL_THICKNESS,
          INTERIOR_CEILING_CLEARANCE + 0.9,
          spanDepth,
          corridorRight,
          span.height + INTERIOR_CEILING_CLEARANCE * 0.5,
          spanCenterZ,
          this.interiorWallMaterial,
        ),
      );
    }

    const frameStart = Math.ceil(zStart / INTERIOR_FRAME_SPACING) * INTERIOR_FRAME_SPACING;
    for (let frameZ = frameStart; frameZ < zEnd; frameZ += INTERIOR_FRAME_SPACING) {
      const floorHeight = sampleInteriorHeight(centerX, frameZ, this.config);
      const ceilingY = floorHeight + INTERIOR_CEILING_CLEARANCE;

      group.add(
        this.createBox(
          0.7,
          INTERIOR_CEILING_CLEARANCE,
          0.75,
          corridorLeft + 0.8,
          floorHeight + INTERIOR_CEILING_CLEARANCE * 0.5 - 0.05,
          frameZ,
          this.interiorAccentMaterial,
        ),
      );
      group.add(
        this.createBox(
          0.7,
          INTERIOR_CEILING_CLEARANCE,
          0.75,
          corridorRight - 0.8,
          floorHeight + INTERIOR_CEILING_CLEARANCE * 0.5 - 0.05,
          frameZ,
          this.interiorAccentMaterial,
        ),
      );
      group.add(
        this.createBox(
          INTERIOR_CORRIDOR_WIDTH - 1.6,
          0.55,
          0.75,
          centerX,
          ceilingY - 0.45,
          frameZ,
          this.interiorAccentMaterial,
        ),
      );
    }

    const props = generateInteriorPropsForChunk(coord, this.config);
    for (const prop of props) {
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
      group.add(
        this.createBox(
          Math.max(0.5, prop.width * 0.45),
          0.22,
          Math.max(0.45, prop.depth * 0.8),
          prop.x,
          prop.y + prop.height * 0.28,
          prop.z,
          this.interiorAccentMaterial,
        ),
      );
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

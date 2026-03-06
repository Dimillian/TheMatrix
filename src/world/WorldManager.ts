import * as THREE from 'three';
import type { ChunkCoord, ChunkData, GameConfig, TreeInstanceData } from '../types.ts';
import { chunkKey, chunkOrigin, enumerateChunkRing, worldToChunkCoord } from './chunks.ts';
import { sampleTerrainHeight } from './terrain.ts';
import { generateTreesForChunk } from './trees.ts';

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

  private readonly trunkGeometry = new THREE.CylinderGeometry(0.35, 0.45, 1, 6);
  private readonly canopyGeometry = new THREE.ConeGeometry(1, 1, 6);

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

  getHeightAt(x: number, z: number): number {
    return sampleTerrainHeight(x, z, this.config);
  }

  getDebugStats(): { activeChunks: number; queuedChunks: number } {
    return {
      activeChunks: this.chunks.size,
      queuedChunks: this.generationQueue.length,
    };
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) {
      this.disposeChunk(chunk);
      this.scene.remove(chunk.group);
    }

    this.chunks.clear();
    this.terrainMaterial.dispose();
    this.trunkMaterial.dispose();
    this.canopyMaterial.dispose();
    this.terrainLineMaterial.dispose();
    this.trunkGeometry.dispose();
    this.canopyGeometry.dispose();
  }

  private buildChunk(coord: ChunkCoord, frame: number): ChunkData {
    const group = new THREE.Group();
    group.name = `chunk:${chunkKey(coord)}`;

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
      terrainMesh,
      treeInstances: trees,
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
      const colorIndex = index;
      colors[colorIndex] = 0.08 + normalizedHeight * 0.22;
      colors[colorIndex + 1] = 0.35 + normalizedHeight * 0.58;
      colors[colorIndex + 2] = 0.12 + normalizedHeight * 0.18;
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

  private disposeChunk(chunk: ChunkData): void {
    chunk.group.traverse((object) => {
      const renderObject = object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
      };

      if (!renderObject.geometry) {
        return;
      }

      if (renderObject.geometry === this.trunkGeometry || renderObject.geometry === this.canopyGeometry) {
        return;
      }

      renderObject.geometry.dispose();
    });
  }
}

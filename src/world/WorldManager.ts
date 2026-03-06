import * as THREE from 'three';
import type { ChunkCoord, ChunkData, GameConfig, PropInstanceData, TerrainBiomeId, TerrainSample } from '../types.ts';
import { chunkKey, chunkOrigin, enumerateChunkRing, worldToChunkCoord } from './chunks.ts';
import { generatePropsForChunk } from './props.ts';
import { sampleTerrain, sampleTerrainHeight } from './terrain.ts';

const BIOME_BASE_COLORS: Record<TerrainBiomeId, [number, number, number]> = {
  wetlands: [0.06, 0.24, 0.1],
  plains: [0.11, 0.36, 0.12],
  forest: [0.08, 0.3, 0.1],
  rocky_highlands: [0.14, 0.42, 0.16],
  barren_ridge: [0.2, 0.52, 0.22],
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export class WorldManager {
  private readonly scene: THREE.Scene;
  private readonly config: GameConfig;
  private readonly chunks = new Map<string, ChunkData>();
  private readonly queuedKeys = new Set<string>();
  private readonly generationQueue: ChunkCoord[] = [];

  private readonly terrainMaterial = new THREE.MeshStandardMaterial({
    color: 0x8cff9e,
    emissive: 0x102915,
    flatShading: false,
    roughness: 0.9,
    metalness: 0,
    vertexColors: true,
  });

  private readonly terrainLineMaterial = new THREE.LineBasicMaterial({
    color: 0xa7ffb6,
    transparent: true,
    opacity: 0.28,
  });

  private readonly trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x56f289,
    emissive: 0x0b2312,
    roughness: 1,
    metalness: 0,
  });

  private readonly canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0xb5ffc5,
    emissive: 0x16331d,
    roughness: 0.86,
    metalness: 0,
  });

  private readonly deadwoodMaterial = new THREE.MeshStandardMaterial({
    color: 0x8af0a5,
    emissive: 0x10231a,
    roughness: 0.96,
    metalness: 0,
  });

  private readonly shrubMaterial = new THREE.MeshStandardMaterial({
    color: 0x79ff8f,
    emissive: 0x112a17,
    roughness: 0.92,
    metalness: 0,
  });

  private readonly rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x9dffbb,
    emissive: 0x15301e,
    roughness: 0.95,
    metalness: 0,
  });

  private readonly obeliskMaterial = new THREE.MeshStandardMaterial({
    color: 0xc3ffd3,
    emissive: 0x193926,
    roughness: 0.74,
    metalness: 0.06,
  });

  private readonly trunkGeometry = new THREE.CylinderGeometry(0.35, 0.45, 1, 6);
  private readonly canopyGeometry = new THREE.ConeGeometry(1, 1, 6);
  private readonly deadBranchGeometry = new THREE.CylinderGeometry(0.2, 0.24, 1, 5);
  private readonly shrubGeometry = new THREE.SphereGeometry(1, 5, 4);
  private readonly rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  private readonly obeliskGeometry = new THREE.BoxGeometry(1, 1, 1);

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
    this.deadwoodMaterial.dispose();
    this.shrubMaterial.dispose();
    this.rockMaterial.dispose();
    this.obeliskMaterial.dispose();
    this.terrainLineMaterial.dispose();
    this.trunkGeometry.dispose();
    this.canopyGeometry.dispose();
    this.deadBranchGeometry.dispose();
    this.shrubGeometry.dispose();
    this.rockGeometry.dispose();
    this.obeliskGeometry.dispose();
  }

  private buildChunk(coord: ChunkCoord, frame: number): ChunkData {
    const group = new THREE.Group();
    group.name = `chunk:${chunkKey(coord)}`;

    const terrainMesh = this.createTerrainMesh(coord);
    group.add(terrainMesh);
    group.add(this.createTerrainWireframe(terrainMesh.geometry));

    const props = generatePropsForChunk(coord, this.config);
    const propMeshes = this.createPropMeshes(props);

    for (const mesh of propMeshes) {
      group.add(mesh);
    }

    const bounds = new THREE.Box3().setFromObject(group);

    return {
      coord,
      key: chunkKey(coord),
      group,
      terrainMesh,
      propInstances: props,
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
      const terrain = sampleTerrain(worldX, worldZ, this.config);
      positions[index + 1] = terrain.height;

      const [red, green, blue] = this.getTerrainColor(terrain);
      colors[index] = red;
      colors[index + 1] = green;
      colors[index + 2] = blue;
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

  private createPropMeshes(props: PropInstanceData[]): THREE.Object3D[] {
    if (props.length === 0) {
      return [];
    }

    const pines = props.filter((prop) => prop.kind === 'pine');
    const deadTrees = props.filter((prop) => prop.kind === 'dead_tree');
    const shrubs = props.filter((prop) => prop.kind === 'shrub');
    const rocks = props.filter((prop) => prop.kind === 'rock');
    const obelisks = props.filter((prop) => prop.kind === 'obelisk');
    const meshes: THREE.Object3D[] = [];
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();

    if (pines.length > 0) {
      const trunks = new THREE.InstancedMesh(this.trunkGeometry, this.trunkMaterial, pines.length);
      const canopies = new THREE.InstancedMesh(this.canopyGeometry, this.canopyMaterial, pines.length);

      pines.forEach((prop, index) => {
        euler.set(prop.pitch, prop.yaw, 0);
        quaternion.setFromEuler(euler);
        matrix.compose(
          new THREE.Vector3(prop.x, prop.y + (prop.trunkHeight ?? prop.height * 0.35) * 0.5, prop.z),
          quaternion,
          new THREE.Vector3(
            prop.trunkRadius ?? Math.max(0.2, prop.width * 0.32),
            prop.trunkHeight ?? prop.height * 0.35,
            prop.trunkRadius ?? Math.max(0.2, prop.depth * 0.32),
          ),
        );
        trunks.setMatrixAt(index, matrix);

        matrix.compose(
          new THREE.Vector3(
            prop.x,
            prop.y + (prop.trunkHeight ?? prop.height * 0.35) + (prop.crownHeight ?? prop.height * 0.65) * 0.5,
            prop.z,
          ),
          quaternion,
          new THREE.Vector3(
            prop.crownRadius ?? Math.max(0.7, prop.width * 1.6),
            prop.crownHeight ?? prop.height * 0.65,
            prop.crownRadius ?? Math.max(0.7, prop.depth * 1.6),
          ),
        );
        canopies.setMatrixAt(index, matrix);
      });

      trunks.instanceMatrix.needsUpdate = true;
      canopies.instanceMatrix.needsUpdate = true;
      meshes.push(trunks, canopies);
    }

    if (deadTrees.length > 0) {
      const trunks = new THREE.InstancedMesh(this.trunkGeometry, this.deadwoodMaterial, deadTrees.length);
      const branches = new THREE.InstancedMesh(this.deadBranchGeometry, this.deadwoodMaterial, deadTrees.length);

      deadTrees.forEach((prop, index) => {
        euler.set(prop.pitch, prop.yaw, 0);
        quaternion.setFromEuler(euler);
        matrix.compose(
          new THREE.Vector3(prop.x, prop.y + prop.height * 0.5, prop.z),
          quaternion,
          new THREE.Vector3(
            prop.trunkRadius ?? Math.max(0.18, prop.width * 0.45),
            prop.height,
            prop.trunkRadius ?? Math.max(0.18, prop.depth * 0.45),
          ),
        );
        trunks.setMatrixAt(index, matrix);

        euler.set(0.9 + prop.pitch, prop.yaw + 0.45, 0.3);
        quaternion.setFromEuler(euler);
        matrix.compose(
          new THREE.Vector3(prop.x, prop.y + prop.height * 0.7, prop.z),
          quaternion,
          new THREE.Vector3(
            Math.max(0.12, prop.width * 0.28),
            prop.height * 0.42,
            Math.max(0.12, prop.depth * 0.22),
          ),
        );
        branches.setMatrixAt(index, matrix);
      });

      trunks.instanceMatrix.needsUpdate = true;
      branches.instanceMatrix.needsUpdate = true;
      meshes.push(trunks, branches);
    }

    if (shrubs.length > 0) {
      const shrubMesh = new THREE.InstancedMesh(this.shrubGeometry, this.shrubMaterial, shrubs.length);

      shrubs.forEach((prop, index) => {
        euler.set(prop.pitch, prop.yaw, 0);
        quaternion.setFromEuler(euler);
        matrix.compose(
          new THREE.Vector3(prop.x, prop.y + prop.height * 0.5, prop.z),
          quaternion,
          new THREE.Vector3(prop.width, prop.height, prop.depth),
        );
        shrubMesh.setMatrixAt(index, matrix);
      });

      shrubMesh.instanceMatrix.needsUpdate = true;
      meshes.push(shrubMesh);
    }

    if (rocks.length > 0) {
      const rockMesh = new THREE.InstancedMesh(this.rockGeometry, this.rockMaterial, rocks.length);

      rocks.forEach((prop, index) => {
        euler.set(prop.pitch, prop.yaw, prop.pitch * 0.65);
        quaternion.setFromEuler(euler);
        matrix.compose(
          new THREE.Vector3(prop.x, prop.y + prop.height * 0.5, prop.z),
          quaternion,
          new THREE.Vector3(prop.width, prop.height, prop.depth),
        );
        rockMesh.setMatrixAt(index, matrix);
      });

      rockMesh.instanceMatrix.needsUpdate = true;
      meshes.push(rockMesh);
    }

    if (obelisks.length > 0) {
      const obeliskMesh = new THREE.InstancedMesh(this.obeliskGeometry, this.obeliskMaterial, obelisks.length);

      obelisks.forEach((prop, index) => {
        euler.set(prop.pitch, prop.yaw, 0);
        quaternion.setFromEuler(euler);
        matrix.compose(
          new THREE.Vector3(prop.x, prop.y + prop.height * 0.5, prop.z),
          quaternion,
          new THREE.Vector3(prop.width, prop.height, prop.depth),
        );
        obeliskMesh.setMatrixAt(index, matrix);
      });

      obeliskMesh.instanceMatrix.needsUpdate = true;
      meshes.push(obeliskMesh);
    }

    return meshes;
  }

  private getTerrainColor(terrain: TerrainSample): [number, number, number] {
    const base = BIOME_BASE_COLORS[terrain.biome];
    const exposure = clamp01(terrain.elevation * 0.42 + terrain.ridge * 0.28 + terrain.rockiness * 0.24);
    const dampening = terrain.moisture * 0.12;
    const edgeLift = clamp01(terrain.rockiness * 0.26 + terrain.slope * 0.08);
    const red = clamp01(base[0] + exposure * 0.12 + edgeLift * 0.12 - dampening * 0.3);
    const green = clamp01(base[1] + exposure * 0.25 + terrain.vegetation * 0.16 - dampening * 0.12);
    const blue = clamp01(base[2] + exposure * 0.1 + terrain.moisture * 0.03 + edgeLift * 0.08);

    return [red, green, blue];
  }

  private isSharedGeometry(geometry: THREE.BufferGeometry): boolean {
    return (
      geometry === this.trunkGeometry ||
      geometry === this.canopyGeometry ||
      geometry === this.deadBranchGeometry ||
      geometry === this.shrubGeometry ||
      geometry === this.rockGeometry ||
      geometry === this.obeliskGeometry
    );
  }

  private disposeChunk(chunk: ChunkData): void {
    chunk.group.traverse((object) => {
      const renderObject = object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
      };

      if (!renderObject.geometry) {
        return;
      }

      if (this.isSharedGeometry(renderObject.geometry)) {
        return;
      }

      renderObject.geometry.dispose();
    });
  }
}

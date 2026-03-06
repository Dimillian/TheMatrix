import type { ChunkCoord } from '../types.ts';

export function chunkKey(coord: ChunkCoord): string {
  return `${coord.x},${coord.z}`;
}

export function worldToChunkCoord(x: number, z: number, chunkSize: number): ChunkCoord {
  return {
    x: Math.floor(x / chunkSize),
    z: Math.floor(z / chunkSize),
  };
}

export function chunkOrigin(coord: ChunkCoord, chunkSize: number): { x: number; z: number } {
  return {
    x: coord.x * chunkSize,
    z: coord.z * chunkSize,
  };
}

export function enumerateChunkRing(center: ChunkCoord, radius: number): ChunkCoord[] {
  const coords: ChunkCoord[] = [];

  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      coords.push({
        x: center.x + dx,
        z: center.z + dz,
      });
    }
  }

  return coords.sort((a, b) => {
    const da = (a.x - center.x) ** 2 + (a.z - center.z) ** 2;
    const db = (b.x - center.x) ** 2 + (b.z - center.z) ** 2;
    return da - db;
  });
}

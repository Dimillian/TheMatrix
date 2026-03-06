import { describe, expect, it } from 'vitest';
import { FIXED_GAME_CONFIG } from '../config.ts';
import {
  generateInteriorLayoutForChunk,
  generateInteriorPropsForChunk,
  getInteriorSpawnPoint,
  isInteriorWalkable,
  sampleInteriorCell,
  sampleInteriorHeight,
} from './interior.ts';

const INTERIOR_CONFIG = {
  ...FIXED_GAME_CONFIG,
  worldMode: 'interior' as const,
};

function countWalkable(layout: ReturnType<typeof generateInteriorLayoutForChunk>): number {
  return layout.cells.flat().filter((cell) => cell.walkable).length;
}

describe('interior world', () => {
  it('builds deterministic chunk layouts for the same seed and coord', () => {
    const layoutA = generateInteriorLayoutForChunk({ x: 0, z: 0 }, INTERIOR_CONFIG);
    const layoutB = generateInteriorLayoutForChunk({ x: 0, z: 0 }, INTERIOR_CONFIG);

    expect(layoutA.edgeOpenings).toEqual(layoutB.edgeOpenings);
    expect(layoutA.rooms).toEqual(layoutB.rooms);
    expect(layoutA.cells).toEqual(layoutB.cells);
    expect(layoutA.props).toEqual(layoutB.props);
  });

  it('keeps edge openings continuous across chunk borders', () => {
    const center = generateInteriorLayoutForChunk({ x: 0, z: 0 }, INTERIOR_CONFIG);
    const east = generateInteriorLayoutForChunk({ x: 1, z: 0 }, INTERIOR_CONFIG);
    const south = generateInteriorLayoutForChunk({ x: 0, z: 1 }, INTERIOR_CONFIG);

    expect(center.edgeOpenings.east).toEqual(east.edgeOpenings.west);
    expect(center.edgeOpenings.south).toEqual(south.edgeOpenings.north);
  });

  it('creates branching layouts with rooms instead of a single straight hallway', () => {
    const layout = generateInteriorLayoutForChunk({ x: 0, z: 0 }, INTERIOR_CONFIG);
    const walkable = countWalkable(layout);
    const junctions = layout.cells.flat().filter((cell) => cell.kind === 'junction');
    const rooms = layout.cells.flat().filter((cell) => cell.kind === 'room');

    expect(walkable).toBeGreaterThan(20);
    expect(junctions.length).toBeGreaterThan(0);
    expect(layout.rooms.length).toBeGreaterThan(0);
    expect(rooms.length).toBeGreaterThan(0);
  });

  it('spawns the player into a valid walkable cell', () => {
    const spawn = getInteriorSpawnPoint(INTERIOR_CONFIG);

    expect(isInteriorWalkable(spawn.x, spawn.z, INTERIOR_CONFIG)).toBe(true);
    expect(sampleInteriorCell(spawn.x, spawn.z, INTERIOR_CONFIG)?.walkable).toBe(true);
  });

  it('generates deterministic semantic props for rooms and halls', () => {
    const propsA = generateInteriorPropsForChunk({ x: 0, z: 1 }, INTERIOR_CONFIG);
    const propsB = generateInteriorPropsForChunk({ x: 0, z: 1 }, INTERIOR_CONFIG);

    expect(propsA).toEqual(propsB);
    expect(propsA.length).toBeGreaterThan(0);
    expect(propsA.some((prop) => prop.kind === 'console' || prop.kind === 'serverRack')).toBe(true);
  });

  it('biases edge connectivity toward fewer, longer corridors', () => {
    const layout = generateInteriorLayoutForChunk({ x: 0, z: 0 }, INTERIOR_CONFIG);
    const openingCounts = Object.values(layout.edgeOpenings).map((openings) => openings.length);

    expect(openingCounts.every((count) => count >= 1 && count <= 2)).toBe(true);
    expect(openingCounts.filter((count) => count === 2).length).toBeLessThanOrEqual(1);
  });

  it('introduces visible stair features across nearby chunks', () => {
    const nearbyProps = [
      ...generateInteriorPropsForChunk({ x: 0, z: 0 }, INTERIOR_CONFIG),
      ...generateInteriorPropsForChunk({ x: 1, z: 0 }, INTERIOR_CONFIG),
      ...generateInteriorPropsForChunk({ x: 0, z: 1 }, INTERIOR_CONFIG),
      ...generateInteriorPropsForChunk({ x: -1, z: 0 }, INTERIOR_CONFIG),
    ];

    expect(nearbyProps.some((prop) => prop.kind === 'stairRun')).toBe(true);
  });

  it('uses a stable interior floor height for movement sampling', () => {
    const heightA = sampleInteriorHeight(8, 8, INTERIOR_CONFIG);
    const heightB = sampleInteriorHeight(56, 40, INTERIOR_CONFIG);

    expect(heightA).toBeCloseTo(heightB, 8);
  });
});

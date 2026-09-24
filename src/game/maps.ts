import { ENEMIES, makeWave } from './data';
import type { EnemyKind, MapDef, MapId, Point, RunConfig, Spawn } from './types';

const ENEMY_IDS: readonly EnemyKind[] = ['termagant', 'hormagaunt', 'warrior', 'carnifex', 'tyrant', 'zoanthrope', 'ravener', 'nest'];

const points = (values: readonly (readonly [number, number])[]): Point[] =>
  values.map(([x, z]) => ({ x, z }));

export const MAPS: Record<MapId, MapDef> = {
  foundry: {
    id: 'foundry',
    name: 'Ferrum Foundry',
    subtitle: 'MUNITORUM FORGE 88-B',
    description: 'Redirect the main conveyor between waves to force the swarm through the killing floor.',
    paths: [
      points([[-17, -6], [-12, -6], [-12, -1], [-6, -1], [-6, 5], [3, 5], [3, 0], [15, 0]]),
      points([[-17, -6], [-12, -6], [-12, -9], [-3, -9], [-3, -4], [6, -4], [6, 0], [15, 0]]),
    ],
    pads: points([[-14, -3], [-9, -4], [-9, 1], [-4, -2], [-4, 3], [-3, 7], [1, 7], [1, 2], [5, 3], [5, -2], [9, -3], [10, 2], [-9, -8], [1, -7]]),
    exits: [0, 0],
    gateNames: ['Foundry Bastion'],
    lockedPads: [],
    objective: { x: -4, z: 4 },
    capture: { x: 0, z: 0 },
    mechanic: 'diversion',
    palette: { ground: 0x5c5145, path: 0x292b2a, accent: 0xf3a34f, fog: 0xb7865c },
  },
  crossroads: {
    id: 'crossroads',
    name: 'Martyr’s Crossroads',
    subtitle: 'TWIN-GATE REDOUBT',
    description: 'Two approach roads end at separate gates. The loss of either gate ends the defence.',
    paths: [
      points([[-17, 8], [-10, 8], [-10, 3], [-3, 3], [-3, 7], [5, 7], [5, 5], [15, 5]]),
      points([[-17, -8], [-10, -8], [-10, -3], [-2, -3], [-2, -7], [6, -7], [6, -5], [15, -5]]),
    ],
    pads: points([[-14, 5], [-14, -5], [-8, 5], [-8, -5], [-5, 0], [-1, 0], [1, 5], [1, -5], [5, 2], [5, -2], [9, 7], [9, -7], [11, 2], [11, -2]]),
    exits: [0, 1],
    gateNames: ['Aquila Gate', 'Reliquary Gate'],
    lockedPads: [],
    objective: { x: -1, z: 4.5 },
    capture: { x: 0, z: 0 },
    mechanic: 'gates',
    palette: { ground: 0x5d604f, path: 0x45443b, accent: 0xd9c77c, fog: 0x9ba087 },
  },
  wastes: {
    id: 'wastes',
    name: 'Ashen Wastes',
    subtitle: 'OUTPOST KAPPA-9',
    description: 'Move the hero onto the abandoned outpost to secure four forward construction pads.',
    paths: [
      points([[-17, 8], [-11, 8], [-11, 4], [-5, 4], [-5, 0], [3, 0], [3, -3], [15, -3]]),
      points([[-17, -8], [-9, -8], [-9, -4], [-2, -4], [-2, 1], [6, 1], [6, -3], [15, -3]]),
      points([[-17, 0], [-13, 0], [-13, -3], [-6, -3], [-6, 3], [1, 3], [1, -3], [15, -3]]),
    ],
    pads: points([[-14, 5], [-14, -5], [-10, 1], [-8, 6], [-7, -6], [-4.5, 1.5], [-1, -2], [1, 5], [3, 2], [5, -2], [8, 0], [11, -6], [-11, -2], [-3, 6], [4, -6], [9, -5]]),
    exits: [0, 0, 0],
    gateNames: ['Kappa Holdfast'],
    lockedPads: [12, 13, 14, 15],
    objective: { x: 2, z: 2 },
    capture: { x: -3, z: 0 },
    mechanic: 'capture',
    palette: { ground: 0x6b6254, path: 0x3d3934, accent: 0x75c9c3, fog: 0xb2a18c },
  },
};

export function getMap(id: MapId): MapDef {
  return MAPS[id] ?? MAPS.foundry;
}

export function routeLength(map: MapId, path: number): number {
  const route = getMap(map).paths[path];
  if (!route) return 0;
  let length = 0;
  for (let i = 1; i < route.length; i++) {
    length += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  }
  return length;
}

export function routePoint(map: MapId, path: number, progress: number): Point & { facing: number } {
  const route = getMap(map).paths[path] ?? getMap(map).paths[0];
  if (!route?.length) return { x: 0, z: 0, facing: 0 };
  const distance = Number.isFinite(progress) ? Math.max(0, progress) : 0;
  let remaining = distance;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= length) {
      const ratio = length > 0 ? remaining / length : 0;
      return {
        x: a.x + (b.x - a.x) * ratio,
        z: a.z + (b.z - a.z) * ratio,
        facing: Math.atan2(b.x - a.x, b.z - a.z),
      };
    }
    remaining -= length;
  }
  const end = route[route.length - 1];
  const before = route[route.length - 2] ?? end;
  return { ...end, facing: Math.atan2(end.x - before.x, end.z - before.z) };
}

export function nearestRoutePoint(map: MapId, point: Point): Point {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return { x: 0, z: 0 };
  let nearest = { ...getMap(map).paths[0][0] };
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const route of getMap(map).paths) {
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1];
      const b = route[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSquared = dx * dx + dz * dz;
      const projection = lengthSquared === 0 ? 0 : ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared;
      const ratio = Math.max(0, Math.min(1, projection));
      const candidate = { x: a.x + dx * ratio, z: a.z + dz * ratio };
      const distance = (candidate.x - point.x) ** 2 + (candidate.z - point.z) ** 2;
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
  }
  return nearest;
}

const remixPaths = (config: RunConfig, wave: number, diverted: boolean, spawns: Spawn[]): Spawn[] => {
  const pathCount = getMap(config.map).paths.length;
  return spawns.map((spawn, index) => {
    let path = 0;
    if (config.map === 'foundry') path = diverted ? 1 : 0;
    if (config.map === 'crossroads') path = (index + wave + (spawn.kind === 'carnifex' ? 1 : 0)) % pathCount;
    if (config.map === 'wastes') path = (index + wave + ENEMY_IDS.indexOf(spawn.kind)) % pathCount;
    return { ...spawn, path };
  });
};

const clonePressure = (source: Spawn[], amount: number, timeScale: number): Spawn[] => {
  const extra = source.slice(0, Math.max(0, Math.min(source.length, amount))).map((spawn, index) => ({
    ...spawn,
    time: spawn.time * timeScale + 0.18 + (index % 3) * 0.08,
  }));
  return source.map(spawn => ({ ...spawn, time: spawn.time * timeScale })).concat(extra);
};

export function makeMissionWave(config: RunConfig, wave: number, diverted: boolean, objectiveActive: boolean): Spawn[] {
  const safeWave = Number.isFinite(wave) ? Math.max(1, Math.min(10_000, Math.floor(wave))) : 1;
  const baseWave = (safeWave - 1) % 10 + 1;
  const endlessCycle = config.mode === 'endless' ? Math.min(8, Math.floor((safeWave - 1) / 10)) : 0;
  let spawns = makeWave(baseWave).map(spawn => ({ ...spawn }));

  if (config.mode === 'veteran') spawns = clonePressure(spawns, Math.ceil(spawns.length * 0.25), 0.82);
  if (config.mode === 'challenge') spawns = clonePressure(spawns, Math.ceil(spawns.length * 0.12), 0.9);
  if (config.mode === 'endless') spawns = clonePressure(spawns, Math.ceil(spawns.length * Math.min(0.65, 0.1 + endlessCycle * 0.08)), Math.max(0.62, 0.9 - endlessCycle * 0.035));

  if (config.map === 'foundry' && safeWave >= 6) {
    const flank = spawns.filter((spawn, index) => index % 9 === 0 && spawn.kind !== 'tyrant').map(spawn => ({ ...spawn, kind: 'ravener' as const, time: spawn.time + 0.35 }));
    spawns.push(...flank);
  } else if (config.map === 'crossroads' && safeWave >= 4) {
    const splitPressure = Math.min(6, Math.ceil(safeWave / 2));
    for (let index = 0; index < splitPressure; index++) spawns.push({ kind: index % 3 === 0 ? 'warrior' : 'hormagaunt', path: index % 2, time: 4 + index * 2.1 });
  } else if (config.map === 'wastes' && safeWave >= 3) {
    const burrowers = Math.min(8, 1 + Math.floor(safeWave / 2));
    for (let index = 0; index < burrowers; index++) spawns.push({ kind: index % 4 === 3 ? 'zoanthrope' : 'ravener', path: index % 3, time: 5 + index * 2.4 });
  }

  if (objectiveActive) {
    const reinforcements = spawns.filter(spawn => spawn.kind !== 'tyrant' && spawn.kind !== 'nest').slice(0, Math.min(12, Math.ceil(spawns.length * 0.16)));
    spawns.push(...reinforcements.map((spawn, index) => ({ ...spawn, kind: index % 5 === 4 ? 'warrior' : spawn.kind, time: spawn.time + 1.1 + index * 0.14 })));
  }

  if (baseWave === 10 && Object.prototype.hasOwnProperty.call(ENEMIES, 'nest')) {
    spawns.push({ kind: 'nest', path: 0, time: 2 }, { kind: 'nest', path: Math.min(1, getMap(config.map).paths.length - 1), time: 5 });
  }

  return remixPaths(config, safeWave, diverted, spawns)
    .sort((a, b) => a.time - b.time)
    .slice(0, 112);
}

export function wavePreview(config: RunConfig, wave: number, diverted: boolean): Partial<Record<EnemyKind, number>> {
  const preview: Partial<Record<EnemyKind, number>> = {};
  for (const spawn of makeMissionWave(config, wave, diverted, false)) preview[spawn.kind] = (preview[spawn.kind] ?? 0) + 1;
  return preview;
}

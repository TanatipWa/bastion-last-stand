import { earnedHonors, HONOR_IDS, honorKey } from './honors';
import { getMap } from './maps';
import { BRANCHES } from './progression';
export { makeMissionWave, wavePreview } from './maps';
import type {
  Ally,
  BestRun,
  BranchId,
  CombatEvent,
  DoctrineId,
  Enemy,
  EnemyKind,
  FireZone,
  GameMode,
  GameState,
  Hazard,
  HeroId,
  LiveryId,
  LoadoutId,
  MapId,
  Objective,
  Point,
  Profile,
  RunConfig,
  Spawn,
  Strike,
  Tower,
  TowerRecord,
} from './types';

const PROFILE_KEY = 'bastion.profile.v1';
const RUN_KEY = 'bastion.run.v2';
const MAP_IDS: readonly MapId[] = ['foundry', 'crossroads', 'wastes'];
const MODES: readonly GameMode[] = ['campaign', 'veteran', 'endless', 'challenge'];
const HERO_IDS: readonly HeroId[] = ['captain', 'techmarine', 'librarian'];
const LOADOUT_IDS: readonly LoadoutId[] = ['balanced', 'fortified', 'expedition'];
const LIVERY_IDS: readonly LiveryId[] = ['crimson', 'cobalt', 'ivory'];
const ENEMY_IDS: readonly EnemyKind[] = ['termagant', 'hormagaunt', 'warrior', 'carnifex', 'tyrant', 'zoanthrope', 'ravener', 'nest'];
const DOCTRINE_IDS: readonly DoctrineId[] = ['cryoflame', 'machine_spirit', 'war_chest', 'orbital_mastery', 'forge_pact', 'vengeance', 'brotherhood', 'heroic', 'rapid_deployment'];
const BRANCH_IDS: readonly BranchId[] = ['hailstorm', 'executioner', 'inferno', 'napalm', 'lance', 'prism', 'deepfreeze', 'widefield', 'vanguard', 'fireteam'];

export const DEFAULT_CONFIG: RunConfig = {
  map: 'foundry',
  mode: 'campaign',
  hero: 'captain',
  loadout: 'balanced',
  livery: 'crimson',
};

export const HEROES: Record<HeroId, { name: string; description: string; cost: number; hp: number; damage: number; range: number; speed: number; skillName: string; skillDescription: string }> = {
  captain: { name: 'Captain', description: 'A durable front-line commander who anchors Marine squads.', cost: 0, hp: 400, damage: 24, range: 1.5, speed: 3.5, skillName: 'Rallying Cry', skillDescription: 'Heal the Captain for 100 and nearby allies for 60, then strike nearby enemies for 120.' },
  techmarine: { name: 'Techmarine', description: 'A ranged field engineer who repairs allies and disabled defences.', cost: 3, hp: 300, damage: 20, range: 3.5, speed: 3, skillName: 'Blessing of the Omnissiah', skillDescription: 'Repair nearby allies for 120 and overcharge nearby towers for 6 seconds.' },
  librarian: { name: 'Librarian', description: 'A mobile psyker whose attacks and skill control dense assaults.', cost: 5, hp: 260, damage: 35, range: 4, speed: 3.3, skillName: 'Psychic Tempest', skillDescription: 'Unleash a 260-damage piercing blast that slows enemies for 2 seconds.' },
};

export const LOADOUTS: Record<LoadoutId, { name: string; description: string; cost: number; money: number; gateBonus: number }> = {
  balanced: { name: 'Balanced', description: 'Standard requisition and standard gate strength.', cost: 0, money: 250, gateBonus: 0 },
  fortified: { name: 'Fortified', description: 'Trade early requisition for four additional total gate integrity.', cost: 2, money: 220, gateBonus: 4 },
  expedition: { name: 'Expedition', description: 'Deploy with extra requisition at the cost of four total gate integrity.', cost: 2, money: 300, gateBonus: -4 },
};

export const LIVERIES: Record<LiveryId, { name: string; description: string; cost: number; color: number }> = {
  crimson: { name: 'Crimson Wardens', description: 'The campaign’s standard deep-red plate.', cost: 0, color: 0x9f3030 },
  cobalt: { name: 'Cobalt Sentinels', description: 'Cerulean armour for veterans of the eastern gate.', cost: 1, color: 0x315f9f },
  ivory: { name: 'Ivory Castellans', description: 'Pale ceremonial armour marked by ash and service.', cost: 1, color: 0xd8d0b4 },
};

const has = <T extends string>(items: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && items.includes(value as T);

export function newProfile(): Profile {
  return { version: 1, medals: 0, heroes: ['captain'], loadouts: ['balanced'], liveries: ['crimson'], completed: [], best: {}, rewarded: [], honors: {} };
}

const recordKey = (map: MapId, mode: GameMode) => `${map}:${mode}`;
const isInteger = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const isNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const uniqueTyped = <T extends string>(value: unknown, values: readonly T[], max: number): value is T[] =>
  Array.isArray(value) && value.length <= max && value.every(item => has(values, item)) && new Set(value).size === value.length;

const isBestRun = (value: unknown): value is BestRun => isObject(value)
  && isInteger(value.stars, 0, 3)
  && isInteger(value.wave, 0, 10_000)
  && isInteger(value.kills, 0, 1_000_000)
  && isInteger(value.score, 0, 2_000_000_000);

const isProfile = (value: unknown): value is Profile => {
  if (!isObject(value) || value.version !== 1 || !isInteger(value.medals, 0, 1_000_000)) return false;
  if (!uniqueTyped(value.heroes, HERO_IDS, HERO_IDS.length) || !value.heroes.includes('captain')) return false;
  if (!uniqueTyped(value.loadouts, LOADOUT_IDS, LOADOUT_IDS.length) || !value.loadouts.includes('balanced')) return false;
  if (!uniqueTyped(value.liveries, LIVERY_IDS, LIVERY_IDS.length) || !value.liveries.includes('crimson')) return false;
  if (!uniqueTyped(value.completed, MAP_IDS, MAP_IDS.length) || !value.completed.every((map, index) => map === MAP_IDS[index]) || !isObject(value.best)) return false;
  if (value.honors !== undefined && (!isObject(value.honors) || Object.keys(value.honors).length > 9 || Object.entries(value.honors).some(([key, owner]) => !MAP_IDS.some(map => HONOR_IDS.some(id => key === honorKey(map, id))) || typeof owner !== 'string' || owner.length < 1 || owner.length > 128))) return false;
  const bestEntries = Object.entries(value.best);
  if (bestEntries.length > MAP_IDS.length * MODES.length || bestEntries.some(([key, best]) => !MAP_IDS.some(map => MODES.some(mode => key === recordKey(map, mode))) || !isBestRun(best))) return false;
  return Array.isArray(value.rewarded) && value.rewarded.length <= 2048
    && value.rewarded.every(id => typeof id === 'string' && id.length >= 1 && id.length <= 128)
    && new Set(value.rewarded).size === value.rewarded.length;
};

export function loadProfile(): Profile {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
    return isProfile(parsed) ? { ...parsed, honors: parsed.honors ?? {} } : newProfile();
  } catch {
    return newProfile();
  }
}

export function saveProfile(profile: Profile): boolean {
  if (!isProfile(profile)) return false;
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function unlock(profile: Profile, category: 'hero' | 'loadout' | 'livery', id: string): boolean {
  if (!isProfile(profile)) return false;
  const catalogs = { hero: HEROES, loadout: LOADOUTS, livery: LIVERIES } as const;
  const lists = { hero: profile.heroes, loadout: profile.loadouts, livery: profile.liveries } as const;
  const catalog = catalogs[category] as Record<string, { cost: number }>;
  const list = lists[category] as string[];
  const item = catalog[id];
  if (!item || list.includes(id) || profile.medals < item.cost) return false;
  profile.medals -= item.cost;
  list.push(id);
  return true;
}

export function isAvailable(profile: Profile, config: RunConfig): boolean {
  if (!isProfile(profile) || !has(MAP_IDS, config.map) || !has(MODES, config.mode) || !has(HERO_IDS, config.hero) || !has(LOADOUT_IDS, config.loadout) || !has(LIVERY_IDS, config.livery)) return false;
  if (!profile.heroes.includes(config.hero) || !profile.loadouts.includes(config.loadout) || !profile.liveries.includes(config.livery)) return false;
  const mapIndex = MAP_IDS.indexOf(config.map);
  if (mapIndex > 0 && !profile.completed.includes(MAP_IDS[mapIndex - 1])) return false;
  return config.mode === 'campaign' || profile.completed.length > 0;
}

const scoreFor = (state: GameState): number => Math.min(2_000_000_000,
  Math.max(0, Math.round(state.kills * 10 + state.completedWaves * 100 + state.integrity * 25)));

const earnedStars = (state: GameState): number => {
  if (state.phase !== 'won') return 0;
  const initialIntegrity = 20 + LOADOUTS[state.config.loadout].gateBonus;
  const ratio = initialIntegrity > 0 ? state.integrity / initialIntegrity : 0;
  return ratio >= 0.7 ? 3 : ratio >= 0.4 ? 2 : 1;
};

export function recordRun(profile: Profile, state: GameState): { medals: number; stars: number; newBest: boolean } {
  if (!isProfile(profile) || !isGameState(state) || (state.phase !== 'won' && state.phase !== 'lost')) return { medals: 0, stars: 0, newBest: false };
  const alreadyRewarded = profile.rewarded.includes(state.runId);
  const stars = earnedStars(state);
  const victoryCanBank = state.phase === 'won' && (state.config.mode !== 'endless' || state.completedWaves >= 10);
  const baseMedals = victoryCanBank ? 2 + stars : state.phase === 'lost' && state.completedWaves >= 3 ? 1 : 0;
  const honors = profile.honors ?? {};
  const honorAwards = earnedHonors(state).map(id => honorKey(state.config.map, id)).filter(key => honors[key] === state.runId || (!alreadyRewarded && !honors[key]));
  const medals = baseMedals + (state.objective.status === 'success' ? 2 : 0) + honorAwards.length;
  if (!alreadyRewarded) {
    profile.honors ??= {};
    for (const key of honorAwards) profile.honors[key] = state.runId;
    profile.medals = Math.min(1_000_000, profile.medals + medals);
    profile.rewarded.push(state.runId);
    if (profile.rewarded.length > 2048) profile.rewarded.splice(0, profile.rewarded.length - 2048);
    if (state.phase === 'won' && state.config.mode === 'campaign' && !profile.completed.includes(state.config.map)) profile.completed.push(state.config.map);
  }
  const key = recordKey(state.config.map, state.config.mode);
  const candidate: BestRun = { stars, wave: state.completedWaves, kills: state.kills, score: scoreFor(state) };
  const previous = profile.best[key];
  const newBest = !previous || candidate.wave > previous.wave || (candidate.wave === previous.wave && (candidate.stars > previous.stars || (candidate.stars === previous.stars && candidate.score > previous.score)));
  if (newBest) profile.best[key] = { ...candidate, stars: Math.max(stars, previous?.stars ?? 0) };
  else if (previous && stars > previous.stars) previous.stars = stars;
  return { medals, stars, newBest };
}

const isPoint = (value: unknown): value is Point & Record<string, unknown> => isObject(value) && isNumber(value.x, -100, 100) && isNumber(value.z, -100, 100);
const samePoint = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) <= 1e-6 && Math.abs(a.z - b.z) <= 1e-6;
const isSpawn = (value: unknown): value is Spawn => isObject(value) && has(ENEMY_IDS, value.kind) && isInteger(value.path, 0, 7) && isNumber(value.time, 0, 100_000);
const isStrike = (value: unknown): value is Strike => isPoint(value) && isNumber(value.timer, -10, 100);
const isHazard = (value: unknown): value is Hazard => isPoint(value) && isInteger(value.id, 1, 2_000_000_000) && isNumber(value.timer, -10, 1_000) && isNumber(value.radius, 0, 100) && isInteger(value.source, 1, 2_000_000_000);
const isObjective = (value: unknown): value is Objective => isPoint(value) && has(['offered', 'active', 'success', 'failed'] as const, value.status) && isNumber(value.hp, 0, 150) && isInteger(value.startWave, 0, 10_000) && isInteger(value.completedWaves, 0, 2) && typeof value.relic === 'boolean';
const isAlly = (value: unknown): value is Ally => isPoint(value) && isInteger(value.id, -1, 2_000_000_000) && has([...HERO_IDS, 'marine', 'reinforcement'] as const, value.kind) && (value.owner === null || isInteger(value.owner, 1, 2_000_000_000)) && isInteger(value.slot, 0, 32) && isNumber(value.hp, 0, 1_000_000) && isNumber(value.maxHp, 1, 1_000_000) && value.hp <= value.maxHp && isPoint(value.destination) && isNumber(value.cooldown, 0, 1_000) && isNumber(value.respawn, 0, 10_000) && (value.lifetime === null || isNumber(value.lifetime, 0, 100_000)) && (value.engaged === null || isInteger(value.engaged, 1, 2_000_000_000)) && isNumber(value.facing, -100, 100) && isNumber(value.hit, 0, 100);
const isTower = (value: unknown): value is Tower => isPoint(value) && isInteger(value.id, 1, 2_000_000_000) && isInteger(value.pad, 0, 255) && has(['bolter', 'flamer', 'lascannon', 'stasis', 'barracks'] as const, value.kind) && isInteger(value.level, 1, 3) && isNumber(value.invested, 0, 1_000_000) && isNumber(value.cooldown, -10, 10_000) && isNumber(value.overcharge, -10, 10_000) && has(['first', 'armor', 'synapse'] as const, value.target) && isNumber(value.aim, -100, 100) && (value.branch === null || has(BRANCH_IDS, value.branch)) && (value.lastTarget === null || isInteger(value.lastTarget, 1, 2_000_000_000)) && isInteger(value.focusStacks, 0, 100) && isPoint(value.rally) && isNumber(value.disabled, -10, 10_000);
const isEnemy = (value: unknown): value is Enemy => isPoint(value) && isInteger(value.id, 1, 2_000_000_000) && has(ENEMY_IDS, value.kind) && isInteger(value.path, 0, 7) && isNumber(value.progress, 0, 100_000) && isNumber(value.hp, 0, 100_000_000) && isNumber(value.maxHp, 1, 100_000_000) && value.hp <= value.maxHp && isNumber(value.speed, 0, 100) && isNumber(value.armor, 0, 1) && isNumber(value.slow, 0, 1) && isNumber(value.slowTimer, 0, 10_000) && typeof value.shielded === 'boolean' && isNumber(value.facing, -100, 100) && typeof value.summoned === 'boolean' && isNumber(value.hit, 0, 100) && typeof value.barrier === 'boolean' && typeof value.armorCracked === 'boolean' && isNumber(value.burnTime, 0, 10_000) && isNumber(value.burnDps, 0, 10_000_000) && (value.burnSource === null || isInteger(value.burnSource, -1, 2_000_000_000)) && (value.lastHitBy === null || isInteger(value.lastHitBy, -1, 2_000_000_000)) && has(['moving', 'winding', 'charging'] as const, value.chargePhase) && isNumber(value.chargeTimer, 0, 10_000) && (value.blockedBy === null || isInteger(value.blockedBy, -1, 2_000_000_000)) && isNumber(value.attackTimer, 0, 10_000) && isInteger(value.bossPhase, 0, 10) && isNumber(value.specialTimer, 0, 10_000) && isNumber(value.weakTime, 0, 10_000);
const isFire = (value: unknown): value is FireZone => isPoint(value) && isInteger(value.id, 1, 2_000_000_000) && isNumber(value.radius, 0, 100) && isNumber(value.time, -10, 10_000) && isNumber(value.dps, 0, 10_000_000) && isInteger(value.towerId, 1, 2_000_000_000);
const isRecord = (value: unknown): value is TowerRecord => isObject(value) && isInteger(value.id, 1, 2_000_000_000) && isInteger(value.pad, 0, 255) && has(['bolter', 'flamer', 'lascannon', 'stasis', 'barracks'] as const, value.kind) && (value.branch === null || has(BRANCH_IDS, value.branch)) && isNumber(value.damage, 0, 1_000_000_000) && isInteger(value.kills, 0, 1_000_000) && typeof value.sold === 'boolean' && isNumber(value.slowSeconds, 0, 1_000_000) && isInteger(value.interrupts, 0, 1_000_000) && isNumber(value.blockedSeconds, 0, 1_000_000);
const isEvent = (value: unknown): value is CombatEvent => isObject(value)
  && has(['shot', 'kill', 'leak', 'barrage', 'wave', 'build', 'upgrade', 'win', 'lose', 'armorbreak', 'bosskill', 'charge', 'interrupt', 'doctrine', 'bonus', 'melee', 'heal', 'hero', 'acid', 'nest', 'objective'] as const, value.type)
  && isNumber(value.x, -100, 100) && isNumber(value.z, -100, 100)
  && (value.toX === undefined || isNumber(value.toX, -100, 100))
  && (value.toZ === undefined || isNumber(value.toZ, -100, 100))
  && (value.kind === undefined || has([...ENEMY_IDS, 'bolter', 'flamer', 'lascannon', 'stasis', 'barracks'] as const, value.kind))
  && (value.size === undefined || isNumber(value.size, 0, 1_000_000))
  && (value.towerId === undefined || isInteger(value.towerId, 1, 2_000_000_000))
  && (value.branch === undefined || value.branch === null || has(BRANCH_IDS, value.branch));
const isConfig = (value: unknown): value is RunConfig => isObject(value) && has(MAP_IDS, value.map) && has(MODES, value.mode) && has(HERO_IDS, value.hero) && has(LOADOUT_IDS, value.loadout) && has(LIVERY_IDS, value.livery);
const validArray = <T>(value: unknown, max: number, predicate: (item: unknown) => item is T): value is T[] => Array.isArray(value) && value.length <= max && value.every(predicate);

function isGameState(value: unknown): value is GameState {
  if (!isObject(value) || value.version !== 2 || !has(['ready', 'combat', 'prep', 'won', 'lost'] as const, value.phase) || typeof value.paused !== 'boolean') return false;
  if (!isConfig(value.config)) return false;
  const map = getMap(value.config.map);
  if (!isInteger(value.wave, 0, 10_000) || !isNumber(value.money, 0, 1_000_000_000) || !isNumber(value.integrity, 0, 1_000_000)) return false;
  if (!validArray(value.towers, map.pads.length, isTower) || !validArray(value.enemies, 128, isEnemy) || !validArray(value.queue, 512, isSpawn) || !validArray(value.strikes, 128, isStrike) || !validArray(value.events, 512, isEvent)) return false;
  if (!isNumber(value.elapsed, 0, 100_000_000) || !isNumber(value.waveTime, 0, 100_000) || !isNumber(value.prepTime, 0, 10_000) || !isInteger(value.kills, 0, 1_000_000) || !isInteger(value.leaks, 0, 1_000_000)) return false;
  if (!isObject(value.leaked) || Object.entries(value.leaked).some(([kind, count]) => !has(ENEMY_IDS, kind) || !isInteger(count, 0, 1_000_000))) return false;
  if (!isObject(value.cooldowns)) return false;
  const cooldowns = value.cooldowns;
  if (!['barrage', 'overcharge', 'reinforcements', 'heroSkill'].every(key => isNumber(cooldowns[key], 0, 100_000))) return false;
  if (value.speed !== 1 && value.speed !== 2 || !isInteger(value.nextId, 1, 2_000_000_000) || !uniqueTyped(value.doctrines, DOCTRINE_IDS, DOCTRINE_IDS.length) || !uniqueTyped(value.doctrineOffers, DOCTRINE_IDS, 3) || !isInteger(value.doctrineWave, 0, 10_000)) return false;
  if (value.doctrineRerolledWave !== undefined && (!isInteger(value.doctrineRerolledWave, 0, value.doctrineWave) || (value.doctrineRerolledWave !== 0 && ![3, 6, 9].includes(value.doctrineRerolledWave)))) return false;
  const nextId = value.nextId;
  if (!isInteger(value.seed, 0, 0xffffffff) || !isNumber(value.earlyBonus, 0, 1_000_000_000) || !isNumber(value.vengeanceTime, 0, 10_000) || !validArray(value.fires, 128, isFire) || !validArray(value.records, 4096, isRecord)) return false;
  const records = value.records;
  if (typeof value.runId !== 'string' || value.runId.length < 1 || value.runId.length > 128 || !isAlly(value.hero) || value.hero.id !== -1 || value.hero.kind !== value.config.hero || value.hero.owner !== null || value.hero.slot !== 0 || value.hero.lifetime !== null) return false;
  const hero = value.hero as unknown as Record<string, unknown>;
  if (!isNumber(hero.xp, 0, 1_000_000_000) || !isInteger(hero.level, 1, 100) || !isNumber(hero.damageDealt, 0, 1_000_000_000) || !isInteger(hero.kills, 0, 1_000_000)) return false;
  if (!validArray(value.allies, 128, isAlly) || !value.allies.every(ally => ally.kind === 'marine' || ally.kind === 'reinforcement')) return false;
  if (!validArray(value.gates, map.gateNames.length, gate => isNumber(gate, 0, 1_000_000)) || value.gates.length !== map.gateNames.length || !isObjective(value.objective) || !samePoint(value.objective, map.objective)) return false;
  if (Math.abs(value.integrity - value.gates.reduce((total, hp) => total + hp, 0)) > 1e-6) return false;
  if (!isObject(value.mapState) || typeof value.mapState.diverted !== 'boolean' || typeof value.mapState.captured !== 'boolean' || !isNumber(value.mapState.captureProgress, 0, 5)) return false;
  if ((value.config.map !== 'foundry' && value.mapState.diverted) || (value.config.map !== 'wastes' && (value.mapState.captured || value.mapState.captureProgress !== 0))) return false;
  if (!validArray(value.hazards, 128, isHazard) || !isInteger(value.completedWaves, 0, 10_000) || !isInteger(value.rewardMedals, 0, 100) || !isInteger(value.rewardStars, 0, 3)) return false;

  const endless = value.config.mode === 'endless';
  if (!endless && value.wave > 10) return false;
  if (value.phase === 'ready') {
    if (value.wave !== 0 || value.completedWaves !== 0) return false;
  } else if (value.phase === 'combat' || value.phase === 'lost') {
    if (value.wave < 1 || value.completedWaves !== value.wave - 1) return false;
  } else if (value.wave < 1 || value.completedWaves !== value.wave) return false;
  if (value.phase === 'prep' && !endless && value.wave >= 10) return false;
  if (value.phase === 'won' && (endless ? value.wave < 10 : value.wave !== 10)) return false;
  if ((value.phase === 'ready' || value.phase === 'prep' || value.phase === 'won') && (value.enemies.length || value.queue.length)) return false;
  if (value.towers.some(tower => tower.level === 3
    ? tower.branch === null || BRANCHES[tower.branch].kind !== tower.kind
    : tower.branch !== null)) return false;

  if (value.towers.some(tower => tower.pad >= map.pads.length || !samePoint(tower, map.pads[tower.pad]))) return false;
  if (new Set(value.towers.map(tower => tower.pad)).size !== value.towers.length) return false;
  if (value.enemies.some(enemy => enemy.path >= map.paths.length) || value.queue.some(spawn => spawn.path >= map.paths.length)) return false;

  const activeEntities = [...value.towers, ...value.enemies, ...value.allies, ...value.hazards, ...value.fires];
  const activeIds = activeEntities.map(entity => entity.id);
  if (new Set(activeIds).size !== activeIds.length || activeIds.some(id => id >= nextId)) return false;
  if (new Set(records.map(record => record.id)).size !== records.length || records.some(record => record.id >= nextId || record.pad >= map.pads.length)) return false;

  const towers = new Map(value.towers.map(tower => [tower.id, tower]));
  if (value.allies.some(ally => ally.kind === 'marine'
    ? ally.owner === null || ally.slot > 2 || towers.get(ally.owner)?.kind !== 'barracks'
    : ally.owner !== null || ally.slot > 1)) return false;
  if (value.towers.some(tower => {
    const record = records.find(candidate => candidate.id === tower.id);
    return !record || record.sold || record.pad !== tower.pad || record.kind !== tower.kind;
  })) return false;
  if (value.fires.some(fire => !towers.has(fire.towerId))) return false;
  const enemies = new Map(value.enemies.map(enemy => [enemy.id, enemy]));
  if (value.hazards.some(hazard => enemies.get(hazard.source)?.kind !== 'tyrant')) return false;
  return true;
}

function sanitizeLoadedState(state: GameState): GameState {
  state.paused = true;
  state.events = [];
  state.queue.sort((a, b) => a.time - b.time);
  const enemyIds = new Set(state.enemies.filter(enemy => enemy.hp > 0).map(enemy => enemy.id));
  const blockerIds = new Set([state.hero, ...state.allies].filter(ally => ally.hp > 0).map(ally => ally.id));
  const damageSources = new Set([-1, ...state.records.map(record => record.id)]);
  for (const tower of state.towers) if (tower.lastTarget !== null && !enemyIds.has(tower.lastTarget)) tower.lastTarget = null;
  for (const ally of [state.hero, ...state.allies]) if (ally.engaged !== null && !enemyIds.has(ally.engaged)) ally.engaged = null;
  for (const enemy of state.enemies) {
    if (enemy.blockedBy !== null && !blockerIds.has(enemy.blockedBy)) enemy.blockedBy = null;
    if (enemy.burnSource !== null && !damageSources.has(enemy.burnSource)) enemy.burnSource = null;
    if (enemy.lastHitBy !== null && !damageSources.has(enemy.lastHitBy)) enemy.lastHitBy = null;
  }
  return state;
}

export function saveRun(state: GameState): boolean {
  if (!isGameState(state) || state.phase === 'won' || state.phase === 'lost') return false;
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadRun(): GameState | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RUN_KEY) ?? 'null');
    // Keep in-progress v2 defenses from the first release candidate after moving reactors onto the roads.
    if (isObject(parsed) && parsed.version === 2 && isConfig(parsed.config) && isPoint(parsed.objective)) {
      const legacy: Record<MapId, Point> = { foundry: { x: -1, z: 1 }, crossroads: { x: 1, z: 0 }, wastes: { x: 4, z: 5 } };
      if (samePoint(parsed.objective, legacy[parsed.config.map])) Object.assign(parsed.objective, getMap(parsed.config.map).objective);
    }
    if (!isGameState(parsed) || parsed.phase === 'won' || parsed.phase === 'lost') return null;
    return sanitizeLoadedState(parsed);
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    // Storage is optional in restricted browsing contexts.
  }
}

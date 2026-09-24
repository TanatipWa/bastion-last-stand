export type TowerKind = 'bolter' | 'flamer' | 'lascannon' | 'stasis' | 'barracks';
export type EnemyKind = 'termagant' | 'hormagaunt' | 'warrior' | 'carnifex' | 'tyrant' | 'zoanthrope' | 'ravener' | 'nest';
export type BranchId = 'hailstorm' | 'executioner' | 'inferno' | 'napalm' | 'lance' | 'prism' | 'deepfreeze' | 'widefield' | 'vanguard' | 'fireteam';
export type DoctrineId = 'cryoflame' | 'machine_spirit' | 'war_chest' | 'orbital_mastery' | 'forge_pact' | 'vengeance' | 'brotherhood' | 'heroic' | 'rapid_deployment';
export type TargetMode = 'first' | 'armor' | 'synapse';
export type Phase = 'ready' | 'combat' | 'prep' | 'won' | 'lost';
export type Point = { x: number; z: number };
export interface Tower extends Point { id: number; pad: number; kind: TowerKind; level: number; invested: number; cooldown: number; overcharge: number; target: TargetMode; aim: number; branch: BranchId|null; lastTarget: number|null; focusStacks: number; rally:Point; disabled:number }
export interface Enemy extends Point { id: number; kind: EnemyKind; path: number; progress: number; hp: number; maxHp: number; speed: number; armor: number; slow: number; slowTimer: number; shielded: boolean; facing: number; summoned: boolean; hit: number; barrier: boolean; armorCracked: boolean; burnTime: number; burnDps: number; burnSource: number|null; lastHitBy: number|null; chargePhase: 'moving'|'winding'|'charging'; chargeTimer: number; blockedBy:number|null; attackTimer:number; bossPhase:number; specialTimer:number; weakTime:number }
export interface CombatEvent { type: 'shot' | 'kill' | 'leak' | 'barrage' | 'wave' | 'build' | 'upgrade' | 'win' | 'lose' | 'armorbreak' | 'bosskill' | 'charge' | 'interrupt' | 'doctrine' | 'bonus' | 'melee' | 'heal' | 'hero' | 'acid' | 'nest' | 'objective'; x: number; z: number; toX?: number; toZ?: number; kind?: TowerKind | EnemyKind; size?: number; towerId?: number; branch?: BranchId|null }
export interface FireZone extends Point { id:number; radius:number; time:number; dps:number; towerId:number }
export interface TowerRecord { id:number; pad:number; kind:TowerKind; branch:BranchId|null; damage:number; kills:number; sold:boolean; slowSeconds:number; interrupts:number; blockedSeconds:number }
export interface Strike extends Point { timer: number }
export interface Spawn { kind: EnemyKind; path: number; time: number }
export type MapId='foundry'|'crossroads'|'wastes';
export type GameMode='campaign'|'veteran'|'endless'|'challenge';
export type HeroId='captain'|'techmarine'|'librarian';
export type LoadoutId='balanced'|'fortified'|'expedition';
export type LiveryId='crimson'|'cobalt'|'ivory';
export type AbilityId='barrage'|'overcharge'|'reinforcements'|'heroSkill';
export type Command=AbilityId|'moveHero'|'rally';
export interface RunConfig {map:MapId;mode:GameMode;hero:HeroId;loadout:LoadoutId;livery:LiveryId}
export interface MapDef {id:MapId;name:string;subtitle:string;description:string;paths:Point[][];pads:Point[];exits:number[];gateNames:string[];lockedPads:number[];objective:Point;capture:Point;mechanic:'diversion'|'gates'|'capture';palette:{ground:number;path:number;accent:number;fog:number}}
export interface Ally extends Point {id:number;kind:HeroId|'marine'|'reinforcement';owner:number|null;slot:number;hp:number;maxHp:number;destination:Point;cooldown:number;respawn:number;lifetime:number|null;engaged:number|null;facing:number;hit:number}
export interface Hero extends Ally {kind:HeroId;xp:number;level:number;damageDealt:number;kills:number}
export interface Objective extends Point {status:'offered'|'active'|'success'|'failed';hp:number;startWave:number;completedWaves:number;relic:boolean}
export interface Hazard extends Point {id:number;timer:number;radius:number;source:number}
export interface MapState {diverted:boolean;captured:boolean;captureProgress:number}
export interface BestRun {stars:number;wave:number;kills:number;score:number}
export interface Profile {version:1;medals:number;heroes:HeroId[];loadouts:LoadoutId[];liveries:LiveryId[];completed:MapId[];best:Record<string,BestRun>;rewarded:string[];honors?:Record<string,string>}
export interface GameState {phase: Phase; paused: boolean; wave: number; money: number; integrity: number; towers: Tower[]; enemies: Enemy[]; queue: Spawn[]; strikes: Strike[]; events: CombatEvent[]; elapsed: number; waveTime: number; prepTime: number; kills: number; leaks: number; leaked: Partial<Record<EnemyKind, number>>; cooldowns:Record<AbilityId,number>; speed: 1 | 2; nextId: number; doctrines:DoctrineId[]; doctrineOffers:DoctrineId[]; doctrineWave:number;doctrineRerolledWave?:number; seed:number; earlyBonus:number; vengeanceTime:number; fires:FireZone[]; records:TowerRecord[];version:2;runId:string;config:RunConfig;hero:Hero;allies:Ally[];gates:number[];objective:Objective;mapState:MapState;hazards:Hazard[];completedWaves:number;rewardMedals:number;rewardStars:number}
export interface Settings { sound: boolean; volume: number; quality: 'high' | 'low'; reducedMotion: boolean }

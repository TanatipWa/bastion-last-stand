import type { GameState, MapId } from './types';

export const HONOR_IDS = ['unbroken', 'arsenal', 'champion'] as const;
export type HonorId = typeof HONOR_IDS[number];
export const honorKey = (map: MapId, id: HonorId): string => `${map}:${id}`;

export function honorProgress(state: GameState, id: HonorId) {
  const target = id === 'unbroken' ? 10 : id === 'arsenal' ? 5 : 20;
  const value = id === 'unbroken' ? state.completedWaves
    : id === 'arsenal' ? new Set(state.towers.filter(t => t.level >= 2).map(t => t.kind)).size
    : state.hero.kills;
  const unavailable = id === 'arsenal' && state.config.mode === 'challenge';
  const failed = unavailable || (id === 'unbroken' && state.leaks > 0);
  return { value: Math.min(target, value), target, failed, unavailable,
    earned: state.phase === 'won' && state.completedWaves >= 10 && !failed && value >= target };
}

export const earnedHonors = (state: GameState): HonorId[] => HONOR_IDS.filter(id => honorProgress(state, id).earned);

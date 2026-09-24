import type { Command, GameState, Point } from './types';
import { nearestRoutePoint } from './maps';

export interface CommandPreview { valid: boolean; point: Point; reason: string }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

/** Shared by aiming and execution so snapped destinations and limits agree. */
export function previewCommand(state: GameState, command: Command, target: Point | number, towerId: number | null = null): CommandPreview {
  const tower = state.towers.find(t => t.id === (command === 'overcharge' ? target : towerId));
  const point = typeof target === 'number' ? { x: tower?.x ?? 0, z: tower?.z ?? 0 } : { ...target };
  const result = (valid: boolean, reason = '', destination = point): CommandPreview => ({ valid, reason: valid ? '' : reason, point: destination });
  if (state.paused || state.phase === 'won' || state.phase === 'lost' || state.doctrineOffers.length) return result(false, 'กลับไปเล่นก่อน');
  if (command !== 'moveHero' && command !== 'rally') {
    if (state.phase !== 'combat') return result(false, 'เริ่มเวฟก่อน');
    if (state.cooldowns[command] > 0) return result(false, `รอ ${Math.ceil(state.cooldowns[command])} วิ`);
  }
  if (command === 'overcharge') return result(!!tower && tower.kind !== 'stasis' && tower.kind !== 'barracks', 'เลือกป้อมยิง');
  if (typeof target === 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.z) || Math.abs(point.x) > 18 || point.z < (command === 'barrage' ? -12 : -11) || point.z > 12) return result(false, 'เลือกในสนามรบ');
  if (command === 'moveHero') return result(state.hero.hp > 0, 'ฮีโร่กำลังฟื้น');
  if (command === 'heroSkill') {
    if (state.hero.hp <= 0) return result(false, 'ฮีโร่กำลังฟื้น');
    return result(distance(state.hero, point) <= 7, 'ไกลจากฮีโร่เกินไป');
  }
  if (command === 'rally' || command === 'reinforcements') {
    const snapped = nearestRoutePoint(state.config.map, point);
    if (command === 'rally') return result(!!tower && tower.kind === 'barracks' && distance(snapped, tower) <= 6, 'ไกลจาก Barracks เกินไป', snapped);
    if (state.allies.filter(a => a.kind === 'reinforcement' && a.lifetime !== 0).length >= 6) return result(false, 'ทหารเสริมเต็มแล้ว', snapped);
    return result(distance(snapped, point) <= 3, 'เลือกใกล้ทางเดิน', snapped);
  }
  return result(true);
}

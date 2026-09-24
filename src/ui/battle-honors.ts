import { HONOR_IDS, honorKey, honorProgress, type HonorId } from '../game/honors';
import type { GameState, MapId, Profile } from '../game/types';
import { icon } from './visuals';

const honors: Record<HonorId, { icon: string; name: string; goal: string }> = {
  unbroken: { icon: 'shield', name: 'ไร้รอยรั่ว', goal: 'ชนะ · ศัตรูหลุด 0' },
  arsenal: { icon: 'bolter', name: 'ครบเครื่อง', goal: 'ชนะ · 5 ชนิด Lv.2+' },
  champion: { icon: 'helmet', name: 'แนวหน้า', goal: 'ชนะ · ฮีโร่กำจัด 20' },
};

export function honorCards(profile: Profile, map: MapId, state?: GameState) {
  return HONOR_IDS.map(id => {
    const h = honors[id], owner = profile.honors?.[honorKey(map, id)], p = state ? honorProgress(state, id) : null;
    const fresh = !!state && p?.earned && owner === state.runId;
    const status = fresh ? 'ใหม่ +1' : owner ? 'สะสมแล้ว ✓' : p?.earned ? 'สำเร็จ ✓' : p && state ? p.unavailable ? 'โหมดอื่น' : p.failed ? `หลุด ${state.leaks}` : p.value >= p.target ? 'ยังไม่ชนะ' : `${p.value} / ${p.target}` : '+1 เหรียญ';
    return `<div class="honor-card${owner || p?.earned ? ' is-earned' : ''}${fresh ? ' is-new' : ''}" data-honor="${id}"><span class="honor-seal">${icon(h.icon)}</span><strong>${h.name}</strong><span class="honor-goal">${h.goal}</span><b>${status}</b></div>`;
  }).join('');
}

export function honorCollection(profile: Profile, map: MapId) {
  return `<section class="honor-collection" aria-label="ตราพิชิต"><div class="honor-heading"><h3>ตราพิชิต</h3><span>${Object.keys(profile.honors ?? {}).length} / 9</span></div><div class="honor-cards">${honorCards(profile, map)}</div><p>ด่านละ 3 ตรา · รับเหรียญเมื่อทำได้ครั้งแรก</p></section>`;
}

export function honorTracker(profile: Profile, state: GameState) {
  const progress = HONOR_IDS.map(id => {
    const p = honorProgress(state, id), owned = !!profile.honors?.[honorKey(state.config.map, id)], h = honors[id];
    return { ...p, owned, h };
  });
  const summary = progress.map(p => `<span class="${p.owned ? 'is-earned' : p.failed ? 'is-failed' : ''}" title="${p.h.name}: ${p.h.goal}${p.unavailable ? ' · ใช้โหมดอื่น' : ''}" aria-label="${p.h.name}: ${p.owned ? 'สะสมแล้ว' : p.failed ? 'รอบนี้ไม่ได้' : `${p.value} จาก ${p.target}`}">${icon(p.h.icon)}<b>${p.owned ? '✓' : p.failed ? '×' : `${p.value}/${p.target}`}</b></span>`).join('');
  const detail = progress.map(p => `<div><span>${p.h.goal}</span><b>${p.owned ? '✓' : p.unavailable ? 'โหมดอื่น' : p.failed ? 'หลุดแล้ว' : `${p.value}/${p.target}`}</b></div>`).join('');
  return { summary, detail };
}

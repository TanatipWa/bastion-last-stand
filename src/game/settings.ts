import type {Settings} from './types';
export const DEFAULT_SETTINGS:Settings={sound:true,volume:.55,quality:'high',reducedMotion:false};
export function parseSettings(value:unknown):Settings {
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
 return {sound:typeof v.sound==='boolean'?v.sound:DEFAULT_SETTINGS.sound,volume:typeof v.volume==='number'&&Number.isFinite(v.volume)?Math.max(0,Math.min(1,v.volume)):DEFAULT_SETTINGS.volume,quality:v.quality==='low'?'low':'high',reducedMotion:typeof v.reducedMotion==='boolean'?v.reducedMotion:DEFAULT_SETTINGS.reducedMotion};
}
export function loadSettings():Settings {try{const raw=localStorage.getItem('bastion.settings.v1');return raw?parseSettings(JSON.parse(raw)):{...DEFAULT_SETTINGS,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches}}catch{return {...DEFAULT_SETTINGS}}}
export function saveSettings(settings:Settings){try{localStorage.setItem('bastion.settings.v1',JSON.stringify(settings))}catch{/* Storage can be unavailable in private/restricted browsing. */}}
export function saveBest(wave:number,kills:number,integrity:number){try{const raw=JSON.parse(localStorage.getItem('bastion.best.v1')??'null');if(!raw||typeof raw.kills!=='number'||kills>raw.kills)localStorage.setItem('bastion.best.v1',JSON.stringify({wave,kills,integrity}))}catch{/* Progress storage is optional. */}}

import type {BranchId,DoctrineId,GameState,Tower,TowerKind} from './types';

export const BRANCHES:Record<BranchId,{kind:TowerKind;name:string;tag:string;description:string}>={
 hailstorm:{kind:'bolter',name:'Hailstorm',tag:'SWARM SHREDDER',description:'40% faster firing cycle, 28% less damage per hit. Suppresses light infantry.'},
 executioner:{kind:'bolter',name:'Executioner',tag:'FINISHING BLOWS',description:'70% harder hits, 40% slower cycle. Deals another 60% damage below 35% enemy HP.'},
 inferno:{kind:'flamer',name:'Inferno',tag:'WIDE CONE',description:'A much wider flame cone and +0.6 range. 15% less direct damage, burns more targets.'},
 napalm:{kind:'flamer',name:'Napalm',tag:'BURNING GROUND',description:'Leaves burning pools for 3 seconds. 25% less direct damage. Enemies keep burning after leaving.'},
 lance:{kind:'lascannon',name:'Lance',tag:'PIERCING LINE',description:'Pierces every enemy along the beam. +35% damage, +1 range, 15% slower cycle.'},
 prism:{kind:'lascannon',name:'Prism',tag:'CHAIN LIGHTNING',description:'Arcs to two nearby enemies. 30% less initial damage; each bounce retains 65% damage.'},
 deepfreeze:{kind:'stasis',name:'Deep Freeze',tag:'HARD CONTROL',description:'Slows enemies by 60%, but loses 0.6 range. Bosses resist half the slow.'},
 widefield:{kind:'stasis',name:'Wide Field',tag:'AREA CONTROL',description:'+2 range, with a lighter 32% slow. Covers more approaches and interrupts charges.'},
 vanguard:{kind:'barracks',name:'Vanguard Veterans',tag:'HOLD THE LINE',description:'Three armored veterans with 80% more health, damage reduction and stronger melee attacks.'},
 fireteam:{kind:'barracks',name:'Sternguard Fireteam',tag:'RANGED SUPPORT',description:'Marines fire armor-piercing bolters at 3.5 range and can still block enemies in melee.'},
};
export const DOCTRINE_REROLL_COST = 40;
export const DOCTRINES:Record<DoctrineId,{name:string;tag:string;description:string}>={
 cryoflame:{name:'Cryo-Pyric Covenant',tag:'STASIS + FLAMER',description:'Flamers deal 20% more damage to slowed targets and leave a 4-second burn instead of 1.5 seconds.'},
 machine_spirit:{name:'Awaken the Machine',tag:'LASCANNON FOCUS',description:'Consecutive hits on the same target add 12% Lascannon damage, stacking to 60%. Changing targets resets it.'},
 war_chest:{name:'Spoils of War',tag:'KILL ECONOMY',description:'Each kill grants 20% more requisition. Reinvest the spoils in your defensive line.'},
 orbital_mastery:{name:'Orbital Supremacy',tag:'SUPPORT COMMAND',description:'Barrage recharges in 45 seconds instead of 60. Overcharge recharges in 30 instead of 40.'},
 forge_pact:{name:'Pact of the Forge',tag:'UPGRADE ECONOMY',description:'All future upgrades and specializations cost 20% less requisition.'},
 brotherhood:{name:'Battle Brothers',tag:'MARINE DEFENCE',description:'Permanent Barracks Marines gain 25% more maximum health.'},
 heroic:{name:'Heroic Advance',tag:'HERO DAMAGE',description:'Hero attacks and damaging hero skills deal 25% more damage.'},
 rapid_deployment:{name:'Rapid Deployment',tag:'REINFORCEMENTS',description:'Reinforcements recharge in 15 seconds and remain for 30 seconds of combat.'},
 vengeance:{name:'The Line Endures',tag:'LAST STAND',description:'Restore 4 gate integrity now. Each later breach boosts all tower damage by 25% for 8 seconds.'},
};
export function branchesFor(kind:TowerKind):BranchId[]{return (Object.keys(BRANCHES) as BranchId[]).filter(id=>BRANCHES[id].kind===kind)}
export function upgradeCost(t:Pick<Tower,'kind'|'level'>,doctrines:DoctrineId[]=[]){
 const base={bolter:100,flamer:150,lascannon:200,stasis:125,barracks:120}[t.kind];
 return Math.ceil(base*(t.level===1?1:1.5)*(doctrines.includes('forge_pact')?.8:1));
}
export function earlyWaveBonus(s:Pick<GameState,'phase'|'prepTime'|'doctrineOffers'>){return s.phase==='prep'&&s.doctrineOffers.length===0?Math.ceil(Math.min(20,Math.max(0,s.prepTime))*2):0}
export function offerDoctrines(s:GameState,exclude:DoctrineId[]=[]){
 const pool=(Object.keys(DOCTRINES) as DoctrineId[]).filter(id=>!s.doctrines.includes(id)&&!exclude.includes(id));
 for(let i=pool.length-1;i>0;i--){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;const j=s.seed%(i+1);[pool[i],pool[j]]=[pool[j],pool[i]]}
 return pool.slice(0,3);
}

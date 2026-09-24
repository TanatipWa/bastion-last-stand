import type { BranchId, EnemyKind, Point, Spawn, TowerKind } from './types';
export const PATHS: Point[][] = [
  [[-16,-6],[-11,-6],[-11,-1],[-5,-1],[-5,5],[4,5],[4,0],[13,0]].map(([x,z])=>({x,z})),
  [[-16,8],[-8,8],[-8,3],[-1,3],[-1,-5],[8,-5],[8,0],[13,0]].map(([x,z])=>({x,z})),
];
export const PADS: Point[] = [[-13,-3],[-8,-4],[-8,1],[-3,-3],[-3,2],[-3,7],[1,7],[2,2],[6,3],[6,-3],[10,-3],[10,3],[-12,6],[-5,-6]].map(([x,z])=>({x,z}));
export const TOWERS: Record<TowerKind,{name:string; short:string; role:string; cost:number; range:number; damage:number; interval:number; color:string; description:string}> = {
  bolter:{name:'Heavy Bolter',short:'BOLTER',role:'RAPID FIRE',cost:100,range:5,damage:14,interval:.34,color:'#dcbb7d',description:'Rapid single-target fire. Reliable against light infantry.'},
  flamer:{name:'Flamer',short:'FLAMER',role:'AREA DENIAL',cost:150,range:3.8,damage:12,interval:.38,color:'#ef8643',description:'Burns everything in a forward cone. Excels at tight corners.'},
  lascannon:{name:'Lascannon',short:'LASCANNON',role:'ARMOR PIERCING',cost:200,range:7,damage:160,interval:2.0,color:'#81d5d2',description:'Long-range, armor-piercing fire. Choose your priority target.'},
  stasis:{name:'Stasis Projector',short:'STASIS',role:'CROWD CONTROL',cost:125,range:4,damage:0,interval:1,color:'#a69be1',description:'Slows all enemies in range. Pair with damage towers.'},
  barracks:{name:'Marine Barracks',short:'BARRACKS',role:'BLOCK & HOLD',cost:120,range:6,damage:16,interval:.9,color:'#83b5ee',description:'Deploys three Marines who fight and block the road. Set their rally point near a choke. Fallen Marines respawn.'},
};
export const ENEMIES: Record<EnemyKind,{name:string;hp:number;speed:number;armor:number;leak:number;reward:number;scale:number;color:number}> = {
  termagant:{name:'Termagant',hp:85,speed:1.45,armor:0,leak:1,reward:5,scale:.6,color:0xd1b897},
  hormagaunt:{name:'Hormagaunt',hp:100,speed:2.4,armor:.05,leak:1,reward:6,scale:.7,color:0xbb9c98},
  warrior:{name:'Warrior',hp:420,speed:1.1,armor:.2,leak:2,reward:15,scale:1,color:0xb19aae},
  carnifex:{name:'Carnifex',hp:1300,speed:.72,armor:.65,leak:4,reward:25,scale:1.4,color:0xb1a38e},
  tyrant:{name:'Hive Tyrant',hp:14500,speed:.42,armor:.4,leak:20,reward:100,scale:2,color:0xc49a84},
  zoanthrope:{name:'Zoanthrope',hp:480,speed:.85,armor:.15,leak:2,reward:22,scale:1.05,color:0xc5a7d9},
  ravener:{name:'Ravener',hp:230,speed:1.45,armor:.1,leak:2,reward:14,scale:.9,color:0xc78973},
  nest:{name:'Synapse Nest',hp:700,speed:0,armor:.1,leak:0,reward:35,scale:1.15,color:0xaa80bf},
};
export const WAVE_NAMES = ['First contact','The gathering swarm','Through the breach','A will beyond reason','A second front','Living siege engines','Sever the synapse','The devouring tide','Hold at all costs','The Hive descends'];
export const WAVE_INTEL = ['Light infantry approaching the north approach. Establish your firing line.','A larger swarm. Flame weapons excel when enemies cluster.','Fast Hormagaunts detected. Stasis buys precious firing time.','Zoanthrope projects a barrier. Use SYNAPSE priority or piercing fire to break the escort.','Raveners wind up before charging. Stasis interrupts their rush; Marines can hold them in melee.','Heavy armor approaching. Lascannons punch through Carnifex carapaces.','Shield casters escort charging Raveners. Break the shield source and interrupt the charge.','Heavy armor mixed with dense infantry. Combine your defenses.','Both approaches are under attack. Prepare for the final assault.','HIVE TYRANT. Destroy its shielding nests, avoid acid warnings and strike during its vulnerable phase.'];
const COUNTS: Partial<Record<EnemyKind,number>>[] = [
 {termagant:16},{termagant:26},{termagant:15,hormagaunt:12},{termagant:25,warrior:2,zoanthrope:1},
 {termagant:30,hormagaunt:14,ravener:2},{termagant:22,carnifex:3,ravener:2},{hormagaunt:24,warrior:5,zoanthrope:2,ravener:3},
 {termagant:38,carnifex:5,warrior:3,zoanthrope:2,ravener:3},{termagant:32,hormagaunt:22,carnifex:6,warrior:5,zoanthrope:2,ravener:4},
 {tyrant:1,warrior:6,carnifex:4,termagant:25,hormagaunt:10,zoanthrope:2,ravener:3},
];
export function makeWave(wave:number): Spawn[] {
 const buckets=Object.entries(COUNTS[wave-1]??{}) as [EnemyKind,number][];
 const result:Spawn[]=[]; let i=0;
 while(buckets.some(([,count])=>count>0)) for(const bucket of buckets) if(bucket[1]>0){
  result.push({kind:bucket[0],path:wave>=5&&bucket[0]!=='tyrant'?i%2:0,time:i*(wave<4?1.25:.75)}); bucket[1]--; i++;
 }
 return result;
}
export const PATH_LENGTHS=PATHS.map(path=>path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.z-path[i].z),0));
export function pathPoint(pathIndex:number,distance:number): Point & {facing:number} {
 const path=PATHS[pathIndex]; let remaining=distance;
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(remaining<=length) return {x:a.x+(b.x-a.x)*remaining/length,z:a.z+(b.z-a.z)*remaining/length,facing:Math.atan2(b.x-a.x,b.z-a.z)};remaining-=length;}
 return {...path[path.length-1],facing:Math.PI/2};
}
export function towerStats(kind:TowerKind,level:number,branch:BranchId|null=null){
 const base=TOWERS[kind],stats={...base,damage:base.damage*[1,1.6,2.4][level-1],range:base.range+(kind==='barracks'?0:(level-1)*.35),slow:.3+(level-1)*.05};
 if(level!==3)return stats;
 switch(branch){
  case 'hailstorm':stats.interval*=.6;stats.damage*=.72;break;
  case 'executioner':stats.interval*=1.4;stats.damage*=1.7;break;
  case 'inferno':stats.range+=.6;stats.damage*=.85;break;
  case 'napalm':stats.damage*=.75;break;
  case 'lance':stats.range+=1;stats.damage*=1.35;stats.interval*=1.15;break;
  case 'prism':stats.damage*=.7;break;
  case 'deepfreeze':stats.range-=.6;stats.slow+=.2;break;
  case 'widefield':stats.range+=2;stats.slow-=.08;break;
  case 'vanguard':stats.damage*=1.15;break;
  case 'fireteam':stats.damage*=1.4;stats.interval=.85;break;
 }return stats;
}

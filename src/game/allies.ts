import type {Ally,CombatEvent,Enemy,GameState,Hero,Point,RunConfig,Tower} from './types';
import {HEROES} from './campaign';
import {getMap,nearestRoutePoint} from './maps';
import {towerStats} from './data';

const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
export type Hit=(enemy:Enemy,damage:number,piercing:boolean,source?:number|null)=>void;
export type Emit=(event:CombatEvent)=>void;

export function createHero(config:RunConfig):Hero {
 const spec=HEROES[config.hero],p=nearestRoutePoint(config.map,getMap(config.map).pads[4]);
 return {id:-1,kind:config.hero,owner:null,slot:0,...p,hp:spec.hp,maxHp:spec.hp,destination:{...p},cooldown:0,respawn:0,lifetime:null,engaged:null,facing:0,hit:0,xp:0,level:1,damageDealt:0,kills:0};
}
export function deploySquad(s:GameState,t:Tower){
 for(let slot=0;slot<3;slot++)s.allies.push({id:s.nextId++,kind:'marine',owner:t.id,slot,x:t.x,z:t.z,hp:110,maxHp:110,destination:{...t.rally},cooldown:0,respawn:0,lifetime:null,engaged:null,facing:0,hit:0});
}
function travel(a:Ally,target:Point,step:number){
 const d=distance(a,target);if(d<=.05)return;
 const n=Math.min(1,step/d);a.facing=Math.atan2(target.x-a.x,target.z-a.z);a.x+=(target.x-a.x)*n;a.z+=(target.z-a.z)*n;
}
export function updateAllies(s:GameState,dt:number,damage:Hit,emit:Emit){
 const combat=s.phase==='combat',hero=s.hero;
 s.allies=s.allies.filter(a=>(a.owner===null||s.towers.some(t=>t.id===a.owner))&&(a.lifetime===null||a.lifetime>0));
 for(const e of s.enemies){e.blockedBy=null;e.attackTimer=Math.max(0,e.attackTimer-dt)}
 for(const a of [hero,...s.allies]){
  const tower=a.owner===null?null:s.towers.find(t=>t.id===a.owner);
  const spec=a.id===-1?HEROES[hero.kind]:null;
  a.hit=Math.max(0,a.hit-dt);a.cooldown=Math.max(0,a.cooldown-dt);
  if(combat&&a.lifetime!==null)a.lifetime=Math.max(0,a.lifetime-dt);
  if(a.lifetime===0){a.hp=0;continue}
  const max=spec?spec.hp+(hero.level-1)*35:(a.kind==='reinforcement'?145:110*(1+(tower!.level-1)*.4)*(tower!.branch==='vanguard'?1.8:1)*(s.doctrines.includes('brotherhood')?1.25:1));
  if(max>a.maxHp&&a.hp>0)a.hp+=max-a.maxHp;a.maxHp=max;
  if(a.hp<=0){
   a.engaged=null;a.respawn=Math.max(0,a.respawn-dt);
   if(a.respawn===0&&a.lifetime===null){a.hp=a.maxHp;const origin=tower??nearestRoutePoint(s.config.map,getMap(s.config.map).pads[4]);a.x=origin.x;a.z=origin.z;emit({type:'heal',x:a.x,z:a.z,size:1})}
   continue;
  }
  if(tower)a.destination={x:tower.rally.x+(a.slot-1)*.45,z:tower.rally.z+(a.slot%2)*.3};
  const fireteam=tower?.branch==='fireteam',range=spec?spec.range:fireteam?3.5:1.05;
  const movingToCommand=a.id===-1&&a.engaged===null&&distance(a,a.destination)>1;
  const targets=combat&&!movingToCommand?s.enemies.filter(e=>e.hp>0&&distance(e,a.destination)<(spec?4.5:fireteam?4.2:2.5)&&distance(e,a)<range+1.5):[];
  const enemy=targets.sort((e,b)=>(e.blockedBy===null?0:1)-(b.blockedBy===null?0:1)||distance(a,e)-distance(a,b))[0];
  a.engaged=enemy?.id??null;
  if(!enemy){travel(a,a.destination,dt*(spec?.speed??2.7));a.hp=Math.min(a.maxHp,a.hp+dt*(spec?8:5));continue}
  travel(a,enemy,Math.max(0,Math.min(dt*(spec?.speed??2.7),distance(a,enemy)-(range>2?range*.85:.85))));
  const d=distance(a,enemy);a.facing=Math.atan2(enemy.x-a.x,enemy.z-a.z);
  if(d<=1.2&&enemy.kind!=='tyrant'&&enemy.kind!=='nest'&&enemy.blockedBy===null){
   enemy.blockedBy=a.id;
   const record=s.records.find(r=>r.id===a.owner);if(record)record.blockedSeconds+=dt;
   if(enemy.kind==='ravener'&&enemy.chargePhase!=='moving'){enemy.chargePhase='moving';enemy.chargeTimer=6;emit({type:'interrupt',x:enemy.x,z:enemy.z,kind:enemy.kind});if(record)record.interrupts++}
  }
  if(d<=range+.1&&a.cooldown===0){
   a.cooldown=fireteam?.85:.9;
   const amount=spec?spec.damage+(hero.level-1)*4:(tower?towerStats(tower.kind,tower.level,tower.branch).damage:20);
   damage(enemy,amount*(tower&&s.vengeanceTime>0?1.25:1)*(spec&&s.doctrines.includes('heroic')?1.25:1),a.kind==='librarian'||fireteam,a.id===-1?-1:a.owner);
   emit({type:range>2?'shot':'melee',x:a.x,z:a.z,toX:enemy.x,toZ:enemy.z,kind:range>2?'bolter':'barracks',towerId:a.owner??undefined,size:.7});
  }
  if(d<=1.35&&enemy.hp>0&&enemy.attackTimer===0&&enemy.kind!=='nest'){
   enemy.attackTimer=1.1;
   const hit=({termagant:17,hormagaunt:21,warrior:37,carnifex:85,tyrant:135,zoanthrope:23,ravener:31,nest:0}[enemy.kind])*(s.config.mode==='veteran'?1.15:1)*(tower?.branch==='vanguard'?.65:1);
   a.hp=Math.max(0,a.hp-hit);a.hit=.15;
   if(a.hp===0){a.respawn=a.id===-1?16:11;a.engaged=null;if(enemy.blockedBy===a.id)enemy.blockedBy=null;emit({type:'kill',x:a.x,z:a.z,size:.5})}
  }
 }
 if(hero.hp>0&&hero.kind==='techmarine')for(const t of s.towers)if(distance(hero,t)<4.5&&t.disabled===0)t.cooldown=Math.max(0,t.cooldown-dt*.15);
 if(s.config.map==='wastes'&&!s.mapState.captured&&hero.hp>0){
  if(distance(hero,getMap(s.config.map).capture)<1.6){s.mapState.captureProgress=Math.min(5,s.mapState.captureProgress+dt);if(s.mapState.captureProgress===5){s.mapState.captured=true;emit({type:'objective',...getMap(s.config.map).capture,size:1})}}
  else s.mapState.captureProgress=Math.max(0,s.mapState.captureProgress-dt*.5);
 }
}

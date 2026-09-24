import type { BranchId, CombatEvent, DoctrineId, Enemy, GameState, Tower, TowerKind, Point, RunConfig, AbilityId, Spawn } from './types';
import { ENEMIES, TOWERS, towerStats } from './data';
import {DEFAULT_CONFIG,LOADOUTS} from './campaign';
import {getMap,makeMissionWave,nearestRoutePoint,routeLength,routePoint} from './maps';
import {createHero,deploySquad,updateAllies} from './allies';
import { BRANCHES, earlyWaveBonus, DOCTRINE_REROLL_COST, offerDoctrines, upgradeCost } from './progression';
import { previewCommand } from './commands';

function initialState(config:RunConfig):GameState {return {version:2,runId:crypto.randomUUID(),config:{...config},hero:createHero(config),allies:[],gates:Array(getMap(config.map).gateNames.length).fill((20+LOADOUTS[config.loadout].gateBonus)/getMap(config.map).gateNames.length),objective:{...getMap(config.map).objective,status:'offered',hp:150,startWave:0,completedWaves:0,relic:false},mapState:{diverted:false,captured:false,captureProgress:0},hazards:[],completedWaves:0,rewardMedals:0,rewardStars:0,phase:'ready',paused:false,wave:0,money:LOADOUTS[config.loadout].money,integrity:20+LOADOUTS[config.loadout].gateBonus,towers:[],enemies:[],queue:[],strikes:[],events:[],elapsed:0,waveTime:0,prepTime:20,kills:0,leaks:0,leaked:{},cooldowns:{barrage:0,overcharge:0,reinforcements:0,heroSkill:0},speed:1,nextId:1,doctrines:[],doctrineOffers:[],doctrineWave:0,doctrineRerolledWave:0,seed:(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0,earlyBonus:0,vengeanceTime:0,fires:[],records:[]}}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);


export class Game {
 state:GameState;
 constructor(config:RunConfig=DEFAULT_CONFIG){this.state=initialState(config)}
 private remaining(e:Enemy){return routeLength(this.state.config.map,e.path)-e.progress}
 private get active(){return this.state.phase!=='won'&&this.state.phase!=='lost'}
 private get canCommand(){return this.active&&!this.state.paused&&this.state.doctrineOffers.length===0}
 private has(id:DoctrineId){return this.state.doctrines.includes(id)}
 private emit(event:CombatEvent){if(this.state.events.length<512)this.state.events.push(event)}

 build(pad:number,kind:TowerKind):boolean {
  const s=this.state,def=TOWERS[kind];
  if(!this.canCommand||!Number.isInteger(pad)||!getMap(s.config.map).pads[pad]||!def||s.towers.some(t=>t.pad===pad)||s.money<def.cost||(s.config.map==='wastes'&&!s.mapState.captured&&getMap(s.config.map).lockedPads.includes(pad))||(s.config.mode==='challenge'&&(!['bolter','lascannon','barracks'].includes(kind)||s.towers.length>=6)))return false;
  s.money-=def.cost;const id=s.nextId++;
  s.towers.push({id,pad,kind,...getMap(s.config.map).pads[pad],level:1,invested:def.cost,cooldown:0,overcharge:0,target:'first',aim:0,branch:null,lastTarget:null,focusStacks:0,rally:nearestRoutePoint(s.config.map,getMap(s.config.map).pads[pad]),disabled:0});
  if(kind==='barracks')deploySquad(s,s.towers.at(-1)!);
  s.records.push({id,pad,kind,branch:null,damage:0,kills:0,sold:false,slowSeconds:0,interrupts:0,blockedSeconds:0});
  this.emit({type:'build',...getMap(s.config.map).pads[pad],kind,towerId:id});return true;
 }
 upgrade(id:number,branch?:BranchId):boolean {
  const s=this.state,t=s.towers.find(t=>t.id===id);if(!this.canCommand||!t||t.level>=3)return false;
  if(t.level===2&&(!branch||BRANCHES[branch]?.kind!==t.kind))return false;
  if(t.level===1&&branch)return false;
  const cost=upgradeCost(t,s.doctrines);if(s.money<cost)return false;
  s.money-=cost;t.invested+=cost;t.level++;
  if(t.level===3){t.branch=branch!;const record=s.records.find(r=>r.id===id);if(record)record.branch=t.branch}
  this.emit({type:'upgrade',x:t.x,z:t.z,kind:t.kind,towerId:id,branch:t.branch});return true;
 }
 sell(id:number):boolean {
  const s=this.state;if(!this.canCommand||(s.phase!=='prep'&&s.phase!=='ready'))return false;
  const index=s.towers.findIndex(t=>t.id===id);if(index<0)return false;
  s.money+=Math.floor(s.towers[index].invested*.7);s.towers.splice(index,1);s.allies=s.allies.filter(a=>a.owner!==id);
  const record=s.records.find(r=>r.id===id);if(record)record.sold=true;return true;
 }
 startWave(automatic=false):boolean {
  const s=this.state;if(!this.canCommand||(s.phase!=='ready'&&s.phase!=='prep')||(s.wave>=10&&s.config.mode!=='endless'))return false;
  const bonus=automatic?0:earlyWaveBonus(s);s.money+=bonus;s.earlyBonus+=bonus;
  if(bonus)this.emit({type:'bonus',x:0,z:0,size:bonus});
  s.wave++;s.phase='combat';s.waveTime=0;s.queue=makeMissionWave(s.config,s.wave,s.mapState.diverted,s.objective.status==='active');s.prepTime=20;
  this.emit({type:'wave',x:-16,z:-6,size:s.wave});return true;
 }
 chooseDoctrine(id:DoctrineId):boolean {
  const s=this.state;
  if(s.phase!=='prep'||s.paused||!s.doctrineOffers.includes(id)||s.doctrines.includes(id))return false;
  s.doctrines.push(id);s.doctrineOffers=[];
  if(id==='rapid_deployment')s.cooldowns.reinforcements=Math.min(s.cooldowns.reinforcements,15*(s.objective.relic?.85:1));
  if(id==='vengeance')this.repairGates(4);
  if(id==='orbital_mastery'){s.cooldowns.barrage=Math.min(s.cooldowns.barrage,45);s.cooldowns.overcharge=Math.min(s.cooldowns.overcharge,30)}
  this.emit({type:'doctrine',x:0,z:0});return true;
 }
 rerollDoctrines():boolean {
  const s=this.state;
  if(s.phase!=='prep'||s.paused||s.doctrineOffers.length!==3||s.money<DOCTRINE_REROLL_COST||(s.doctrineRerolledWave??0)===s.doctrineWave||![3,6,9].includes(s.doctrineWave))return false;
  const offers=offerDoctrines(s,s.doctrineOffers);
  if(offers.length!==3)return false;
  s.money-=DOCTRINE_REROLL_COST;s.doctrineRerolledWave=s.doctrineWave;s.doctrineOffers=offers;return true;
 }
 cast(kind:AbilityId,target:Point|number):boolean {
  const s=this.state;if(!previewCommand(s,kind,target).valid)return false;
  if(kind==='reinforcements'||kind==='heroSkill')return this.castTactical(kind,target);
  if(kind==='barrage'){
   if(typeof target==='number')return false;
   s.strikes.push({...target,timer:1.5});s.cooldowns.barrage=(this.has('orbital_mastery')?45:60)*(s.objective.relic?.85:1);return true;
  }
  const t=s.towers.find(t=>t.id===target);if(!t||t.kind==='stasis'||t.kind==='barracks')return false;
  t.overcharge=6;s.cooldowns.overcharge=(this.has('orbital_mastery')?30:40)*(s.objective.relic?.85:1);this.emit({type:'upgrade',x:t.x,z:t.z,kind:t.kind,towerId:t.id});return true;
 }
 restart(config=this.state.config){this.state=initialState(config)}
 restore(state:GameState){this.state=structuredClone(state);this.state.paused=true;this.state.events=[]}

 moveHero(point:Point):boolean {
  const preview=previewCommand(this.state,'moveHero',point);if(!preview.valid)return false;
  this.state.hero.destination=preview.point;this.state.hero.engaged=null;return true;
 }
 rally(id:number,point:Point):boolean {
  const t=this.state.towers.find(t=>t.id===id),preview=previewCommand(this.state,'rally',point,id);if(!t||!preview.valid)return false;
  t.rally=preview.point;return true;
 }
 useMechanic():boolean {
  const s=this.state;if(!this.canCommand)return false;
  if(s.config.map==='wastes'&&!s.mapState.captured)return this.moveHero(getMap(s.config.map).capture);
  if(s.config.map!=='foundry'||s.phase==='combat'||s.money<25)return false;
  s.money-=25;s.mapState.diverted=!s.mapState.diverted;this.emit({type:'build',x:0,z:0,size:1});return true;
 }
 acceptObjective():boolean {
  const s=this.state;if(!this.canCommand||s.phase==='combat'||s.wave>=8||s.objective.status!=='offered')return false;
  s.objective.status='active';s.objective.startWave=s.wave+1;this.emit({type:'objective',...s.objective,size:1});return true;
 }
 retire():boolean {
  const s=this.state;if(!this.active||s.doctrineOffers.length>0||s.config.mode!=='endless'||s.completedWaves<10||s.phase!=='prep')return false;
  s.phase='won';this.emit({type:'win',x:13,z:0});return true;
 }
 private repairGates(amount:number){
  const s=this.state,cap=(20+LOADOUTS[s.config.loadout].gateBonus)/s.gates.length;
  for(const i of s.gates.map((_,i)=>i).sort((a,b)=>s.gates[a]-s.gates[b])){const heal=Math.min(amount,cap-s.gates[i]);s.gates[i]+=heal;amount-=heal;if(amount<=0)break}
  s.integrity=s.gates.reduce((a,b)=>a+b,0);
 }
 private castTactical(kind:'reinforcements'|'heroSkill',target:Point|number){
  const s=this.state;if(typeof target==='number')return false;
  if(kind==='reinforcements'){
   const p=previewCommand(s,kind,target).point;
   for(let i=0;i<2;i++)s.allies.push({id:s.nextId++,kind:'reinforcement',owner:null,slot:i,x:p.x+(i-.5)*.65,z:p.z,hp:145,maxHp:145,destination:{x:p.x+(i-.5)*.65,z:p.z},cooldown:0,respawn:0,lifetime:this.has('rapid_deployment')?30:20,engaged:null,facing:0,hit:0});
   s.cooldowns.reinforcements=(this.has('rapid_deployment')?15:25)*(s.objective.relic?.85:1);this.emit({type:'hero',...p,size:1});return true;
  }
  const tech=s.hero.kind==='techmarine',captain=s.hero.kind==='captain';
  if(captain||tech){for(const a of [s.hero,...s.allies])if(a.hp>0&&(a.id===-1||distance(a,target)<3))a.hp=Math.min(a.maxHp,a.hp+(tech?120:a.id===-1?100:60));this.emit({type:'heal',...target,size:3})}
  if(tech){for(const t of s.towers)if(distance(t,target)<4){t.disabled=0;t.overcharge=6}}
  else for(const e of s.enemies)if(e.hp>0&&distance(e,target)<3){this.damage(e,(captain?120:260)*(this.has('heroic')?1.25:1),true,-1);e.slow=Math.max(e.slow,e.kind==='tyrant'?.35:.85);e.slowTimer=Math.max(e.slowTimer,2);if(e.kind==='ravener')this.interrupt(e);if(e.kind==='tyrant')s.hazards=s.hazards.filter(h=>h.source!==e.id)}
  s.cooldowns.heroSkill=(tech?30:35)*(s.objective.relic?.85:1);this.emit({type:'hero',...target,size:3});return true;
 }
 private spawn(spawn:Spawn,progress=spawn.kind==='nest'?8:0):Enemy {
  const s=this.state,def=ENEMIES[spawn.kind],ramp=s.config.mode==='endless'?Math.min(60,Math.pow(1.2,Math.max(0,s.wave-10))):1;
  const hp=def.hp*(spawn.kind==='tyrant'?1:1+(Math.min(s.wave,10)-1)*.1)*(s.config.mode==='veteran'?1.25:1)*ramp;
  const enemy:Enemy={id:s.nextId++,kind:spawn.kind,path:spawn.path,progress,...routePoint(s.config.map,spawn.path,progress),hp,maxHp:hp,speed:def.speed*(s.config.mode==='veteran'?1.08:1),armor:def.armor,slow:0,slowTimer:0,shielded:false,summoned:false,hit:0,barrier:false,armorCracked:false,burnTime:0,burnDps:0,burnSource:null,lastHitBy:null,chargePhase:'moving',chargeTimer:6,blockedBy:null,attackTimer:0,bossPhase:1,specialTimer:7,weakTime:0};
  s.enemies.push(enemy);return enemy;
 }
 private updateBoss(e:Enemy,dt:number){
  const s=this.state;e.weakTime=Math.max(0,e.weakTime-dt);e.specialTimer-=dt;
  if(e.bossPhase===1&&e.hp/e.maxHp<=.65){
   e.bossPhase=2;e.summoned=true;
   for(const offset of [-2.6,2.6])if(s.enemies.length<118){const nest=this.spawn({kind:'nest',path:e.path,time:0},Math.max(1,Math.min(routeLength(s.config.map,e.path)-4,e.progress+offset)));this.emit({type:'nest',x:nest.x,z:nest.z,size:1})}
   for(let i=0;i<8;i++)s.queue.push({kind:'hormagaunt',path:1,time:s.waveTime+1+i*.5});s.queue.sort((a,b)=>a.time-b.time);
   this.emit({type:'charge',x:e.x,z:e.z,kind:'tyrant',size:2});
  }
  if(e.bossPhase===2&&e.hp/e.maxHp<=.3){e.bossPhase=3;e.weakTime=6;e.specialTimer=1;this.emit({type:'armorbreak',x:e.x,z:e.z,kind:'tyrant',size:3})}
  if(e.specialTimer<=0){
   e.specialTimer=e.bossPhase===3?8:12;
   const targets=s.towers.filter(t=>distance(t,e)<9&&t.disabled===0).sort((a,b)=>distance(a,e)-distance(b,e));
   const target=targets[0]??(s.hero.hp>0?s.hero:e);
   if(s.hazards.length<8)s.hazards.push({id:s.nextId++,x:target.x,z:target.z,timer:2.5,radius:2.3,source:e.id});
   this.emit({type:'charge',x:target.x,z:target.z,kind:'tyrant',size:2});
  }
 }
 private updateHazards(dt:number){
  const s=this.state;
  for(const hazard of s.hazards){
   if(!s.enemies.some(e=>e.id===hazard.source&&e.hp>0)){hazard.timer=-1;continue}
   hazard.timer-=dt;if(hazard.timer>0)continue;
   for(const t of s.towers)if(distance(t,hazard)<hazard.radius)t.disabled=Math.max(t.disabled,4);
   for(const a of [s.hero,...s.allies])if(a.hp>0&&distance(a,hazard)<hazard.radius){a.hp=Math.max(0,a.hp-65);a.hit=.2;if(a.hp===0)a.respawn=a.id===-1?16:11}
   const boss=s.enemies.find(e=>e.id===hazard.source);if(boss)boss.weakTime=4;
   this.emit({type:'acid',...hazard,size:hazard.radius});
  }
  s.hazards=s.hazards.filter(h=>h.timer>0);
 }
 private updateObjective(dt:number){
  const s=this.state,o=s.objective;if(o.status!=='active')return;
  const enemies=s.enemies.filter(e=>e.hp>0&&e.kind!=='nest'&&distance(e,o)<3).length;
  if(enemies)o.hp=Math.max(0,o.hp-dt*Math.min(5,1+enemies*.65));
  if(o.hp===0){o.status='failed';this.emit({type:'objective',...o,size:0})}
 }

 tick(dt:number):void {
  const s=this.state;if(s.paused||!this.active||s.doctrineOffers.length||!Number.isFinite(dt)||dt<=0)return;
  dt=Math.min(dt,.1);
  for(const key of Object.keys(s.cooldowns) as AbilityId[])s.cooldowns[key]=Math.max(0,s.cooldowns[key]-dt);
  if(s.phase==='ready'||s.phase==='prep'){
   updateAllies(s,dt,(...args)=>this.damage(...args),e=>this.emit(e));
   if(s.phase==='ready')return;
   s.prepTime=Math.max(0,s.prepTime-dt);if(s.prepTime===0)this.startWave(true);return;
  }
  s.elapsed+=dt;s.waveTime+=dt;s.vengeanceTime=Math.max(0,s.vengeanceTime-dt);
  this.removeDead();
  while(s.queue.length&&s.queue[0].time<=s.waveTime&&s.enemies.length<120){
   this.spawn(s.queue.shift()!);
  }
  for(const e of s.enemies){
   e.hit=Math.max(0,e.hit-dt);e.slowTimer=Math.max(0,e.slowTimer-dt);if(e.slowTimer===0)e.slow=0;
   this.updateProtection(e);
  }
  // Fields resolve before weapons, so cryo/flame combinations do not depend on build order.
  for(const t of s.towers){
   t.disabled=Math.max(0,t.disabled-dt);t.overcharge=Math.max(0,t.overcharge-dt);t.cooldown=Math.max(0,t.cooldown-dt*(t.overcharge>0?1.5:1));
   if(t.kind!=='stasis'||t.disabled>0)continue;
   const stats=towerStats(t.kind,t.level,t.branch);
   for(const e of s.enemies)if(e.hp>0&&distance(t,e)<=stats.range){
    const slow=stats.slow*(e.kind==='tyrant'?.5:1);
    if(slow>=e.slow){e.slow=slow;e.slowTimer=1;const record=s.records.find(r=>r.id===t.id);if(record)record.slowSeconds+=dt}
    if(e.kind==='ravener'&&e.chargePhase!=='moving'){this.interrupt(e);const record=s.records.find(r=>r.id===t.id);if(record)record.interrupts++}
   }
  }
  updateAllies(s,dt,(...args)=>this.damage(...args),e=>this.emit(e));
  for(const e of s.enemies)if(e.burnTime>0){const burning=Math.min(dt,e.burnTime);e.burnTime-=burning;this.damage(e,e.burnDps*burning,false,e.burnSource)}
  for(const fire of s.fires){const burning=Math.min(dt,fire.time);fire.time-=burning;for(const e of s.enemies)if(e.hp>0&&distance(fire,e)<=fire.radius){this.damage(e,fire.dps*burning,false,fire.towerId);this.ignite(e,fire.dps*.4,this.has('cryoflame')&&e.slowTimer>0?4:1.5,fire.towerId)}}
  s.fires=s.fires.filter(f=>f.time>0);
  for(const t of s.towers){
   if(t.kind==='stasis'||t.kind==='barracks'||t.disabled>0)continue;
   const stats=towerStats(t.kind,t.level,t.branch),target=this.findTarget(t,stats.range);if(!target)continue;
   t.aim=Math.atan2(target.x-t.x,target.z-t.z);if(t.cooldown>0)continue;t.cooldown=stats.interval;
   if(t.kind==='lascannon'&&this.has('machine_spirit')){t.focusStacks=t.lastTarget===target.id?Math.min(5,t.focusStacks+1):0;t.lastTarget=target.id}
   const shotDamage=stats.damage*(s.vengeanceTime>0?1.25:1)*(t.kind==='lascannon'&&this.has('machine_spirit')?1+t.focusStacks*.12:1);
   const shot=(from:Point,to:Point)=>this.emit({type:'shot',x:from.x,z:from.z,toX:to.x,toZ:to.z,kind:t.kind,size:t.level,towerId:t.id,branch:t.branch});
   const dx=target.x-t.x,dz=target.z-t.z,n=Math.hypot(dx,dz)||1;
   if(t.branch==='lance'){
    shot(t,{x:t.x+dx/n*stats.range,z:t.z+dz/n*stats.range});
    for(const e of s.enemies){const ex=e.x-t.x,ez=e.z-t.z,along=(ex*dx+ez*dz)/n;if(e.hp>0&&along>=0&&along<=stats.range&&Math.abs(ex*dz-ez*dx)/n<.65)this.damage(e,shotDamage,true,t.id)}
   }else{
    shot(t,target);
    if(t.kind==='flamer'){
     for(const e of s.enemies){const ex=e.x-t.x,ez=e.z-t.z,d=Math.hypot(ex,ez);if(e.hp>0&&d<=stats.range&&(d<.1||(dx*ex+dz*ez)/(n*d)>(t.branch==='inferno'?.2:.65))){
      const combo=this.has('cryoflame')&&e.slowTimer>0;
      this.damage(e,shotDamage*(combo?1.2:1),false,t.id);this.ignite(e,shotDamage/stats.interval*.15,combo?4:1.5,t.id);
     }}
     if(t.branch==='napalm'){
      const nearby=s.fires.find(f=>f.towerId===t.id&&distance(f,target)<.9);
      if(nearby){nearby.time=3;nearby.dps=shotDamage/stats.interval*.4}
      else {const own=s.fires.filter(f=>f.towerId===t.id);if(own.length>=3)s.fires=s.fires.filter(f=>f.id!==own[0].id);if(s.fires.length<36)s.fires.push({id:s.nextId++,x:target.x,z:target.z,radius:1.3,time:3,dps:shotDamage/stats.interval*.4,towerId:t.id})}
     }
    }else{
     this.damage(target,shotDamage*(t.branch==='executioner'&&target.hp/target.maxHp<.35?1.6:1),t.kind==='lascannon',t.id);
     if(t.branch==='prism'){
      const hit=new Set([target.id]);let previous=target,amount=shotDamage;
      for(let i=0;i<2;i++){
       const next=s.enemies.filter(e=>e.hp>0&&!hit.has(e.id)&&distance(previous,e)<=3.3).sort((a,b)=>distance(previous,a)-distance(previous,b))[0];
       if(!next)break;amount*=.65;shot(previous,next);this.damage(next,amount,true,t.id);hit.add(next.id);previous=next;
      }
     }
    }
   }
  }
  for(const strike of s.strikes){strike.timer-=dt;if(strike.timer<=0){this.emit({type:'barrage',x:strike.x,z:strike.z,size:4});for(const e of s.enemies)if(distance(strike,e)<=4){this.damage(e,480,true);if(e.kind==='ravener'&&e.chargePhase!=='moving')this.interrupt(e);if(e.kind==='tyrant')s.hazards=s.hazards.filter(h=>h.source!==e.id)}}}
  s.strikes=s.strikes.filter(strike=>strike.timer>0);this.removeDead();
  for(const e of s.enemies){
   if(e.kind==='nest'){e.specialTimer=Math.max(0,e.specialTimer-dt);if(e.specialTimer===0&&s.enemies.length<116){e.specialTimer=7;this.spawn({kind:'termagant',path:e.path,time:0},e.progress)}continue}
   if(e.kind==='tyrant')this.updateBoss(e,dt);
   let move=1;
   if(e.kind==='ravener'){
    e.chargeTimer=Math.max(0,e.chargeTimer-dt);
    if(e.chargePhase==='moving'&&e.chargeTimer===0&&e.progress>3&&e.slowTimer===0){e.chargePhase='winding';e.chargeTimer=1.8;this.emit({type:'charge',x:e.x,z:e.z,kind:e.kind})}
    else if(e.chargePhase==='winding'&&e.chargeTimer===0){e.chargePhase='charging';e.chargeTimer=2.5}
    else if(e.chargePhase==='charging'&&e.chargeTimer===0){e.chargePhase='moving';e.chargeTimer=7}
    move=e.chargePhase==='winding'?0:e.chargePhase==='charging'?3:1;
   }
   if(e.blockedBy!==null&&e.kind!=='tyrant')move=0;
   e.progress+=e.speed*(1-e.slow)*dt*move;Object.assign(e,routePoint(s.config.map,e.path,e.progress));
   if(e.progress>=routeLength(s.config.map,e.path)){
    const exit=getMap(s.config.map).exits[e.path];s.gates[exit]=Math.max(0,s.gates[exit]-ENEMIES[e.kind].leak);s.integrity=s.gates.reduce((a,b)=>a+b,0);s.leaks++;s.leaked[e.kind]=(s.leaked[e.kind]??0)+1;
    if(this.has('vengeance'))s.vengeanceTime=8;this.emit({type:'leak',x:13,z:0,kind:e.kind});
   }
  }
  s.enemies=s.enemies.filter(e=>e.progress<routeLength(s.config.map,e.path));
  this.updateHazards(dt);this.updateObjective(dt);
  if(s.gates.some(hp=>hp<=0)){s.phase='lost';this.emit({type:'lose',x:13,z:0});return}
  if(s.queue.length===0&&s.enemies.length===0){
   s.money+=50+Math.min(s.wave,20)*10;s.fires=[];s.hazards=[];s.completedWaves=s.wave;
   if(s.objective.status==='active'){s.objective.completedWaves++;if(s.objective.completedWaves>=2){s.objective.status='success';s.objective.relic=true;s.money+=100;this.emit({type:'objective',...s.objective,size:2})}}
   if(s.wave>=10&&s.config.mode!=='endless'){s.phase='won';this.emit({type:'win',x:13,z:0})}
   else {s.phase='prep';s.prepTime=20;if([3,6,9].includes(s.wave)){s.doctrineWave=s.wave;s.doctrineOffers=offerDoctrines(s)}}
  }
 }
 private findTarget(t:Tower,range:number):Enemy|undefined {
  let best:Enemy|undefined;
  for(const e of this.state.enemies){
   if(e.hp<=0||distance(t,e)>range)continue;
   if(!best){best=e;continue}
   const priority=(v:Enemy)=>t.target==='armor'?v.armor:t.target==='synapse'?(v.kind==='nest'?3:v.kind==='zoanthrope'?2:v.kind==='warrior'?1:0):0;
   if(priority(e)>priority(best)||(priority(e)===priority(best)&&this.remaining(e)<this.remaining(best)))best=e;
  }return best;
 }
 private updateProtection(e:Enemy){
  const allies=this.state.enemies;
  e.shielded=e.kind!=='warrior'&&e.kind!=='tyrant'&&allies.some(w=>w.kind==='warrior'&&w.hp>0&&distance(e,w)<=3);
  // Casters cannot protect one another; there is always an exposed counter target.
  e.barrier=e.kind==='tyrant'&&allies.some(w=>w.kind==='nest'&&w.hp>0)||e.kind!=='zoanthrope'&&e.kind!=='nest'&&allies.some(w=>w.kind==='zoanthrope'&&w.hp>0&&distance(e,w)<=3.6);
 }
 private damage(e:Enemy,amount:number,piercing:boolean,source:number|null=null){
  if(e.hp<=0)return;this.updateProtection(e);
  const damage=Math.min(e.hp,amount*(e.kind==='tyrant'&&this.state.enemies.some(n=>n.kind==='nest'&&n.hp>0)?.25:1)*(e.weakTime>0?1.5:1)*(piercing?1:1-e.armor)*(e.shielded?.8:1)*(e.barrier&&!piercing?.5:1));
  e.hp-=damage;e.hit=.12;e.lastHitBy=source;
  if(source!==null){const record=this.state.records.find(r=>r.id===source);if(record)record.damage+=damage;else if(source===-1)this.state.hero.damageDealt+=damage}
  if(piercing&&e.armor>=.2&&!e.armorCracked){e.armorCracked=true;this.emit({type:'armorbreak',x:e.x,z:e.z,kind:e.kind,size:ENEMIES[e.kind].scale})}
 }
 private ignite(e:Enemy,dps:number,duration:number,source:number){if(e.hp>0&&(e.burnTime===0||dps>=e.burnDps)){e.burnDps=dps;e.burnTime=Math.max(e.burnTime,duration);e.burnSource=source}}
 private interrupt(e:Enemy){e.chargePhase='moving';e.chargeTimer=6;this.emit({type:'interrupt',x:e.x,z:e.z,kind:e.kind})}
 private removeDead(){
  const s=this.state;
  for(const e of s.enemies)if(e.hp<=0){
   s.money+=Math.ceil(ENEMIES[e.kind].reward*(this.has('war_chest')?1.2:1));s.kills++;
   const record=s.records.find(r=>r.id===e.lastHitBy);if(record)record.kills++;if(e.lastHitBy===-1)s.hero.kills++;
   if(s.hero.hp>0&&distance(s.hero,e)<8){s.hero.xp+=e.kind==='tyrant'?100:10;const next=s.hero.level*50;if(s.hero.level<8&&s.hero.xp>=next){s.hero.xp-=next;s.hero.level++;this.emit({type:'hero',x:s.hero.x,z:s.hero.z,size:s.hero.level})}}
   this.emit({type:e.kind==='tyrant'?'bosskill':'kill',x:e.x,z:e.z,kind:e.kind,size:ENEMIES[e.kind].scale});
  }
  s.enemies=s.enemies.filter(e=>e.hp>0);
 }
}

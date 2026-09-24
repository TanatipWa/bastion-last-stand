import { describe,it,expect } from 'vitest';
import { Game } from './engine';
import { ENEMIES, pathPoint, PATH_LENGTHS } from './data';
import type { Enemy, EnemyKind } from './types';
function addEnemy(g:Game,kind:EnemyKind='termagant',progress=10,path=0):Enemy {
 const d=ENEMIES[kind];const e:Enemy={id:g.state.nextId++,kind,path,progress,hp:d.hp,maxHp:d.hp,speed:d.speed,armor:d.armor,slow:0,slowTimer:0,shielded:false,...pathPoint(path,progress),summoned:false,hit:0};g.state.enemies.push(e);return e;
}
const advance=(g:Game,seconds:number)=>{for(let i=0;i<Math.round(seconds*60);i++)g.tick(1/60)};
describe('command validation and economy',()=>{
 it('charges only for a valid free pad and affordable tower',()=>{const g=new Game();expect(g.build(0,'bolter')).toBe(true);expect(g.state.money).toBe(150);expect(g.build(0,'flamer')).toBe(false);expect(g.build(1,'lascannon')).toBe(false);expect(g.build(99,'bolter')).toBe(false);expect(g.state.money).toBe(150);expect(g.state.towers).toHaveLength(1)});
 it('upgrades retain the shot timer and selling returns 70% of total invested',()=>{const g=new Game();g.build(0,'bolter');const t=g.state.towers[0];t.cooldown=.2;expect(g.upgrade(t.id)).toBe(true);expect(t.level).toBe(2);expect(t.cooldown).toBe(.2);expect(g.state.money).toBe(50);expect(g.sell(t.id)).toBe(true);expect(g.state.money).toBe(190);expect(g.state.towers).toHaveLength(0)});
 it('rejects selling in combat and freezes commands after defeat',()=>{const g=new Game();g.build(0,'bolter');g.startWave();expect(g.sell(g.state.towers[0].id)).toBe(false);g.state.phase='lost';expect(g.build(1,'bolter')).toBe(false);expect(g.upgrade(g.state.towers[0].id)).toBe(false)});
});
describe('combat progression',()=>{
 it('a stronger stasis slow expires after leaving its field even inside a weaker field',()=>{
  const g=new Game();g.state.money=1000;
  g.build(2,'stasis');g.upgrade(g.state.towers[0].id);g.upgrade(g.state.towers[0].id);g.build(4,'stasis');
  g.startWave();g.state.queue=[];
  const e=addEnemy(g,'termagant',19);e.speed=0;
  g.tick(1/60);expect(e.slow).toBeCloseTo(.4);
  e.progress=25;Object.assign(e,pathPoint(0,e.progress));
  advance(g,.5);expect(e.slow).toBeCloseTo(.4);
  advance(g,.6);expect(e.slow).toBeCloseTo(.3);
  advance(g,1);expect(e.slow).toBeCloseTo(.3);
 });
 it('a pending barrage freezes through prep then resolves during the next wave',()=>{
  const g=new Game();g.startWave();g.state.queue=[];
  addEnemy(g,'termagant',PATH_LENGTHS[0]-.001);
  const target=pathPoint(0,8);
  expect(g.cast('barrage',target)).toBe(true);
  g.tick(1/60);expect(g.state.phase).toBe('prep');expect(g.state.strikes).toHaveLength(1);
  const remaining=g.state.strikes[0].timer,cooldown=g.state.cooldowns.barrage;
  advance(g,5);
  expect(g.state.strikes[0].timer).toBe(remaining);expect(g.state.cooldowns.barrage).toBe(cooldown);
  g.startWave();g.state.queue=[{kind:'termagant',path:0,time:100}];
  const e=addEnemy(g,'termagant',8);e.speed=0;
  advance(g,1);expect(g.state.kills).toBe(0);expect(g.state.strikes).toHaveLength(1);
  advance(g,.6);expect(g.state.kills).toBe(1);expect(g.state.strikes).toHaveLength(0);
  expect(g.state.cooldowns.barrage).toBeCloseTo(cooldown-1.6);
 });
 it('spawns the first wave and freezes enemies and cooldowns on pause',()=>{const g=new Game();expect(g.startWave()).toBe(true);advance(g,1);expect(g.state.enemies.length).toBeGreaterThan(0);g.state.cooldowns.barrage=30;g.state.paused=true;const before=JSON.stringify(g.state);advance(g,5);expect(JSON.stringify(g.state)).toBe(before)});
 it('an enemy reaching the gate leaks exactly once and ends the cleared wave',()=>{const g=new Game();g.startWave();g.state.queue=[];addEnemy(g,'warrior',PATH_LENGTHS[0]-.001);advance(g,.1);expect(g.state.integrity).toBe(18);expect(g.state.leaks).toBe(1);expect(g.state.enemies).toHaveLength(0);expect(g.state.phase).toBe('prep');expect(g.state.money).toBe(310)});
 it('damage kills once and pays a single bounty even under overlapping fire',()=>{const g=new Game();g.state.money=1000;g.build(0,'bolter');g.build(1,'bolter');g.startWave();g.state.queue=[];const e=addEnemy(g,'termagant',7);e.hp=1;advance(g,.3);expect(g.state.kills).toBe(1);expect(g.state.money).toBe(865);expect(g.state.enemies).toHaveLength(0)});
 it('applies synapse only to nearby lesser creatures and removes it immediately when the source dies',()=>{const g=new Game();g.startWave();g.state.queue=[{kind:'termagant',path:0,time:100}];const e=addEnemy(g,'termagant',8);const w=addEnemy(g,'warrior',9);advance(g,.1);expect(e.shielded).toBe(true);expect(w.shielded).toBe(false);w.hp=0;advance(g,.1);expect(e.shielded).toBe(false)});
 it('stasis uses the strongest slow rather than stacking and reduces effect on bosses',()=>{const g=new Game();g.state.money=1000;g.build(0,'stasis');g.build(1,'stasis');g.upgrade(g.state.towers[0].id);g.startWave();g.state.queue=[];const e=addEnemy(g,'termagant',7);const boss=addEnemy(g,'tyrant',7);advance(g,.1);expect(e.slow).toBeCloseTo(.35);expect(boss.slow).toBeCloseTo(.175)});
 it('barrage is delayed, consumes a cooldown and cannot be double cast',()=>{const g=new Game();g.startWave();g.state.queue=[{kind:'termagant',path:0,time:100}];const e=addEnemy(g,'termagant',8);e.speed=0;expect(g.cast('barrage',{x:e.x,z:e.z})).toBe(true);expect(g.cast('barrage',{x:e.x,z:e.z})).toBe(false);advance(g,1);expect(g.state.kills).toBe(0);advance(g,1);expect(g.state.kills).toBe(1);expect(g.state.cooldowns.barrage).toBeGreaterThan(57)});
 it('overcharge only accepts an attack tower and cooldown does not recharge in prep',()=>{const g=new Game();g.build(0,'stasis');g.build(1,'bolter');g.startWave();expect(g.cast('overcharge',g.state.towers[0].id)).toBe(false);expect(g.cast('overcharge',g.state.towers[1].id)).toBe(true);expect(g.state.towers[1].overcharge).toBe(6);g.state.phase='prep';advance(g,2);expect(g.state.cooldowns.overcharge).toBe(40)});
 it('boss calls twelve reinforcements exactly once at half health',()=>{const g=new Game();g.state.wave=9;g.startWave();g.state.queue=[];const e=addEnemy(g,'tyrant',0);e.hp=e.maxHp*.49;advance(g,.1);expect(e.summoned).toBe(true);expect(g.state.queue.length+g.state.enemies.length).toBe(13);advance(g,.1);expect(g.state.queue.length+g.state.enemies.length).toBe(13)});
 it('a defeated final boss wins, but a final boss reaching the gate loses first',()=>{const won=new Game();won.state.wave=9;won.startWave();won.state.queue=[];const boss=addEnemy(won,'tyrant');boss.hp=0;advance(won,.1);expect(won.state.phase).toBe('won');const lost=new Game();lost.state.wave=9;lost.startWave();lost.state.queue=[];addEnemy(lost,'tyrant',PATH_LENGTHS[0]-.001);advance(lost,.1);expect(lost.state.phase).toBe('lost');expect(lost.state.integrity).toBe(0)});
 it('restart clears all combat and economy state',()=>{const g=new Game();g.build(0,'bolter');g.startWave();advance(g,1);g.restart();expect(g.state.phase).toBe('ready');expect(g.state.money).toBe(250);expect(g.state.wave).toBe(0);expect(g.state.enemies).toHaveLength(0);expect(g.state.towers).toHaveLength(0)});
});

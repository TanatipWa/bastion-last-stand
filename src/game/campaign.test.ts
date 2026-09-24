import { it, expect } from 'vitest';
import { Game } from './engine';
import type { TowerKind } from './types';

// This strategy uses the same validated commands and starting resources as a player.
export function playCampaign(){
 const g=new Game();const snapshots:object[]=[];
 const order:[number,TowerKind][]=[[2,'bolter'],[4,'flamer'],[7,'stasis'],[9,'lascannon'],[8,'bolter'],[10,'lascannon'],[6,'flamer'],[11,'bolter'],[3,'lascannon'],[1,'bolter'],[5,'stasis'],[0,'bolter'],[12,'flamer'],[13,'lascannon']];
 let purchases=0,steps=0;
 function invest(){
  if(g.state.wave>=5)for(const t of g.state.towers)if(t.kind==='lascannon'&&t.level<3)g.upgrade(t.id);
  while(purchases<order.length&&g.build(...order[purchases]))purchases++;
  if(purchases>=5)for(const t of [...g.state.towers].sort((a,b)=>a.level-b.level))if(t.kind!=='stasis')g.upgrade(t.id);
  for(const t of g.state.towers)if(t.kind==='lascannon')t.target='armor';
 }
 while(!['won','lost'].includes(g.state.phase)&&steps<120000){
  if(g.state.phase==='ready'||g.state.phase==='prep'){
   if(g.state.wave>0)snapshots.push({wave:g.state.wave,hp:g.state.integrity,money:g.state.money,kills:g.state.kills,time:Math.round(g.state.elapsed)});
   invest();g.startWave();
  }
  if(steps%60===0){
   invest();
   const enemies=g.state.enemies;
   if(enemies.length>5){const cluster=enemies[Math.floor(enemies.length/2)];g.cast('barrage',{x:cluster.x,z:cluster.z})}
   const tower=g.state.towers.find(t=>t.kind==='lascannon')??g.state.towers[0];if(tower&&enemies.length>0)g.cast('overcharge',tower.id);
  }
  g.tick(1/60);g.state.events.length=0;steps++;
 }
 return {g,snapshots};
}
it('a mixed defense can complete all ten waves with legitimate starting funds',()=>{const {g,snapshots}=playCampaign();console.log('Campaign balance:',JSON.stringify({snapshots,result:g.state.phase,hp:g.state.integrity,wave:g.state.wave,kills:g.state.kills,seconds:Math.round(g.state.elapsed)}));expect(g.state.phase).toBe('won');expect(g.state.wave).toBe(10);expect(g.state.integrity).toBeGreaterThan(0)});
it('an undefended campaign ends in defeat and can restart cleanly',()=>{const g=new Game();g.startWave();for(let i=0;i<20000&&g.state.phase!=='lost';i++)g.tick(1/60);expect(g.state.phase).toBe('lost');g.restart();expect(g.state.integrity).toBe(20);expect(g.state.money).toBe(250);expect(g.state.wave).toBe(0)});

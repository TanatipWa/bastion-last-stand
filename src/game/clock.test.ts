import {it,expect} from 'vitest';
import {FixedClock} from './clock';
import {Game} from './engine';
it('30/60/120Hz rendering produces identical game state after the same simulated time',()=>{
 const outcomes=[30,60,120].map(fps=>{const clock=new FixedClock(),g=new Game();g.build(2,'bolter');g.startWave();for(let i=0;i<fps*10;i++)clock.advance(1/fps,1,()=>g.tick(1/60));return {elapsed:g.state.elapsed,money:g.state.money,kills:g.state.kills,enemies:g.state.enemies.map(e=>({id:e.id,hp:e.hp,progress:e.progress}))}});
 expect(outcomes[0].elapsed).toBeCloseTo(10);expect(outcomes[1]).toEqual(outcomes[0]);expect(outcomes[2]).toEqual(outcomes[0]);
});
it('2x doubles simulation steps and reset drops only the partial timestep',()=>{const c=new FixedClock();let steps=0;c.advance(1/60,2,()=>steps++);expect(steps).toBe(2);c.advance(1/120,1,()=>steps++);c.reset();c.advance(1/120,1,()=>steps++);expect(steps).toBe(2)});

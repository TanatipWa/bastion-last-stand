export class FixedClock {
 private accumulator=0;
 reset(){this.accumulator=0}
 advance(delta:number,speed:number,step:()=>void){
  if(!Number.isFinite(delta)||delta<=0)return;
  this.accumulator+=Math.min(delta,.1)*speed;
  while(this.accumulator+1e-10>=1/60){step();this.accumulator-=1/60}
 }
}

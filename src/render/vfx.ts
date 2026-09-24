import * as THREE from 'three';
import type { CombatEvent, GameState, MapDef } from '../game/types';
import { geometry, materials } from './models';

// Presentation only: events never feed back into damage, targeting or saved state.
type Kind = 'glow' | 'smoke' | 'spark' | 'muzzle';
interface Particle {
  kind: Kind; life: number; total: number; delay: number; size: number; alpha: number;
  x: number; y: number; z: number; vx: number; vy: number; vz: number; tint: THREE.Color; turn: number;
}
interface Decal { life: number; x: number; z: number; size: number; turn: number }
interface Batch { mesh: THREE.InstancedMesh; tint: THREE.InstancedBufferAttribute; count: number }
interface Casing {life:number;x:number;y:number;z:number;vx:number;vz:number;spin:number}
const CAPACITY = 320, DECAL_CAPACITY = 24, CASING_CAPACITY = 48;
const vertex = `attribute vec4 tint; varying vec2 vUv; varying vec4 vTint;
void main(){vUv=uv;vTint=tint;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`;
const fragment = `uniform float style; varying vec2 vUv; varying vec4 vTint;
void main(){
 vec2 p=vUv*2.0-1.0; float r=length(p); float a;
 if(style<0.5){a=pow(max(0.0,1.0-r),2.4);}
 else if(style<1.5){
  float cloud=0.84+0.12*sin(p.x*13.0+sin(p.y*9.0))+0.04*cos(p.y*23.0);
  a=(1.0-smoothstep(0.15,1.0,r*cloud))*0.7;
 }else if(style<2.5){a=pow(max(0.0,1.0-abs(p.x)-abs(p.y)),1.3);}
 else if(style>3.5){
  float star=pow(max(0.0,1.0-abs(p.x)*3.0-abs(p.y)),2.0)+pow(max(0.0,1.0-abs(p.y)*4.0-abs(p.x)),2.0);
  a=min(1.0,star+pow(max(0.0,1.0-r),3.0));
 }else{
  float edge=0.91+0.08*sin(atan(p.y,p.x)*11.0)+0.04*sin(p.x*31.0+p.y*19.0);
  a=(1.0-smoothstep(0.25,1.0,r/edge))*(0.75+0.25*sin(p.x*25.0)*sin(p.y*21.0));
 }
 gl_FragColor=vec4(vTint.rgb,vTint.a*a);
 #include <colorspace_fragment>
}`;

function batch(style: number, capacity: number): Batch {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  tint.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('tint', tint);
  const material = new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:{style:{value:style}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:style===0||style===2||style===4?THREE.AdditiveBlending:THREE.NormalBlending});
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.renderOrder=style===3?1:style===1?3:4;
  return {mesh,tint,count:0};
}

// Use the same origin for the tracer and its flash, including chained Prism hits.
export function shotOrigin(e:CombatEvent,state:GameState){
  const source=state.towers.find(t=>t.id===e.towerId);
  const atTower=source&&Math.hypot(source.x-e.x,source.z-e.z)<.1;
  const dx=(e.toX??e.x)-e.x,dz=(e.toZ??e.z)-e.z,len=Math.hypot(dx,dz)||1;
  const extension=e.kind==='lascannon'?(e.branch==='lance'?2.24:1.65):e.branch==='executioner'?1.7:e.branch==='hailstorm'?1.43:1.12;
  const muzzle=atTower?Math.min(len*.9,extension*(1+(source.level-1)*.065)):0;
  return {x:e.x+dx/len*muzzle,z:e.z+dz/len*muzzle,y:atTower? .32+1.15*(1+(source.level-1)*.065):.75};
}

export class BattlefieldVfx {
  readonly root=new THREE.Group();
  private particles:Particle[]=Array.from({length:CAPACITY},()=>({kind:'glow',life:0,total:1,delay:0,size:1,alpha:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,tint:new THREE.Color(),turn:0}));
  private decals:Decal[]=Array.from({length:DECAL_CAPACITY},()=>({life:0,x:0,z:0,size:1,turn:0}));
  private batches={glow:batch(0,CAPACITY),smoke:batch(1,CAPACITY),spark:batch(2,CAPACITY),muzzle:batch(4,CAPACITY)};
  private stains=batch(3,DECAL_CAPACITY);
  private casings:Casing[]=Array.from({length:CASING_CAPACITY},()=>({life:0,x:0,y:0,z:0,vx:0,vz:0,spin:0}));
  private casingMesh=new THREE.InstancedMesh(geometry.cylinder,materials.bronze,CASING_CAPACITY);
  private casingIndex=0;
  private lights=Array.from({length:2},()=>({light:new THREE.PointLight(0xffa15a,0,8,2),life:0,total:.4,power:0}));
  private dummy=new THREE.Object3D();
  private high=true;
  private reduced=false;
  private sequence=0;
  private decalIndex=0;
  private exhaust:{x:number;y:number;z:number}[]=[];
  private exhaustClock=0;
  private mapId='';
  private seen:Record<string,number>={};
  constructor(){
    for(const b of Object.values(this.batches))this.root.add(b.mesh);
    this.casingMesh.count=0;this.casingMesh.frustumCulled=false;this.casingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(this.casingMesh);
    this.root.add(this.stains.mesh);for(const l of this.lights)this.root.add(l.light);
  }
  configure(high:boolean,reduced:boolean){this.high=high;this.reduced=reduced;if(!high||reduced){for(const c of this.casings)c.life=0;this.casingMesh.count=0;}for(const l of this.lights){l.light.visible=high&&!reduced;if(reduced)l.light.intensity=0;}}
  setMap(map:MapDef,vents:{x:number;y:number;z:number}[]){this.mapId=map.id;this.exhaust=vents;this.exhaustClock=0;}
  private noise(n:number){const value=Math.sin(n*127.1+this.sequence*31.7)*43758.5453;return value-Math.floor(value);}
  private emit(kind:Kind,x:number,y:number,z:number,color:number,size:number,life:number,alpha:number,vx=0,vy=0,vz=0,delay=0){
    const limit=this.reduced?64:this.high?CAPACITY:110;
    // Reuse a fixed pool; cosmetic saturation drops particles instead of growing memory.
    let p:Particle|undefined;for(let i=0;i<limit;i++)if(this.particles[i].life<=0){p=this.particles[i];break;}
    if(!p)return;
    Object.assign(p,{kind,x,y,z,size,life,total:life,alpha,delay,vx,vy,vz,turn:this.noise(x+z)*Math.PI*2});p.tint.setHex(color);
  }
  private glow(x:number,y:number,z:number,color:number,size:number,life=.22,delay=0){this.emit('glow',x,y,z,color,size,life,this.reduced?.48:.95,0,0,0,delay);}
  private sparks(x:number,y:number,z:number,color:number,count:number,power=1,delay=0){
    if(this.reduced)return;
    for(let i=0;i<(this.high?count:Math.ceil(count*.45));i++){
      const a=this.noise(i+1)*Math.PI*2,speed=(.6+this.noise(i+4)*1.8)*power;
      this.emit('spark',x,y,z,color,.1+this.noise(i+8)*.1,.22+this.noise(i+9)*.35,.95,Math.sin(a)*speed,1.3+this.noise(i+12)*2.4,Math.cos(a)*speed,delay);
    }
  }
  private smoke(x:number,y:number,z:number,size:number,count=2){
    if(this.reduced||!this.high)return;
    for(let i=0;i<count;i++)this.emit('smoke',x+(this.noise(i+8)-.5)*.4,y,z+(this.noise(i+4)-.5)*.4,0x8d8b85,size,1.2+this.noise(i)*.65,.18,.12+this.noise(i+2)*.12,.65+this.noise(i+3)*.3,.1,.12+i*.13);
  }
  private scorch(x:number,z:number,size:number){const d=this.decals[this.decalIndex++%DECAL_CAPACITY];Object.assign(d,{life:10,x,z,size,turn:this.noise(x+z)*6});}
  private flash(x:number,z:number,color:number,power:number){
    if(!this.high||this.reduced)return;const l=this.lights.find(l=>l.life<=0)??this.lights[0];
    l.life=l.total=.38;l.power=power;l.light.position.set(x,1.8,z);l.light.color.setHex(color);
  }
  event(e:CombatEvent,state:GameState){
    this.sequence++;const key=e.type==='shot'?`shot:${e.kind}`:e.type;this.seen[key]=(this.seen[key]??0)+1;
    const tx=e.toX??e.x,tz=e.toZ??e.z;
    if(e.type==='shot'&&e.kind!=='stasis'){
      const {x,y,z}=shotOrigin(e,state);
      if(!this.reduced)this.emit('muzzle',x,y,z,e.kind==='lascannon'?0xc6f9ff:0xffe3a1,e.kind==='flamer'?.52:.74,.09,.95);
      if(e.kind==='bolter'&&this.high&&!this.reduced){
        const tower=state.towers.find(t=>t.id===e.towerId);
        if(tower){const sideX=Math.cos(tower.aim),sideZ=-Math.sin(tower.aim),c=this.casings[this.casingIndex++%CASING_CAPACITY];Object.assign(c,{life:1.25,x:tower.x+sideX*.58,y:1.45,z:tower.z+sideZ*.58,vx:sideX*(1+this.noise(3)),vz:sideZ*(1+this.noise(5)),spin:this.noise(7)*6});}
      }
      if(e.kind==='lascannon'){
        const color=e.branch==='prism'?0xb9a0ff:0x65efff;
        this.glow(x,y,z,color,.95,.19);this.glow(tx,.72,tz,color,1.45,.3);
        this.sparks(tx,.65,tz,color,6,.8);this.scorch(tx,tz,.65);
      }else if(e.kind==='flamer'){
        this.glow(x,y,z,0xffa348,.85,.23);this.glow(tx,.5,tz,0xff7727,1.5,.4);
        this.sparks(tx,.45,tz,0xffb15d,3,.65);this.smoke(tx,.7,tz,1.1,1);
      }else{
        this.glow(x,y,z,0xffd497,e.branch==='executioner'?.85:.63,.1);
        this.glow(tx,.65,tz,0xffb960,.6,.18,.09);this.sparks(tx,.65,tz,0xffc585,3,.75,.09);
      }
    }else if(e.type==='barrage'||e.type==='bosskill'){
      const boss=e.type==='bosskill',color=boss?0xc399ff:0xffac59;
      this.glow(e.x,.6,e.z,color,boss?7:6,.45);this.flash(e.x,e.z,color,36);
      this.sparks(e.x,.5,e.z,boss?0xe0bbff:0xffc287,this.high?28:12,2.3);
      this.smoke(e.x,.4,e.z,2.4,5);this.scorch(e.x,e.z,boss?4.6:4.2);
    }else if(e.type==='kill'){
      if((e.size??1)>1.4){this.smoke(e.x,.3,e.z,1.2,1);this.scorch(e.x,e.z,.8);}
    }else if(e.type==='hero'||e.type==='heal'){
      const color=e.type==='heal'?0x8effbf:state.hero.kind==='librarian'?0xb69aff:state.hero.kind==='techmarine'?0x80e9ff:0xffd087;
      this.glow(e.x,.45,e.z,color,3.8,.65);this.sparks(e.x,.3,e.z,color,12,1.1);
    }else if(e.type==='build'||e.type==='upgrade'){
      this.glow(e.x,.5,e.z,0xffcf7e,2.3,.5);this.sparks(e.x,.4,e.z,0xffdf9e,9,.85);
    }else if(e.type==='armorbreak'||e.type==='interrupt'){
      this.glow(e.x,.75,e.z,0x91eaff,1.5,.3);this.sparks(e.x,.65,e.z,0xb0f4ff,8,1.1);
    }else if(e.type==='acid'){
      this.glow(e.x,.25,e.z,0xc0e881,Math.max(2,e.size??2),.45);
    }
  }
  update(dt:number,camera:THREE.Camera){
    let cases=0;
    for(const c of this.casings){
      if(c.life<=0)continue;c.life=Math.max(0,c.life-dt);if(c.life<=0)continue;
      const age=1.25-c.life,flight=Math.min(age,.68),bounce=age>.68?Math.max(0,Math.sin((age-.68)*13))*.075*Math.max(0,1-(age-.68)*2):0;
      this.dummy.position.set(c.x+c.vx*flight,Math.max(.22,c.y+1.2*age-4.5*age*age)+bounce,c.z+c.vz*flight);
      this.dummy.rotation.set(c.spin+flight*9,c.spin,Math.PI/2+flight*5);
      const fade=Math.min(1,c.life/.18);this.dummy.scale.set(.04*fade,.14*fade,.04*fade);this.dummy.updateMatrix();this.casingMesh.setMatrixAt(cases++,this.dummy.matrix);
    }
    this.casingMesh.count=cases;this.casingMesh.instanceMatrix.needsUpdate=true;
    this.exhaustClock+=dt;
    if(this.high&&!this.reduced&&this.exhaustClock>.55){
      this.exhaustClock=0;for(const p of this.exhaust)this.emit('smoke',p.x,p.y,p.z,0x737b80,1.25,2.8,.19,.24,.85,.08);
    }
    for(const b of Object.values(this.batches))b.count=0;
    for(const p of this.particles){
      if(p.life<=0)continue;
      if(p.delay>0){p.delay-=dt;continue;}
      p.life-=dt;if(p.life<=0)continue;
      if(this.reduced&&p.kind!=='glow')continue;
      if(!this.high&&p.kind==='smoke')continue;
      const age=p.total-p.life,t=age/p.total,b=this.batches[p.kind];
      const y=p.y+p.vy*age-(p.kind==='spark'?4*age*age:0);
      this.dummy.position.set(p.x+p.vx*age,Math.max(.17,y),p.z+p.vz*age);
      this.dummy.quaternion.copy(camera.quaternion);this.dummy.rotateZ(p.turn+(p.kind==='smoke'?t*.25:0));
      const size=p.size*(p.kind==='smoke'?1+t*1.7:p.kind==='glow'?1+t*.4:1);
      this.dummy.scale.set(size,p.kind==='spark'?size*2.8:size,1);this.dummy.updateMatrix();
      const alpha=p.alpha*(p.kind==='smoke'?Math.sin(Math.PI*t):1-t);
      b.mesh.setMatrixAt(b.count,this.dummy.matrix);b.tint.setXYZW(b.count++,p.tint.r,p.tint.g,p.tint.b,alpha);
    }
    for(const b of Object.values(this.batches)){b.mesh.count=b.count;b.mesh.instanceMatrix.needsUpdate=true;b.tint.needsUpdate=true;}
    this.stains.count=0;
    for(const d of this.decals){
      if(d.life<=0)continue;d.life-=dt;if(d.life<=0)continue;
      this.dummy.position.set(d.x,.151,d.z);this.dummy.rotation.set(-Math.PI/2,0,d.turn);this.dummy.scale.set(d.size,d.size,1);this.dummy.updateMatrix();
      const i=this.stains.count++;this.stains.mesh.setMatrixAt(i,this.dummy.matrix);this.stains.tint.setXYZW(i,.025,.021,.02,Math.min(1,d.life/3)*.42);
    }
    this.stains.mesh.count=this.stains.count;this.stains.mesh.instanceMatrix.needsUpdate=true;this.stains.tint.needsUpdate=true;
    for(const l of this.lights){l.life=Math.max(0,l.life-dt);l.light.intensity=l.power*(l.life/l.total)**2;}
  }
  reset(){for(const c of this.casings)c.life=0;this.casingMesh.count=0;this.casingIndex=0;for(const p of this.particles)p.life=0;for(const d of this.decals)d.life=0;for(const b of [...Object.values(this.batches),this.stains])b.mesh.count=0;for(const l of this.lights){l.life=0;l.light.intensity=0;}this.exhaustClock=0;this.seen={};}
  get diagnostics(){return {casings:this.casingMesh.count,casingCapacity:CASING_CAPACITY,muzzleFlashes:this.batches.muzzle.count,particles:Object.values(this.batches).reduce((sum,b)=>sum+b.count,0),particleCapacity:CAPACITY,scorches:this.stains.count,scorchCapacity:DECAL_CAPACITY,vfxEvents:{...this.seen},atmosphere:this.mapId,smokeParticles:this.batches.smoke.count,impactLights:this.lights.filter(l=>l.light.visible&&l.light.intensity>0).length,graphicsQuality:this.high?'high':'low',reducedMotion:this.reduced};}
}

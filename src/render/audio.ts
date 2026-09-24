import type {CombatEvent,Settings} from '../game/types';

/** Original synthesized battlefield score and effects; no network or audio assets. */
export class AudioSystem {
 private context:AudioContext|null=null;
 private master:GainNode|null=null;
 private ambience:GainNode|null=null;
 private noise:AudioBuffer|null=null;
 private last=new Map<string,number>();
 private voices=0;
 private settings:Settings;
 constructor(settings:Settings){this.settings=settings}
 async unlock(){
  try{
   if(!this.context){
    this.context=new AudioContext();this.master=this.context.createGain();this.master.connect(this.context.destination);
    this.noise=this.context.createBuffer(1,this.context.sampleRate,this.context.sampleRate);
    const data=this.noise.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+(Math.random()*2-1)*.02)/1.02;data[i]=last*3.5}
    this.ambience=this.context.createGain();this.ambience.gain.value=.22;this.ambience.connect(this.master);
    for(const [i,f] of [55,82.41,110.12].entries()){
     const osc=this.context.createOscillator(),gain=this.context.createGain();osc.type='sine';osc.frequency.value=f;gain.gain.value=.022/(i+1);osc.connect(gain);gain.connect(this.ambience);osc.start();
    }
   }
   this.configure(this.settings);await this.context.resume();
  }catch{/* The game remains playable when browser audio is unavailable. */}
 }
 configure(settings:Settings){this.settings=settings;if(this.context&&this.master)this.master.gain.setTargetAtTime(settings.sound?settings.volume:0,this.context.currentTime,.05)}
 setPaused(paused:boolean){if(this.context&&this.ambience)this.ambience.gain.setTargetAtTime(paused?.06:.22,this.context.currentTime,.5)}
 command(accepted:boolean){
  const ctx=this.context;if(!ctx||ctx.state!=='running'||!this.settings.sound)return;
  if(ctx.currentTime-(this.last.get('command')??-100)<.12)return;this.last.set('command',ctx.currentTime);
  this.tone(accepted?540:190,accepted?720:120,.09,.045,'sine');
  if(accepted)this.tone(810,940,.1,.025,'sine',.065);
 }
 private tone(freq:number,end:number,duration:number,gain:number,type:OscillatorType='sine',delay=0){
  const ctx=this.context;if(!ctx||!this.master||this.voices>=64)return;const t=ctx.currentTime+delay;this.voices++;
  const osc=ctx.createOscillator(),env=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);env.gain.setValueAtTime(.001,t);env.gain.linearRampToValueAtTime(gain,t+.008);env.gain.exponentialRampToValueAtTime(.001,t+duration);osc.connect(env);env.connect(this.master);osc.start(t);osc.stop(t+duration+.02);osc.onended=()=>{osc.disconnect();env.disconnect();this.voices--};
 }
 private burst(duration:number,gain:number,frequency:number){
  const ctx=this.context;if(!ctx||!this.master||!this.noise||this.voices>=64)return;const t=ctx.currentTime;this.voices++;
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),env=ctx.createGain();source.buffer=this.noise;filter.type='lowpass';filter.frequency.value=frequency;env.gain.setValueAtTime(gain,t);env.gain.exponentialRampToValueAtTime(.001,t+duration);source.connect(filter);filter.connect(env);env.connect(this.master);source.start(t);source.stop(t+duration);source.onended=()=>{source.disconnect();filter.disconnect();env.disconnect();this.voices--};
 }
 play(event:CombatEvent){
  const ctx=this.context;if(!ctx||ctx.state!=='running'||!this.settings.sound)return;
  const key=event.type+(event.kind??''),now=ctx.currentTime;
  const interval=event.type==='shot'?.055:event.type==='melee'?.08:event.type==='bosskill'?2:event.type==='charge'?.45:event.type==='acid'?.7:event.type==='nest'?.8:event.type==='objective'?.8:event.type==='interrupt'?.2:event.type==='armorbreak'?.14:event.type==='doctrine'?1:event.type==='bonus'?.6:.1;
  if(now-(this.last.get(key)??-100)<interval)return;this.last.set(key,now);
  switch(event.type){
   case 'shot':
    if(event.kind==='bolter'){this.burst(.085,.12,2200);this.tone(120,42,.1,.075,'triangle')}
    else if(event.kind==='flamer')this.burst(.23,.12,800);
    else if(event.kind==='lascannon'){this.tone(event.branch==='prism'?1600:1300,80,.24,.07,'sawtooth');this.tone(95,35,.28,.09,'triangle');this.burst(.16,.07,2400)}
    break;
   case 'barrage':this.burst(.85,.55,1500);this.tone(100,23,.9,.22);break;
   case 'kill':this.burst(.12,.035,900);break;
   case 'armorbreak':this.burst(.12,.075,4200);this.tone(920,230,.12,.045,'square');this.tone(1460,440,.09,.035,'triangle',.025);break;
   case 'bosskill':
    this.burst(.95,.34,900);this.tone(95,23,1.35,.2,'triangle');
    this.tone(196,98,1.1,.07,'sine',.12);this.tone(293.66,146.83,1.2,.055,'sine',.21);
    break;
   case 'charge':this.tone(88,220,.6,.065,'triangle');this.tone(330,390,.14,.04,'square',.22);break;
   case 'interrupt':this.tone(1420,420,.2,.055,'sine');this.tone(780,1100,.13,.035,'triangle',.04);this.burst(.09,.04,3600);break;
   case 'melee':this.burst(.075,.045,1500);this.tone(210,95,.08,.03,'square');break;
   case 'heal':this.tone(410,690,.3,.035,'sine');this.tone(620,920,.36,.025,'triangle',.08);break;
   case 'hero':this.tone(220,440,.26,.045,'triangle');this.tone(660,990,.34,.04,'sine',.06);break;
   case 'acid':this.burst(.46,.15,1300);this.tone(125,38,.5,.075,'sawtooth');break;
   case 'nest':this.burst(.55,.12,650);this.tone(92,155,.62,.065,'triangle');break;
   case 'objective':
    if(event.size===0){this.tone(185,54,.7,.12,'sawtooth');this.burst(.42,.12,520)}
    else {this.tone(event.size===2?523.25:349.23,event.size===2?783.99:523.25,.55,.055,'triangle');this.tone(event.size===2?659.25:440,event.size===2?987.77:659.25,.5,.04,'sine',.1)}
    break;
   case 'doctrine':for(const [i,note]of[329.63,440,659.25].entries())this.tone(note,note,.5,.055,'triangle',i*.12);break;
   case 'bonus':this.tone(660,880,.12,.045,'sine');this.tone(990,1320,.16,.04,'sine',.1);break;
   case 'leak':this.tone(180,100,.35,.18,'sawtooth');break;
   case 'build':this.burst(.15,.1,600);this.tone(330,660,.12,.07);break;
   case 'upgrade':this.tone(440,880,.2,.06);this.tone(660,990,.22,.05,'sine',.12);break;
   case 'wave':for(let i=0;i<3;i++)this.tone(110,110,.35,.08,'triangle',i*.4);break;
   case 'win':for(const [i,note]of[261.63,329.63,392,523.25].entries())this.tone(note,note,1,.07,'triangle',i*.25);break;
   case 'lose':this.tone(150,30,1.8,.15,'triangle');this.burst(1,.18,400);break;
  }
 }
}

import './style.css';
import {Game} from './game/engine';
import {FixedClock} from './game/clock';
import {TOWERS} from './game/data';
import {BRANCHES} from './game/progression';
import {getMap} from './game/maps';
import {DEFAULT_CONFIG,clearRun,isAvailable,loadProfile,loadRun,recordRun,saveProfile,saveRun,unlock} from './game/campaign';
import {loadSettings,parseSettings,saveBest,saveSettings} from './game/settings';
import type {Command,Point,RunConfig,Settings,TowerKind} from './game/types';
import {World,type Selection} from './render/world';
import {AudioSystem} from './render/audio';
import {Hud,type HudActions} from './ui/hud';
import {previewCommand} from './game/commands';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML='<canvas id="battlefield" aria-label="Bastion battlefield"></canvas><div id="interface"></div>';
const canvas=document.querySelector<HTMLCanvasElement>('#battlefield')!,overlay=document.querySelector<HTMLDivElement>('#interface')!;
const game=new Game(),clock=new FixedClock(),profile=loadProfile();
let savedRun=loadRun(),settings=loadSettings(),started=false,world:World|null=null,failed=false,storageWarned=false;
const audio=new AudioSystem(settings),keys=new Set<string>();
const selection:Selection={pad:null,kind:null,towerId:null,ability:null,aim:null,hoverPad:null};
let pointer:{x:number;y:number}|null=null;
let lastPhase=game.state.phase,lastWave=0,lastFrame=performance.now(),uiTime=0,saveTime=0,celebrationTime=0;
const frameTimes:number[]=[];
const terminal=()=>game.state.phase==='won'||game.state.phase==='lost';
const blocking=()=>Array.from(overlay.querySelectorAll<HTMLElement>('[role="dialog"]')).some(el=>el.getClientRects().length>0);
const inputBlocked=()=>!started||blocking()||game.state.paused||celebrationTime>0||game.state.doctrineOffers.length>0||terminal();
function cancel(){selection.kind=null;selection.ability=null;selection.aim=null;selection.pad=null;selection.towerId=null;selection.hoverPad=null}
function refresh(){hud.update(game.state,selection,settings,celebrationTime>0)}
function campaignInfo(){hud.setCampaign(profile,savedRun)}
function persist(){
 if(!started||terminal())return;
 if(saveRun(game.state)){savedRun=structuredClone(game.state);campaignInfo();saveTime=0}
 else if(!storageWarned){storageWarned=true;hud.notify('บันทึกไม่ได้ กรุณาเปิดหน้านี้ไว้')}
}
function resetPresentation(){cancel();keys.clear();clock.reset();celebrationTime=0;lastPhase=game.state.phase;lastWave=game.state.wave;lastFrame=performance.now();world?.resetCamera();world?.resetEffects()}
function pause(){if(started&&!terminal()){game.state.paused=true;keys.clear();clock.reset();persist();refresh()}}
function resume(){if(!started||terminal())return;game.state.paused=false;clock.reset();lastFrame=performance.now();void audio.unlock();refresh()}
function notifyResult(ok:boolean,success:string,error:string){hud.notify(ok?success:error);if(ok)persist();refresh()}
function settle(){
 if(!terminal())return;
 const reward=recordRun(profile,game.state);game.state.rewardMedals=reward.medals;game.state.rewardStars=reward.stars;
 saveBest(game.state.wave,game.state.kills,game.state.integrity);
 if(!saveProfile(profile)&&!storageWarned){storageWarned=true;hud.notify('บันทึกความคืบหน้าไม่ได้')}
 clearRun();savedRun=null;campaignInfo();cancel();
}
function focusPad(pad:number){
 const pads=getMap(game.state.config.map).pads;if(inputBlocked()||!pads[pad])return;
 const tower=game.state.towers.find(t=>t.pad===pad);
 if(selection.ability==='overcharge'){
  const preview=previewCommand(game.state,'overcharge',tower?.id??-1),ok=tower?game.cast('overcharge',tower.id):false;
  world?.commandFeedback('overcharge',pads[pad],ok);audio.command(ok);
  if(ok){cancel();persist()}else hud.notify(preview.reason);refresh();return;
 }
 if(selection.kind&&!tower){
  const kind=selection.kind,ok=game.build(pad,kind);
  if(ok){selection.kind=null;selection.pad=pad;selection.towerId=game.state.towers.at(-1)!.id;hud.notify(`สร้าง ${TOWERS[kind].name} แล้ว`);persist()}
  else hud.notify(game.state.config.mode==='challenge'?'ใช้ได้ 6 ป้อม: Bolter / Lascannon / Barracks':'เงินไม่พอ หรือยังไม่ยึดพื้นที่');
 }else {selection.pad=pad;selection.towerId=tower?.id??null;selection.kind=null;selection.ability=null}
 refresh();
}
function commandPoint(command:Command,point:Point){
 const preview=previewCommand(game.state,command,point,selection.towerId);
 let ok=false;
 if(command==='moveHero')ok=game.moveHero(point);
 else if(command==='rally'&&selection.towerId!==null)ok=game.rally(selection.towerId,point);
 else if(command==='barrage'||command==='reinforcements'||command==='heroSkill')ok=game.cast(command,point);
 world?.commandFeedback(command,ok?preview.point:point,ok);audio.command(ok);
 if(ok){cancel();persist()}else hud.notify(preview.reason||'ใช้คำสั่งตรงนี้ไม่ได้');
 refresh();
}
const actions:HudActions={
 begin(){
  if(!isAvailable(profile,game.state.config)){hud.notify('ปลดล็อกตัวเลือกนี้ก่อน');return}
  game.restart(game.state.config);started=true;resetPresentation();hud.setStarted(true);void audio.unlock();persist();hud.notify('แตะฐานวงกลม แล้วเลือกป้อม');refresh();
 },
 configure(change:Partial<RunConfig>){
  if(started)return;
  const config={...game.state.config,...change};if(!isAvailable(profile,config)){hud.notify('ผ่านด่านก่อนหน้า หรือใช้เหรียญปลดล็อก');return}
  game.restart(config);resetPresentation();refresh();
 },
 continueRun(){
  const latest=loadRun();if(!latest){savedRun=null;campaignInfo();hud.notify('ไม่มีเกมที่บันทึกไว้');refresh();return}
  game.restore(latest);savedRun=latest;started=true;resetPresentation();hud.setStarted(true);campaignInfo();refresh();
 },
 campaign(){
  if(started&&!terminal()){game.state.paused=true;persist()}
  started=false;resetPresentation();hud.setStarted(false);campaignInfo();refresh();
 },
 unlock(category,id){if(unlock(profile,category,id)){saveProfile(profile);campaignInfo();hud.notify('ปลดล็อกแล้ว ✓')}else hud.notify('เหรียญยังไม่พอ');refresh()},
 selectTower(kind:TowerKind){if(inputBlocked())return;selection.kind=kind;selection.ability=null;selection.towerId=null;if(selection.pad!==null&&game.state.towers.some(t=>t.pad===selection.pad))selection.pad=null;refresh()},
 selectAbility(kind){
  if(inputBlocked())return;
  if((kind==='moveHero'||kind==='heroSkill')&&game.state.hero.hp<=0){hud.notify('ฮีโร่กำลังฟื้น');audio.command(false);return}
  if(kind==='rally'){
   const tower=game.state.towers.find(t=>t.id===selection.towerId&&t.kind==='barracks');if(!tower){hud.notify('เลือก Barracks ก่อน');return}
  }else{
   if(kind!=='moveHero'){
    if(game.state.phase!=='combat'){hud.notify('ใช้สกิลได้เมื่อเวฟเริ่ม');return}
    if(game.state.cooldowns[kind]>0){hud.notify(`รออีก ${Math.ceil(game.state.cooldowns[kind])} วิ`);return}
   }
   selection.towerId=null;selection.pad=null;
  }
  selection.ability=kind;selection.kind=null;selection.aim=null;selection.hoverPad=null;
  refresh();
 },
 cancel,startWave(){if(game.startWave()){cancel();persist();refresh()}},pause,resume,
 restart(){game.restart();started=true;resetPresentation();hud.setStarted(true);void audio.unlock();persist();refresh();hud.focusLaunchWave()},
 upgrade(branch){if(selection.towerId!==null)notifyResult(game.upgrade(selection.towerId,branch),branch?`เลือก ${BRANCHES[branch].name} แล้ว`:'อัปเกรดแล้ว ✓','ตรวจเงิน หรือเลือกสายพิเศษ')},
 rerollDoctrine(){if(game.rerollDoctrines()){persist();refresh();hud.focusDoctrineChoice()}},
 chooseDoctrine(id){if(game.chooseDoctrine(id)){cancel();keys.clear();clock.reset();persist();hud.notify('ได้รับพลังเสริมแล้ว ✓');refresh()}},
 sell(){if(selection.towerId!==null){const ok=game.sell(selection.towerId);if(ok)cancel();notifyResult(ok,'ขายป้อมแล้ว','ขายป้อมได้ระหว่างเวฟ')}},
 target(mode){if(inputBlocked())return;const t=game.state.towers.find(t=>t.id===selection.towerId);if(t&&t.kind!=='stasis'&&t.kind!=='barracks')t.target=mode;persist();refresh()},
 speed(){if(inputBlocked())return;game.state.speed=game.state.speed===1?2:1;persist();refresh()},
 mechanic(){notifyResult(game.useMechanic(),game.state.config.map==='wastes'?'กำลังไปยึดฐาน':'สลับเส้นทางแล้ว','สลับทางระหว่างเวฟ ใช้เงิน 25')},
 objective(){notifyResult(game.acceptObjective(),'รักษาเครื่องปฏิกรณ์ 2 เวฟ','รับภารกิจได้ระหว่างเวฟ ก่อนเวฟ 8')},
 retire(){if(game.retire()){settle();lastPhase=game.state.phase;refresh()}},
 setSettings(change:Partial<Settings>){settings=parseSettings({...settings,...change});saveSettings(settings);audio.configure(settings);world?.setQuality(settings.quality);world?.setReducedMotion(settings.reducedMotion);if(settings.reducedMotion)celebrationTime=0;document.documentElement.classList.toggle('reduced-motion',settings.reducedMotion);refresh()},
 cameraReset(){world?.resetCamera()},focusPad,
};
const hud=new Hud(overlay,actions);campaignInfo();
document.documentElement.classList.toggle('reduced-motion',settings.reducedMotion);
try {world=new World(canvas,()=>game.state);world.setQuality(settings.quality);world.setReducedMotion(settings.reducedMotion)}catch(error){failed=true;console.error(error);hud.showError('เปิดภาพ 3D ไม่ได้ ลองเปิด Hardware acceleration หรือเปลี่ยนเบราว์เซอร์')}
refresh();

function updateAim(){
 if(!world||!pointer)return;
 const hit=world.pick(pointer.x,pointer.y);selection.aim=hit?.point??null;selection.hoverPad=hit?.pad??null;if(selection.kind)selection.pad=hit?.pad??null;
 canvas.style.cursor=selection.ability?'crosshair':hit?.pad!==null&&hit?.pad!==undefined?'pointer':'default';
}
canvas.addEventListener('pointermove',event=>{
 if(!world||inputBlocked())return;pointer={x:event.clientX,y:event.clientY};updateAim();
});
canvas.addEventListener('pointerleave',()=>{pointer=null;selection.aim=null;selection.hoverPad=null});
canvas.addEventListener('click',event=>{
 if(!world||inputBlocked())return;void audio.unlock();const hit=world.pick(event.clientX,event.clientY);if(!hit)return;
 if(selection.ability&&selection.ability!=='overcharge'){commandPoint(selection.ability,hit.point);return}
 if(hit.pad!==null){focusPad(hit.pad);return}
 if(selection.ability==='overcharge'){world.commandFeedback('overcharge',hit.point,false);audio.command(false);hud.notify('เลือกป้อมยิง');return}
 if(!selection.kind&&!selection.ability&&Math.hypot(hit.point.x-game.state.hero.x,hit.point.z-game.state.hero.z)<1.3){actions.selectAbility('moveHero');return}
 if(!selection.kind&&!selection.ability){cancel();refresh()}
});
canvas.addEventListener('contextmenu',event=>{
 event.preventDefault();if(!world||inputBlocked())return;
 if(selection.kind||selection.ability){cancel();refresh();return}
 const hit=world.pick(event.clientX,event.clientY);if(hit){void audio.unlock();commandPoint('moveHero',hit.point)}
});
canvas.addEventListener('wheel',event=>{event.preventDefault();if(!inputBlocked())world?.zoom(event.deltaY)},{passive:false});
window.addEventListener('resize',()=>world?.resize());
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();pause();failed=true;hud.showError('ภาพ 3D หยุดทำงาน รีโหลดแล้วกดเล่นต่อ')});
window.addEventListener('keydown',event=>{
 const el=event.target as HTMLElement;if(event.defaultPrevented||el.closest('input,select,textarea')||event.ctrlKey||event.metaKey||event.altKey||inputBlocked())return;
 if(['Space','Digit1','Digit2','Digit3','Digit4','Digit5','KeyQ','KeyE','KeyF','KeyG','KeyH','KeyR','Escape','KeyW','KeyA','KeyS','KeyD'].includes(event.code))event.preventDefault();
 keys.add(event.code);if(event.repeat)return;
 const kinds:Record<string,TowerKind>={Digit1:'bolter',Digit2:'flamer',Digit3:'lascannon',Digit4:'stasis',Digit5:'barracks'};
 const commands:Record<string,Command>={KeyQ:'barrage',KeyE:'overcharge',KeyF:'heroSkill',KeyG:'reinforcements',KeyH:'moveHero'};
 if(kinds[event.code])actions.selectTower(kinds[event.code]);if(commands[event.code])actions.selectAbility(commands[event.code]);
 if(event.code==='Space')pause();if(event.code==='KeyR')world?.resetCamera();if(event.code==='Escape'){cancel();refresh()}
});
window.addEventListener('keyup',event=>keys.delete(event.code));
function background(){keys.clear();if(started)pause();clock.reset()}
window.addEventListener('blur',background);document.addEventListener('visibilitychange',()=>{if(document.hidden)background()});
window.addEventListener('pagehide',persist);

function frame(now:number){
 requestAnimationFrame(frame);if(failed||!world)return;
 const dt=Math.min(Math.max(0,(now-lastFrame)/1000),.1);lastFrame=now;
 if(dt>0){frameTimes.push(dt*1000);if(frameTimes.length>600)frameTimes.shift()}
 if(celebrationTime>0&&!game.state.paused)celebrationTime=Math.max(0,celebrationTime-dt);
 const battleDt=dt*(celebrationTime>0?.25:1);
 if(started&&!game.state.paused)clock.advance(battleDt,game.state.speed,()=>game.tick(1/60));else clock.reset();
 if(!inputBlocked())world.pan(Number(keys.has('KeyD'))-Number(keys.has('KeyA')),Number(keys.has('KeyS'))-Number(keys.has('KeyW')),dt);
 if(pointer&&!inputBlocked())updateAim();
 const events=game.state.events.splice(0);
 for(const event of events){
  audio.play(event);
  if(event.type==='bosskill'&&!settings.reducedMotion){celebrationTime=.9;keys.clear()}
  if(event.type==='bonus')hud.notify(`เริ่มก่อน +${event.size}`);
  if(event.type==='nest')hud.notify('ทำลายรังเพื่อปลดโล่บอส');
  if(event.type==='objective')hud.notify(event.size===0?'เครื่องปฏิกรณ์แตก! รักษาฐานต่อ':game.state.objective.status==='success'?'สำเร็จ! เงิน +100 · สกิลพร้อมไวขึ้น':game.state.mapState.captured?'ยึดฐานแล้ว · สร้างป้อมเพิ่มได้':'ป้องกันเครื่องปฏิกรณ์');
 }
 audio.setPaused(game.state.paused||!started);
 world.update(settings.reducedMotion&&game.state.paused?0:battleDt,events,selection);
 if(game.state.phase!==lastPhase){
  if(game.state.phase==='prep')hud.notify(`ผ่านเวฟ ${game.state.wave} · +${50+Math.min(game.state.wave,20)*10}`);
  if(terminal())settle();else persist();lastPhase=game.state.phase;
 }
 if(game.state.wave!==lastWave){lastWave=game.state.wave;persist()}
 saveTime+=dt;if(started&&!game.state.paused&&!terminal()&&saveTime>=5)persist();
 uiTime+=dt;if(uiTime>=.1){uiTime=0;refresh()}
}
requestAnimationFrame(frame);

// All development helpers return copies or projections; commands always go through the UI.
if(import.meta.env.DEV)Object.defineProperty(window,'bastion',{value:{snapshot:()=>structuredClone(game.state),profile:()=>structuredClone(profile),pads:()=>getMap(game.state.config.map).pads.map((p,i)=>({pad:i,...world?.project(p)})),project:(point:Point)=>world?.project(point),metrics:()=>({frames:frameTimes.length,averageMs:frameTimes.reduce((s,n)=>s+n,0)/Math.max(1,frameTimes.length),p95Ms:[...frameTimes].sort((a,b)=>a-b)[Math.floor(frameTimes.length*.95)],...world?.diagnostics})}});

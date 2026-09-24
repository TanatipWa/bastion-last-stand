import { honorCards, honorTracker } from './battle-honors';
import {icon,towerRoles,towerHints,branchUI,doctrineUI} from './visuals';
import { TOWERS, ENEMIES, towerStats } from '../game/data';
import { BRANCHES, DOCTRINE_REROLL_COST, branchesFor, earlyWaveBonus, upgradeCost } from '../game/progression';
import { DEFAULT_CONFIG, HEROES, LOADOUTS, newProfile } from '../game/campaign';
import { getMap, wavePreview } from '../game/maps';
import { campaignMarkup, MODE_NAMES } from './campaign-view';
import type { BranchId, Command, DoctrineId, EnemyKind, GameState, Point, Profile, RunConfig, Settings, TargetMode, TowerKind } from '../game/types';

export interface HudActions {
  begin():void; selectTower(kind:TowerKind):void; selectAbility(kind:Command):void;
  cancel():void; startWave():void; pause():void; resume():void; restart():void; upgrade(branch?:BranchId):void; chooseDoctrine(id:DoctrineId):void; rerollDoctrine():void;
  sell():void; target(mode:TargetMode):void; speed():void; setSettings(settings:Partial<Settings>):void;
  cameraReset():void; focusPad(pad:number):void;
  configure(config:Partial<RunConfig>):void; continueRun():void; campaign():void;
  unlock(category:'hero'|'loadout'|'livery',id:string):void; mechanic():void; objective():void; retire():void;
}
type Selection = {pad:number|null;kind:TowerKind|null;towerId:number|null;ability:Command|null;aim:Point|null};
const kinds:TowerKind[]=['bolter','flamer','lascannon','stasis','barracks'];

export class Hud {
  private root:HTMLElement;
  private profile:Profile=newProfile();
  private saved:GameState|null=null;
  private campaignKey='';
  private state:GameState|null=null;
  private selection:Selection={pad:null,kind:null,towerId:null,ability:null,aim:null};
  private started=false;
  private settingsOpen=false;
  private resumeAfterSettings=false;
  private celebrating=false;
  private errorOpen=false;
  private toastTimer:ReturnType<typeof setTimeout>|undefined;
  private lastModal:HTMLElement|null=null;
  private previousFocus:HTMLElement|null=null;
  constructor(host:HTMLElement, private actions:HudActions){
    this.root=document.createElement('div');this.root.className='hud';host.append(this.root);
    this.root.innerHTML=`
      <section class="title-screen imperial-campaign" data-el="title" aria-label="เลือกด่านและฮีโร่" tabindex="-1"></section>
      <div class="game-hud" data-el="game" hidden>
        <header class="status-strip panel" aria-label="สถานะการรบ"><div class="stat gate">${icon('shield')}<div><span class="eyebrow">ฐาน</span><strong data-el="integrity">20</strong><span class="stat-total" data-el="gate-total"> / 20</span><div class="integrity-track"><i data-el="integrity-bar"></i></div></div></div><div class="stat">${icon('coin')}<div><span class="eyebrow">เงิน</span><strong class="gold" data-el="money">250</strong></div></div><div class="stat">${icon('wave')}<div><span class="eyebrow">เวฟ</span><strong data-el="wave">00</strong><span class="stat-total" data-el="wave-total"> / 10</span></div></div></header>
        <nav class="toolbar panel" aria-label="ควบคุมการเล่น"><button data-action="speed" class="tool-button" title="สลับความเร็ว" aria-label="สลับความเร็ว"><span data-el="speed">1×</span></button><button data-action="camera" class="tool-button" title="คืนมุมกล้อง (R)" aria-label="คืนมุมกล้อง">${icon('reset')}</button><button data-action="pause" class="tool-button" title="พักเกม (Space)" aria-label="พักเกม">${icon('pause')}</button><button data-action="settings" class="tool-button" title="ตั้งค่าและวิธีเล่น" aria-label="ตั้งค่าและวิธีเล่น">${icon('gear')}</button></nav>
        <div class="battle-context" data-el="battle-context"></div><aside class="doctrine-strip" data-el="doctrine-strip" aria-label="พลังเสริมที่ได้รับ" hidden></aside>
        <section class="wave-intel"><div class="eyebrow"><i class="signal-dot"></i><span data-el="wave-label">เตรียมป้องกัน</span></div><h2 data-el="wave-name">เวฟแรก</h2><p data-el="intel" hidden></p><div class="next-wave-preview" data-el="next-wave-preview" aria-label="ศัตรูเวฟถัดไป"></div><section class="boss-status" data-el="boss-status" aria-label="Hive Tyrant health" hidden><div><span>HIVE TYRANT</span><strong data-el="boss-value"></strong></div><p data-el="boss-phase"></p><div class="boss-track" data-el="boss-health" role="progressbar" aria-label="Hive Tyrant health" aria-valuemin="0" aria-valuemax="100"><i data-el="boss-bar"></i></div></section><div class="threat-signals" data-el="threat-signals" hidden><p class="charge-warning" data-el="charge-warning" role="status" aria-live="polite" hidden></p><p class="barrier-warning" data-el="barrier-warning" hidden>มีโล่ · ใช้ Lascannon หรือเล็งต้นโล่</p></div><button class="button launch" data-action="wave"><span><span data-el="launch-label">เริ่มเวฟ 1</span><small data-el="launch-bonus" hidden></small></span><span>→</span></button><div class="combat-progress" data-el="combat-info" hidden><span data-el="enemy-count"></span><span data-el="kills"></span></div><details class="honor-tracker"><summary aria-label="ความคืบหน้าตราพิชิต"><span data-el="honor-summary"></span><span class="honor-expand" aria-hidden="true">⌄</span></summary><div class="honor-tracker-detail"><strong>ชนะเพื่อรับตรา</strong><div data-el="honor-detail"></div></div></details></section>
        <aside class="inspector panel" data-el="inspector" aria-label="ป้อมที่เลือก" hidden><div class="inspector-heading"><span class="eyebrow" data-el="inspect-label"></span><button class="icon-close" data-action="cancel" aria-label="ยกเลิกการเลือก">${icon('cross')}</button></div><div class="inspect-icon" data-el="inspect-icon"></div><h2 data-el="inspect-name"></h2><details class="inspect-details"><summary>วิธีใช้ ${icon('info')}</summary><p data-el="inspect-description"></p></details><div class="tower-stats" data-el="tower-stats"><span title="ดาเมจต่อครั้ง">${icon('damage')}<b data-el="damage"></b><small>พลัง</small></span><span title="ระยะโจมตี">${icon('range')}<b data-el="range"></b><small>ระยะ</small></span><span title="เวลาพักระหว่างโจมตี">${icon('clock')}<b data-el="rate"></b><small>พักยิง</small></span></div><p class="inspect-hint" data-el="inspect-hint"></p><div class="quick-build" data-el="quick-build">${kinds.map(kind=>`<button data-build-kind="${kind}" title="${TOWERS[kind].name} · ${towerRoles[kind]}" aria-label="สร้าง ${TOWERS[kind].name}">${icon(kind)}<strong>${TOWERS[kind].short}</strong><span>${TOWERS[kind].cost}</span></button>`).join('')}</div><button class="button primary" data-action="build" data-el="build">สร้างที่นี่</button><button class="button primary" data-action="upgrade" data-el="upgrade">อัปเกรด</button><section class="specialization" data-el="specialization" aria-label="เลือกสายพิเศษถาวร" hidden><div class="eyebrow">เลือกสายพิเศษ</div><p>เลือกได้เพียงหนึ่งสาย</p><div data-el="branch-options"></div></section><button class="button" data-ability="rally" data-el="rally">ตั้งจุดรวมพล</button><p class="barracks-status" data-el="barracks-status" hidden></p><fieldset class="targeting" data-el="targeting"><legend>เล็งเป้า</legend><button data-target="first">หน้าสุด</button><button data-target="armor">เกราะ</button><button data-target="synapse">โล่</button></fieldset><button class="text-button sell" data-action="sell" data-el="sell">ขายคืน</button></aside>
        <div class="selection-prompt" data-el="prompt" hidden><span data-el="prompt-text"></span><button data-action="cancel">ยกเลิก <kbd>ESC</kbd></button></div>
        <section class="command-dock" aria-label="สร้างป้อมและสกิลสนับสนุน"><div class="dock-section"><div class="dock-label"><span>สร้างป้อม</span><span></span></div><div class="tower-cards">${kinds.map((kind,i)=>`<button class="tower-card" data-kind="${kind}" style="--tower-color:${TOWERS[kind].color}" title="${towerHints[kind]}" aria-label="เลือก ${TOWERS[kind].name} · ${TOWERS[kind].cost} เงิน"><div class="card-top"><kbd>${i+1}</kbd><span class="cost">${TOWERS[kind].cost}</span></div>${icon(kind)}<span class="tower-name">${TOWERS[kind].short}</span><span class="tower-role">${towerRoles[kind]}</span></button>`).join('')}</div></div><div class="dock-section support-section"><div class="dock-label"><span>สกิลสนับสนุน</span></div><div class="ability-cards"><button class="ability-card" data-ability="barrage" title="Orbital barrage: select, then click the battlefield. 60 second cooldown."><kbd>Q</kbd>${icon('barrage')}<span>ถล่ม</span><small data-el="barrage">พร้อม</small></button><button class="ability-card" data-ability="overcharge" title="Overcharge: select, then click a damage tower. 6 second boost; 40 second cooldown."><kbd>E</kbd>${icon('overcharge')}<span>เร่งยิง</span><small data-el="overcharge">พร้อม</small></button></div></div></section>
        <section class="field-command panel" aria-label="ฮีโร่และภารกิจ"><div class="hero-heading"><span class="hero-badge">${icon('helmet')}</span><div><strong data-el="hero-name"></strong><small data-el="hero-health"></small><div class="hero-health-track"><i data-el="hero-bar"></i></div></div><span class="hero-level" data-el="hero-level"></span></div><div class="hero-commands"><button data-ability="moveHero" title="ย้ายฮีโร่ (H)"><kbd>H</kbd>${icon('move')}<span>ย้าย</span></button><button data-ability="heroSkill"><kbd>F</kbd>${icon('overcharge')}<span data-el="hero-skill-name">สกิล</span><small data-el="heroSkill"></small></button><button data-ability="reinforcements" title="เรียกทหารบนทางเดิน (G)"><kbd>G</kbd>${icon('people')}<span>ทหาร</span><small data-el="reinforcements"></small></button></div><div class="objective-chip" data-el="objective-chip" hidden>${icon('shield')}<span data-el="objective-chip-text"></span><progress data-el="objective-hp" max="150" value="150" aria-label="เลือดเครื่องปฏิกรณ์"></progress></div><details class="field-orders"><summary>${icon('flag')}ภารกิจเสริม</summary><div class="field-orders-content"><p data-el="map-mechanic"></p><button data-action="mechanic" data-el="mechanic">สลับทาง</button><p data-el="objective-status"></p><button data-action="objective" data-el="objective">รับภารกิจ</button></div></details></section><div class="boss-finish" data-el="boss-finish" role="status" hidden><span class="eyebrow">ศัตรูสิ้นกำลัง</span><strong>กำจัดบอสแล้ว</strong></div>
        <div class="camera-hint">WASD <span>เลื่อน</span><i>·</i> SCROLL <span>ซูม</span><i>·</i> R <span>คืนมุมกล้อง</span></div>
      </div>
      <div class="modal-backdrop" data-el="pause-modal" hidden><section class="modal pause-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="eyebrow">พักการรบ</div>${icon('shield')}<h2 id="pause-title">พักเกม</h2><p>พร้อมแล้วค่อยลุยต่อ</p><button class="button primary" data-action="resume">เล่นต่อ</button><button class="button" data-action="settings">ตั้งค่าและวิธีเล่น</button><button class="button" data-action="campaign">บันทึกและกลับเลือกด่าน</button><button class="button" data-action="retire" data-el="retire" hidden>จบรอบและเก็บคะแนน</button><p class="pause-save-note" data-el="pause-save-note">บันทึกแล้ว กดเล่นต่อจากหน้าเลือกด่านได้</p><button class="text-button" data-action="restart">เริ่มด่านใหม่</button></section></div>
      <div class="modal-backdrop" data-el="settings-modal" hidden><section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="modal-heading"><div><span class="eyebrow">ตัวเลือก</span><h2 id="settings-title">ตั้งค่าและวิธีเล่น</h2></div><button class="icon-close" data-action="close-settings" aria-label="ปิดการตั้งค่า">${icon('cross')}</button></div><div class="settings-grid"><label class="setting-row"><span>เสียงเกม<small></small></span><input type="checkbox" data-setting="sound"></label><label class="setting-row"><span>ความดัง</span><input aria-label="ความดัง" type="range" min="0" max="1" step="0.05" data-setting="volume"></label><label class="setting-row"><span>คุณภาพภาพ<small>Low ช่วยให้เครื่องเบาลง</small></span><select data-setting="quality" aria-label="คุณภาพภาพ"><option value="high">High</option><option value="low">Low</option></select></label><label class="setting-row"><span>ลดการเคลื่อนไหว<small>ลดแสงและเอฟเฟกต์</small></span><input type="checkbox" data-setting="reducedMotion"></label></div><div class="manual"><div class="quick-guide"><span>${icon('bolter')}<b>สร้าง</b></span>${icon('arrow')}<span>${icon('gear')}<b>อัปเกรด</b></span>${icon('arrow')}<span>${icon('shield')}<b>รักษาฐาน</b></span></div><details><summary>สร้างป้อมและเลือกสาย</summary><p>แตะฐานวงกลมแล้วเลือกป้อม หรือเลือกป้อมจากแถบล่างแล้วแตะฐาน อัปเกรดเป็นเลเวล 2 ก่อนเลือกสายพิเศษถาวร ขายป้อมคืนได้ 70% ระหว่างเวฟ</p><p>Bolter ยิงรัว · Flamer เผาหมู่ · Lascannon เจาะเกราะ · Stasis สโลว์ · Barracks ส่งทหารขวางทาง</p></details><details><summary>ฮีโร่และสกิล</summary><p>ย้ายฮีโร่ด้วยปุ่มย้าย, H หรือคลิกขวาบนสนาม · คลิกขวาขณะเล็งเพื่อยกเลิก · สกิลฮีโร่ใช้ F · เรียกทหารด้วย G · เล็งสกิลในระยะ 7 ของฮีโร่ ทหารเสริมต้องวางใกล้ทางเดิน</p><p>เลือก Barracks แล้วตั้งจุดรวมพลบนทางเดินในระยะ 6 ทหารที่ล้มจะเกิดใหม่</p></details><details><summary>โล่ พุ่ง และบอส</summary><p>Lascannon เจาะเกราะและโล่ได้ ตั้งเป้าโล่เพื่อยิงต้นตอโล่ Stasis หยุดศัตรูที่กำลังพุ่งได้</p><p>กำจัดรังเพื่อปลดโล่บอส หลบวงกรด แล้วโจมตีช่วงจุดอ่อนเปิด อย่าให้บอสถึงฐาน</p></details><details><summary>ภารกิจและปุ่มลัด</summary><p>Foundry สลับทางได้ระหว่างเวฟ · Crossroads ต้องรักษาทั้ง 2 ประตู · Wastes ใช้ฮีโร่ยึดจุดธงเพื่อเปิดฐานป้อมเพิ่ม</p><p>รับภารกิจเครื่องปฏิกรณ์ก่อนเวฟ 8 ป้องกัน 2 เวฟเพื่อรับเงิน 100 เหรียญรางวัล 2 และลดคูลดาวน์สกิล</p><p>1–5 เลือกป้อม · Q ถล่ม · E เร่งยิง · Space พักเกม · Esc ยกเลิก · WASD เลื่อนกล้อง · R คืนมุมกล้อง · Scroll ซูม</p></details></div><button class="button primary" data-action="close-settings">กลับไปเล่น</button></section></div>
      <div class="modal-backdrop doctrine-backdrop" data-el="doctrine-modal" hidden><section class="modal doctrine-modal" role="dialog" aria-modal="true" aria-labelledby="doctrine-title" aria-describedby="doctrine-description"><div class="eyebrow" data-el="doctrine-wave"></div><h2 id="doctrine-title">เลือกพลังเสริม</h2><p id="doctrine-description">เลือก 1 อย่าง · ใช้ได้ตลอดรอบนี้</p><div class="doctrine-options" data-el="doctrine-options"></div><div class="doctrine-footer"><button class="button doctrine-reroll" data-action="reroll-doctrine">${icon('reset')}<span data-el="reroll-label">สุ่มใหม่ ${DOCTRINE_REROLL_COST}</span>${icon('coin')}</button><span>สุ่มใหม่ได้ 1 ครั้งต่อชุด</span><button class="text-button" data-action="settings">ตั้งค่าและวิธีเล่น</button></div></section></div>
      <div class="modal-backdrop result-backdrop" data-el="result-modal" hidden><section class="modal result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="eyebrow" data-el="result-tag"></div><div class="result-emblem" data-el="result-icon"></div><h2 id="result-title" data-el="result-title"></h2><p data-el="result-description"></p><div class="result-stats"><div><strong data-el="result-wave"></strong><span>เวฟ</span></div><div><strong data-el="result-kills"></strong><span>กำจัด</span></div><div><strong data-el="result-gate"></strong><span>เลือดฐาน</span></div></div><section class="result-honors" aria-label="ตราพิชิต"><h3>ตราพิชิต</h3><div class="honor-cards" data-el="result-honors"></div></section><details class="performance"><summary>ผลงานป้อม</summary><div class="performance-heading"><h3>ผลงานป้อม</h3><span>ดาเมจสูงสุดก่อน</span></div><div class="performance-table" data-el="performance"></div></details><button class="button primary" data-action="restart">เล่นอีกครั้ง <span>→</span></button><button class="button" data-action="campaign">เลือกด่าน</button><p class="result-rewards" data-el="result-rewards"></p><span class="result-motto"></span></section></div>
      <div class="toast panel" data-el="toast" role="status" aria-live="polite" hidden></div>
      <div class="modal-backdrop" data-el="error-modal" hidden><section class="modal" role="alertdialog" aria-modal="true" aria-labelledby="error-title"><span class="eyebrow">ภาพขัดข้อง</span><h2 id="error-title">เปิดสนามรบไม่ได้</h2><p data-el="error-message"></p><button class="button primary" data-action="reload">โหลดเกมใหม่</button></section></div>`;
    this.root.addEventListener('click',e=>this.onClick(e));
    this.root.addEventListener('change',e=>this.onSetting(e));
    this.root.addEventListener('input',e=>{if((e.target as HTMLElement).matches('[data-setting="volume"]'))this.onSetting(e)});
    for(const event of ['pointerdown','pointerup','wheel','contextmenu'])this.root.addEventListener(event,e=>{if((e.target as HTMLElement).closest('button,input,select,.modal,.panel,.command-dock,.title-copy,.imperial-campaign,.field-command,.doctrine-strip'))e.stopPropagation()});
    this.root.addEventListener('keydown',e=>{
      const modal=this.currentModal();
      if(!modal){
        if((e.key===' '||e.key==='Enter')&&(e.target as HTMLElement).closest('button,summary'))e.stopPropagation();
        if(e.key==='Escape')this.closeDoctrineDetails();
        return;
      }
      e.stopPropagation();
      if(e.key==='Escape'){
        e.preventDefault();
        if(modal.parentElement===this.el('settings-modal'))this.closeSettings();
        else if(modal.parentElement===this.el('pause-modal'))this.actions.resume();
      }
      if(e.code==='Space'&&modal.parentElement===this.el('pause-modal')&&!(e.target as HTMLElement).closest('button,input,select,textarea,a')){
        e.preventDefault();if(!e.repeat)this.actions.resume();
      }
      if(e.key==='Tab'){
        const items=this.focusable(modal),first=items[0],last=items.at(-1);
        if(!first){e.preventDefault();modal.focus()}
        else if(!modal.contains(document.activeElement)||document.activeElement===modal){e.preventDefault();(e.shiftKey?last:first)?.focus()}
        else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
      }
    });
    this.root.addEventListener('focusout',e=>{
      const chip=(e.target as HTMLElement).closest<HTMLElement>('.doctrine-chip');
      if(chip&&!chip.contains(e.relatedTarget as Node|null))this.closeDoctrineDetails();
    });
    document.addEventListener('focusin',e=>{
      const modal=this.currentModal();
      if(modal&&!modal.contains(e.target as Node))this.focusModal(modal);
    });
  }
  private el<T extends HTMLElement=HTMLElement>(name:string){return this.root.querySelector<T>(`[data-el="${name}"]`)!}
  private text(name:string,value:string){const el=this.el(name);if(el.textContent!==value)el.textContent=value}
  private show(name:string,visible:boolean){this.el(name).hidden=!visible}
  private focusable(modal:HTMLElement){return [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(n=>!n.hidden&&n.offsetParent!==null)}
  private focusModal(modal:HTMLElement){
    modal.tabIndex=-1;
    if(modal.parentElement===this.el('result-modal')){modal.scrollTop=0;modal.focus({preventScroll:true})}
    else (this.focusable(modal)[0]??modal).focus();
  }
  private closeDoctrineDetails(){for(const chip of this.root.querySelectorAll<HTMLElement>('.doctrine-chip')){chip.classList.remove('expanded');chip.querySelector('button')?.setAttribute('aria-expanded','false')}}
  private onClick(event:MouseEvent){
    const target=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!target||target.disabled)return;event.stopPropagation();
    if(target.dataset.unlock){this.actions.unlock(target.dataset.category as 'hero'|'loadout'|'livery',target.dataset.unlock);return}
    for(const key of ['map','mode','hero','loadout','livery'] as const){if(target.dataset[key]){this.actions.configure({[key]:target.dataset[key]} as Partial<RunConfig>);return}}
    if(target.dataset.doctrineInfo){const chip=target.closest<HTMLElement>('.doctrine-chip')!,open=!chip.classList.contains('expanded');this.closeDoctrineDetails();chip.classList.toggle('expanded',open);target.setAttribute('aria-expanded',String(open));return}
    if(target.dataset.doctrine){const id=target.dataset.doctrine as DoctrineId;if(this.state?.doctrineOffers.includes(id))this.actions.chooseDoctrine(id);return}
    if(target.dataset.branch){this.actions.upgrade(target.dataset.branch as BranchId);return}
    if(target.dataset.buildKind){const pad=this.selection.pad;if(pad!==null){this.actions.selectTower(target.dataset.buildKind as TowerKind);this.actions.focusPad(pad)}return}
    if(target.dataset.kind){this.actions.selectTower(target.dataset.kind as TowerKind);return}
    if(target.dataset.ability){this.actions.selectAbility(target.dataset.ability as Command);return}
    if(target.dataset.target){this.actions.target(target.dataset.target as TargetMode);return}
    switch(target.dataset.action){
      case 'continue':this.actions.continueRun();break;
      case 'campaign':this.settingsOpen=false;this.resumeAfterSettings=false;this.actions.campaign();break;
      case 'mechanic':this.actions.mechanic();break;
      case 'objective':this.actions.objective();break;
      case 'retire':this.actions.retire();break;
      case 'begin':this.actions.begin();break;
      case 'wave':this.actions.startWave();break;
      case 'reroll-doctrine':this.actions.rerollDoctrine();break;
      case 'pause':this.actions.pause();break;
      case 'resume':this.actions.resume();break;
      case 'restart':this.settingsOpen=false;this.resumeAfterSettings=false;this.actions.restart();break;
      case 'upgrade':this.actions.upgrade();break;
      case 'sell':this.actions.sell();break;
      case 'cancel':this.actions.cancel();break;
      case 'build':if(this.selection.pad!==null)this.actions.focusPad(this.selection.pad);break;
      case 'speed':this.actions.speed();break;
      case 'camera':this.actions.cameraReset();break;
      case 'settings':this.openSettings();break;
      case 'close-settings':this.closeSettings();break;
      case 'reload':window.location.reload();break;
    }
  }
  private onSetting(event:Event){const input=event.target as HTMLInputElement;const key=input.dataset.setting;if(!key)return;this.actions.setSettings({[key]:key==='volume'?Number(input.value):key==='quality'?input.value:input.checked})}
  private openSettings(){
    if(this.settingsOpen)return;
    this.resumeAfterSettings=!!(this.started&&this.state&&!this.state.paused&&!this.state.doctrineOffers.length&&this.state.phase!=='won'&&this.state.phase!=='lost');
    this.settingsOpen=true;if(this.resumeAfterSettings)this.actions.pause();this.syncModals();
  }
  private closeSettings(){
    const resume=this.resumeAfterSettings;this.settingsOpen=false;this.resumeAfterSettings=false;
    if(resume)this.actions.resume();this.syncModals();
  }
  private currentModal(){return this.root.querySelector<HTMLElement>('.modal-backdrop:not([hidden]) .modal')}
  private syncModals(){
    const done=this.state?.phase==='won'||this.state?.phase==='lost';
    const active=this.errorOpen?'error-modal':this.settingsOpen?'settings-modal':this.started&&done&&!this.celebrating?'result-modal':this.started&&!done&&this.state?.paused?'pause-modal':this.started&&!done&&!!this.state?.doctrineOffers.length?'doctrine-modal':null;
    for(const name of ['error-modal','settings-modal','result-modal','doctrine-modal','pause-modal'])this.show(name,name===active);
    this.syncFocus();
  }
  private syncFocus(){
    const modal=this.currentModal();
    this.el('game').inert=!!modal;this.el('title').inert=!!modal;
    for(const backdrop of this.root.querySelectorAll<HTMLElement>('.modal-backdrop'))backdrop.inert=backdrop.hidden;
    if(modal===this.lastModal)return;
    if(modal&&!this.lastModal)this.previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    if(modal){clearTimeout(this.toastTimer);this.show('toast',false);this.closeDoctrineDetails();this.focusModal(modal)}
    else{
      const previous=this.previousFocus;this.previousFocus=null;
      if(previous?.isConnected&&previous.offsetParent!==null&&!previous.closest('[inert]')&&!(previous instanceof HTMLButtonElement&&previous.disabled))previous.focus();
      else if(this.started)this.root.querySelector<HTMLButtonElement>('.toolbar [data-action="settings"]')?.focus();
      else this.el('title').focus({preventScroll:true});
    }
    this.lastModal=modal;
  }
  setCampaign(profile:Profile,saved:GameState|null){this.profile=structuredClone(profile);this.saved=saved?structuredClone(saved):null;if(!this.started)this.renderCampaign()}
  private renderCampaign(){
    const config=this.state?.config??DEFAULT_CONFIG,key=JSON.stringify([this.profile,this.saved?.runId,this.saved?.wave,this.saved?.elapsed,config]);if(this.campaignKey===key)return;
    const active=document.activeElement instanceof HTMLElement?document.activeElement:null,choice=active?.closest<HTMLElement>('[data-map],[data-mode],[data-hero],[data-loadout],[data-livery],[data-unlock],[data-action]'),restore=choice&&this.el('title').contains(choice)?Object.entries(choice.dataset).find(([k])=>['map','mode','hero','loadout','livery','unlock','action'].includes(k)):null,restoreCategory=choice?.dataset.category;
    const expanded=[...this.el('title').querySelectorAll<HTMLDetailsElement>('details')].map(d=>d.open),scroll=this.el('title').scrollTop;this.el('title').innerHTML=campaignMarkup(this.profile,this.saved,config);
    this.el('title').querySelectorAll<HTMLDetailsElement>('details').forEach((d,i)=>d.open=expanded[i]??false);this.el('title').scrollTop=scroll;this.campaignKey=key;
    if(restore){const selector=restore[0]==='unlock'&&restoreCategory?`[data-${restoreCategory}="${restore[1]}"]`:`[data-${restore[0]}="${restore[1]}"]`;this.el('title').querySelector<HTMLButtonElement>(selector)?.focus({preventScroll:true})}
  }
  setStarted(started:boolean){if(started)this.root.querySelectorAll<HTMLDetailsElement>('.field-orders,.inspect-details,.honor-tracker').forEach(d=>d.open=false);const changed=this.started!==started;this.started=started;this.show('title',!started);this.show('game',started);this.root.classList.toggle('is-started',started);if(!started)this.renderCampaign();this.syncModals();if(changed&&started)this.focusLaunchWave()}
  focusDoctrineChoice(){this.root.querySelector<HTMLButtonElement>('[data-doctrine]')?.focus({preventScroll:true})}
  focusLaunchWave(){if(!this.currentModal())this.root.querySelector<HTMLButtonElement>('[data-action="wave"]:not([hidden]):not(:disabled)')?.focus({preventScroll:true})}
  update(state:GameState,selection:Selection,settings:Settings,celebrating=false){
    this.state=state;if(!this.started)this.renderCampaign();this.selection=selection;this.celebrating=celebrating;this.root.classList.toggle('reduced-motion',settings.reducedMotion);this.root.classList.toggle('is-celebrating',celebrating);this.show('boss-finish',celebrating);
    const totalGate=20+LOADOUTS[state.config.loadout].gateBonus;
    this.text('money',Math.floor(state.money).toLocaleString());this.text('integrity',String(Math.ceil(state.integrity)));this.text('wave',String(state.wave).padStart(2,'0'));this.text('speed',`${state.speed}×`);
    this.el('integrity-bar').style.width=`${Math.max(0,Math.min(100,state.integrity/totalGate*100))}%`;this.el('integrity-bar').classList.toggle('critical',state.integrity<=7);
    const combat=state.phase==='combat',done=state.phase==='won'||state.phase==='lost',pending=state.doctrineOffers.length>0,blocked=state.paused||done||pending||celebrating,next=state.config.mode==='endless'?state.wave+(combat?0:1):Math.min(10,state.wave+(combat?0:1));
    this.el('game').classList.toggle('is-combat',combat);
    this.text('wave-label',pending?'เลือกพลังเสริม':combat?'กำลังป้องกัน':state.phase==='prep'?`เวฟถัดไปใน ${Math.ceil(state.prepTime)} วิ`:'พร้อมเมื่อไหร่ก็ลุย');
    this.text('wave-name',combat?`เวฟ ${state.wave}`:`เตรียมรับเวฟ ${next}`);this.show('intel',false);
    const launch=this.root.querySelector<HTMLButtonElement>('[data-action="wave"]')!;
    launch.hidden=combat||done;launch.disabled=blocked;
    this.text('launch-label',`เริ่มเวฟ ${next}`);
    const bonus=earlyWaveBonus(state);this.show('launch-bonus',state.phase==='prep'&&!pending);this.text('launch-bonus',`เริ่มก่อน รับ +${bonus}`);launch.title=pending?'เลือกพลังเสริมก่อนเริ่มเวฟ':bonus?`เริ่มทันที รับเงินเพิ่ม ${bonus} · รอนานโบนัสยิ่งลด`:'เริ่มเวฟถัดไป';
    this.show('combat-info',combat);this.text('enemy-count',`เหลือ ${state.enemies.length+state.queue.length}`);this.text('kills',`กำจัด ${state.kills}`);
    for(const action of ['speed','pause','camera'])this.root.querySelector<HTMLButtonElement>(`.toolbar [data-action="${action}"]`)!.disabled=blocked;
    for(const kind of kinds){const card=this.root.querySelector<HTMLButtonElement>(`button[data-kind="${kind}"]`)!;card.classList.toggle('selected',selection.kind===kind);card.classList.toggle('unaffordable',state.money<TOWERS[kind].cost);card.setAttribute('aria-pressed',String(selection.kind===kind));card.disabled=blocked||(state.config.mode==='challenge'&&(kind==='flamer'||kind==='stasis'||state.towers.length>=6));}
    for(const ability of ['barrage','overcharge'] as const){
      const button=this.root.querySelector<HTMLButtonElement>(`[data-ability="${ability}"]`)!,cooldown=state.cooldowns[ability],seconds=ability==='barrage'?(state.doctrines.includes('orbital_mastery')?45:60):(state.doctrines.includes('orbital_mastery')?30:40);
      button.disabled=!combat||blocked||cooldown>0;button.classList.toggle('selected',selection.ability===ability);button.setAttribute('aria-pressed',String(selection.ability===ability));this.text(ability,cooldown>0?`${Math.ceil(cooldown)} วิ`:'');
      button.style.setProperty('--cooldown',`${Math.min(100,cooldown/seconds*100)}%`);
      button.title=ability==='barrage'?`ถล่มพื้นที่และหยุดการพุ่ง · คูลดาวน์ ${seconds} วิ`:`เร่งยิงป้อม 6 วิ · คูลดาวน์ ${seconds} วิ`;
    }
    this.updateFieldCommands(state,selection,blocked,combat,done);
    this.updateInspector(state,selection,blocked,combat,done);
    this.updateDoctrines(state);
    const honors=honorTracker(this.profile,state);
    for(const [name,html] of [['honor-summary',honors.summary],['honor-detail',honors.detail]]){const el=this.el(name);if(el.dataset.key!==html){el.innerHTML=html;el.dataset.key=html}}
    this.updateThreats(state,combat);
    const commandPrompts:Record<Command,string>={moveHero:'แตะจุดที่จะย้ายไป',heroSkill:'แตะเป้าหมายใกล้ฮีโร่',reinforcements:'แตะข้างทางเดิน',rally:'แตะทางเดินใกล้ Barracks',barrage:'แตะจุดที่จะถล่ม',overcharge:'แตะป้อมที่จะเร่งยิง'};
    const prompt=selection.ability?commandPrompts[selection.ability]:selection.kind?'แตะฐานวงกลมเพื่อสร้าง':'';this.text('prompt-text',prompt);this.show('prompt',!!prompt&&!done&&!pending);
    if(done)this.updateResults(state);
    for(const key of ['sound','volume','quality','reducedMotion'] as const){const input=this.root.querySelector<HTMLInputElement>(`[data-setting="${key}"]`)!;if(document.activeElement===input)continue;if(key==='sound'||key==='reducedMotion')input.checked=settings[key];else input.value=String(settings[key]);}
    this.syncModals();
  }
  private updateFieldCommands(state:GameState,selection:Selection,blocked:boolean,combat:boolean,done:boolean){
    const map=getMap(state.config.map),hero=HEROES[state.config.hero],hp=Math.max(0,Math.ceil(state.hero.hp)),totalGate=20+LOADOUTS[state.config.loadout].gateBonus;
    this.text('gate-total',` / ${totalGate}`);this.text('wave-total',state.config.mode==='endless'?' / ∞':' / 10');
    this.el('game').classList.toggle('split-gates',state.gates.length>1);
    this.text('battle-context',state.gates.length>1?state.gates.map((v,i)=>`ประตู ${i+1}: ${Math.ceil(v)}/${totalGate/state.gates.length}`).join('   •   '):map.name);
    this.text('hero-name',hero.name);this.text('hero-level',`Lv.${state.hero.level}`);this.text('hero-health',state.hero.respawn>0?`กลับมาใน ${Math.ceil(state.hero.respawn)} วิ`:`${hp} / ${Math.ceil(state.hero.maxHp)}`);this.el('hero-bar').style.width=`${Math.max(0,Math.min(100,state.hero.hp/state.hero.maxHp*100))}%`;
    this.text('hero-skill-name',state.config.hero==='captain'?'ฮีล':state.config.hero==='techmarine'?'ซ่อม':'พายุ');
    for(const ability of ['moveHero','heroSkill','reinforcements'] as const){
      const button=this.root.querySelector<HTMLButtonElement>(`[data-ability="${ability}"]`)!,cooldown=ability==='moveHero'?0:state.cooldowns[ability];
      button.disabled=blocked||(ability!=='moveHero'&&!combat)||(ability!=='reinforcements'&&state.hero.hp<=0)||cooldown>0;button.classList.toggle('selected',selection.ability===ability);button.setAttribute('aria-pressed',String(selection.ability===ability));
      if(ability!=='moveHero'){this.text(ability,cooldown>0?`${Math.ceil(cooldown)} วิ`:'');const duration=ability==='reinforcements'?(state.doctrines.includes('rapid_deployment')?15:25):state.config.hero==='techmarine'?30:35;button.style.setProperty('--cooldown',`${Math.min(100,cooldown/duration*100)}%`)}
      if(ability==='heroSkill'){button.title=`${hero.skillName} · เล็งในระยะ 7 · ${state.config.hero==='techmarine'?'ซ่อมทหารในระยะ 3 และป้อมในระยะ 4':'ส่งผลในระยะ 3'}`;button.setAttribute('aria-label',button.title)}
    }
    const mechanic=this.el<HTMLButtonElement>('mechanic');mechanic.hidden=map.mechanic==='gates';mechanic.disabled=blocked||(map.mechanic==='diversion'&&(combat||state.money<25))||(map.mechanic==='capture'&&state.mapState.captured);
    mechanic.textContent=map.mechanic==='capture'?state.mapState.captured?'ยึดฐานแล้ว':'ส่งฮีโร่ไปยึดฐาน':'สลับทาง · 25';
    this.text('map-mechanic',map.mechanic==='diversion'?`${state.mapState.diverted?'ทางอ้อม':'ทางหลัก'} · สลับได้ระหว่างเวฟ`:map.mechanic==='gates'?'ต้องรักษาทั้ง 2 ประตู':state.mapState.captured?'เปิดฐานป้อมเพิ่ม 4 จุดแล้ว':`ยึดธง 5 วิ · ${Math.min(100,Math.floor(state.mapState.captureProgress/5*100))}%`);
    const objective=this.el<HTMLButtonElement>('objective');objective.hidden=state.objective.status!=='offered'||state.wave>=8||done;objective.disabled=blocked||combat;objective.title='ศัตรูเพิ่มขึ้น · รักษาเครื่องปฏิกรณ์ 2 เวฟ รับเงิน 100 + เหรียญ 2 + ลดคูลดาวน์สกิล';objective.textContent='รับภารกิจป้องกัน';
    this.text('objective-status',state.objective.status==='active'?`เครื่องปฏิกรณ์ ${Math.ceil(state.objective.hp)}/150 · ${state.objective.completedWaves}/2 เวฟ`:state.objective.status==='success'?'สำเร็จ ✓ สกิลพร้อมเร็วขึ้น':state.objective.status==='failed'?'เครื่องปฏิกรณ์ถูกทำลาย':state.wave>=8?'หมดเวลารับภารกิจ':'ป้องกัน 2 เวฟ → เงิน 100 + เหรียญ 2 · ศัตรูเพิ่ม');
    this.show('objective-chip',state.objective.status==='active');this.text('objective-chip-text',`${Math.ceil(state.objective.hp)} / 150 · ${state.objective.completedWaves}/2`);this.el<HTMLProgressElement>('objective-hp').value=state.objective.hp;
    const preview=this.el('next-wave-preview'),next=state.wave+1,key=JSON.stringify([state.config,next,state.mapState.diverted,state.objective.status]);preview.hidden=combat||done;
    if(!combat&&!done&&preview.dataset.previewKey!==key){const composition=wavePreview(state.config,next,state.mapState.diverted),labels:Record<EnemyKind,string>={termagant:'ฝูง',hormagaunt:'เร็ว',warrior:'เกราะ',carnifex:'เกราะหนัก',tyrant:'บอส',zoanthrope:'โล่',ravener:'พุ่ง',nest:'รัง'};
      preview.innerHTML=`<div>${(Object.entries(composition) as [EnemyKind,number][]).filter(([,n])=>n>0).map(([kind,n])=>`<span class="enemy-chip enemy-${kind}" title="${ENEMIES[kind].name} ×${n}" aria-label="${labels[kind]} ${ENEMIES[kind].name} ${n} ตัว">${icon(kind==='tyrant'?'skull':kind==='carnifex'||kind==='warrior'?'shield':kind==='zoanthrope'?'stasis':kind==='ravener'||kind==='hormagaunt'?'move':'bug')}<b>${n}</b><small>${labels[kind]}</small></span>`).join('')}</div>${state.objective.status==='active'?'<small>+ ศัตรูจากภารกิจเสริม</small>':''}`;preview.dataset.previewKey=key;
    }
    const retire=this.el<HTMLButtonElement>('retire'),canRetire=state.config.mode==='endless'&&state.phase==='prep'&&state.completedWaves>=10;
    this.show('retire',state.config.mode==='endless'&&!done);retire.disabled=!canRetire;retire.title='เก็บคะแนนได้ระหว่างเวฟ หลังผ่าน 10 เวฟ';this.text('pause-save-note',`เวฟ ${state.wave} · บันทึกอัตโนมัติแล้ว`);
  }
  private updateInspector(state:GameState,selection:Selection,blocked:boolean,combat:boolean,done:boolean){
    const tower=state.towers.find(t=>t.id===selection.towerId),kind=tower?.kind??selection.kind;
    this.show('inspector',!done&&(selection.pad!==null||!!kind||!!tower));this.el('inspector').classList.toggle('has-specializations',tower?.level===2);
    this.text('inspect-label',tower?`ฐาน ${tower.pad+1} · ${'★'.repeat(tower.level)}`:selection.pad!==null?`ฐาน ${selection.pad+1}`:'เลือกที่วาง');
    if(kind){
      const spec=towerStats(kind,tower?.level??1,tower?.branch),branch=tower?.branch?BRANCHES[tower.branch]:null;
      this.text('inspect-name',branch?.name??spec.name);this.text('inspect-description',branch?branchUI[tower!.branch!].detail:towerHints[kind]);
      const iconEl=this.el('inspect-icon');if(iconEl.dataset.iconKind!==kind){iconEl.innerHTML=icon(kind);iconEl.dataset.iconKind=kind}iconEl.style.color=spec.color;
      this.text('damage',kind==='barracks'?`3 × ${Math.round(spec.damage)}`:kind==='stasis'?`${Math.round(spec.slow*100)}%`:String(Math.round(spec.damage)));this.text('range',spec.range.toFixed(1));this.text('rate',`${spec.interval.toFixed(2)}s`);
    }else{this.text('inspect-name','สร้างป้อม');this.text('inspect-description','เลือกป้อมด้านล่างเพื่อสร้างที่ฐานนี้');this.el('inspect-icon').innerHTML=icon('shield');this.el('inspect-icon').dataset.iconKind='empty'}
    const locked=selection.pad!==null&&getMap(state.config.map).lockedPads.includes(selection.pad)&&!state.mapState.captured;
    this.show('quick-build',!tower&&!kind&&selection.pad!==null);this.el('inspector').classList.toggle('is-vacant',!tower&&!kind);
    for(const button of this.el('quick-build').querySelectorAll<HTMLButtonElement>('[data-build-kind]')){const k=button.dataset.buildKind as TowerKind;button.disabled=blocked||locked||state.money<TOWERS[k].cost||(state.config.mode==='challenge'&&(k==='flamer'||k==='stasis'||state.towers.length>=6))}
    this.show('tower-stats',!!kind);this.show('inspect-icon',!!kind);this.show('build',!tower&&!!kind&&selection.pad!==null);this.show('upgrade',!!tower&&tower.level!==2);this.show('specialization',tower?.level===2);this.show('sell',!!tower);this.show('targeting',!!tower&&tower.kind!=='stasis'&&tower.kind!=='barracks');this.show('rally',tower?.kind==='barracks');this.el<HTMLButtonElement>('rally').disabled=blocked;this.el('rally').classList.toggle('selected',selection.ability==='rally');this.el('rally').setAttribute('aria-pressed',String(selection.ability==='rally'));this.show('barracks-status',tower?.kind==='barracks');if(tower?.kind==='barracks'){const units=state.allies.filter(a=>a.owner===tower.id),alive=units.filter(a=>a.hp>0).length;this.text('barracks-status',`ทหาร ${alive}/3 · ${units.some(a=>a.respawn>0)?`กลับมาใน ${Math.ceil(Math.min(...units.filter(a=>a.respawn>0).map(a=>a.respawn)))} วิ`:'เกิดใหม่ได้'}`)}
    const hint=tower?tower.disabled>0?`หยุดทำงาน ${Math.ceil(tower.disabled)} วิ`:'':kind?state.money<TOWERS[kind].cost?`ขาดเงินอีก ${Math.ceil(TOWERS[kind].cost-state.money)}`:selection.pad!==null?'พร้อมสร้าง':'แตะฐานวงกลม':locked?'ส่งฮีโร่ไปยึดธงก่อน':'เลือกป้อมเพื่อสร้าง';
    this.text('inspect-hint',hint);this.show('inspect-hint',!!hint);
    const build=this.el<HTMLButtonElement>('build');build.disabled=blocked||locked||!kind||state.money<(kind?TOWERS[kind].cost:0);build.textContent=kind?`สร้าง · ${TOWERS[kind].cost}`:'สร้างที่นี่';
    if(!tower)return;
    const cost=upgradeCost(tower,state.doctrines),upgrade=this.el<HTMLButtonElement>('upgrade');
    upgrade.textContent=tower.level===3?'อัปเกรดเต็มแล้ว':`อัปเกรด ★★ · ${cost}`;upgrade.disabled=blocked||tower.level!==1||state.money<cost;
    const options=this.el('branch-options');
    if(tower.level===2){
      if(options.dataset.branchKind!==tower.kind){options.innerHTML=branchesFor(tower.kind).map(id=>{const branch=BRANCHES[id],ui=branchUI[id];return `<div class="branch-choice"><button class="branch-option" data-branch="${id}" aria-describedby="branch-description-${id}"><span class="branch-top"><strong>${branch.name}</strong><span class="branch-cost"></span></span><span class="branch-tag">${ui.title}</span><span class="branch-up">${ui.up}</span><span class="branch-down">${ui.down}</span></button><details><summary>รายละเอียด</summary><p class="branch-description" id="branch-description-${id}">${ui.detail}</p></details></div>`}).join('');options.dataset.branchKind=tower.kind}
      for(const button of options.querySelectorAll<HTMLButtonElement>('[data-branch]')){button.disabled=blocked||state.money<cost;button.querySelector('.branch-cost')!.textContent=String(cost);button.setAttribute('aria-label',`${BRANCHES[button.dataset.branch as BranchId].name} ราคา ${cost} · เลือกแล้วเปลี่ยนสายไม่ได้`)}
    }
    const sell=this.el<HTMLButtonElement>('sell');sell.textContent=combat?'ขายได้ระหว่างเวฟ':`ขายคืน +${Math.floor(tower.invested*.7)}`;sell.disabled=combat||blocked;
    for(const button of this.root.querySelectorAll<HTMLButtonElement>('[data-target]')){button.classList.toggle('selected',button.dataset.target===tower.target);button.setAttribute('aria-pressed',String(button.dataset.target===tower.target));button.disabled=blocked}
  }
  private updateDoctrines(state:GameState){
    const strip=this.el('doctrine-strip'),key=state.doctrines.join(',');this.show('doctrine-strip',state.doctrines.length>0);this.el('game').classList.toggle('has-doctrines',state.doctrines.length>0);
    if(strip.dataset.key!==key){strip.innerHTML=state.doctrines.map(id=>{const d=doctrineUI[id];return `<div class="doctrine-chip"><button data-doctrine-info="${id}" aria-expanded="false" aria-controls="active-doctrine-${id}" aria-label="${d.name}">${icon(d.icon)}</button><div class="doctrine-tooltip" id="active-doctrine-${id}"><strong>${d.name} ${d.value}</strong><span>${d.hint}</span></div></div>`}).join('');strip.dataset.key=key}
    const offers=this.el('doctrine-options'),offerKey=state.doctrineOffers.join(',');
    if(offers.dataset.key!==offerKey){offers.innerHTML=state.doctrineOffers.map(id=>{const d=doctrineUI[id];return `<button class="doctrine-option" data-doctrine="${id}" aria-describedby="doctrine-effect-${id}">${icon(d.icon)}<strong>${d.name}</strong><b class="doctrine-value">${d.value}</b><span class="doctrine-effect" id="doctrine-effect-${id}">${d.hint}</span><span class="doctrine-select">เลือก ${icon('arrow')}</span></button>`}).join('');offers.dataset.key=offerKey}
    const rerolled=(state.doctrineRerolledWave??0)===state.doctrineWave;
    this.root.querySelector<HTMLButtonElement>('[data-action="reroll-doctrine"]')!.disabled=state.paused||state.doctrineOffers.length!==3||rerolled||state.money<DOCTRINE_REROLL_COST;
    this.text('reroll-label',rerolled?'ใช้แล้ว':`สุ่มใหม่ ${DOCTRINE_REROLL_COST}`);
    this.text('doctrine-wave',`ผ่านเวฟ ${state.doctrineWave||state.wave} · รางวัล ${Math.min(3,state.doctrines.length+1)}/3`);
  }
  private updateThreats(state:GameState,combat:boolean){
    const boss=state.enemies.find(enemy=>enemy.kind==='tyrant'&&enemy.hp>0);this.show('boss-status',combat&&!!boss);
    if(boss){const percentage=Math.max(0,Math.min(100,boss.hp/boss.maxHp*100));this.text('boss-value',`${Math.ceil(percentage)}%`);this.text('boss-phase',`เฟส ${boss.bossPhase} · ${boss.weakTime>0?`จุดอ่อน ${Math.ceil(boss.weakTime)} วิ`:state.enemies.some(e=>e.kind==='nest'&&e.hp>0)?'ทำลายรังปลดโล่':'กำลังบุก'}${state.hazards.length?' · หลบกรด!':''}`);this.el('boss-bar').style.width=`${percentage}%`;this.el('boss-health').setAttribute('aria-valuenow',String(Math.ceil(percentage)));this.el('boss-health').setAttribute('aria-valuetext',`${Math.ceil(boss.hp).toLocaleString()} of ${Math.ceil(boss.maxHp).toLocaleString()} health`)}
    const winding=state.enemies.filter(enemy=>enemy.kind==='ravener'&&enemy.chargePhase==='winding'&&enemy.hp>0).length,charging=state.enemies.filter(enemy=>enemy.kind==='ravener'&&enemy.chargePhase==='charging'&&enemy.hp>0).length,barrier=state.enemies.some(enemy=>enemy.hp>0&&(enemy.barrier||enemy.kind==='zoanthrope'));
    this.show('charge-warning',combat&&(winding>0||charging>0));this.show('barrier-warning',combat&&barrier);this.show('threat-signals',combat&&(winding>0||charging>0||barrier));
    this.text('charge-warning',winding?`เตรียมพุ่ง ${winding} · ใช้ Stasis`:charging?`กำลังพุ่ง ${charging} · สโลว์หรือถล่ม`:'');
  }
  private updateResults(state:GameState){
    const won=state.phase==='won';this.text('result-tag',won?'ชัยชนะ':'ฐานถูกทำลาย');this.text('result-title',won?'ป้องกันสำเร็จ!':'ลองวางแผนใหม่');this.text('result-description',won?'ผ่านครบ 10 เวฟ':'เปลี่ยนแนวป้อมแล้วกลับมาลุยอีกครั้ง');this.text('result-wave',state.config.mode==='endless'?String(state.wave):`${state.wave} / 10`);this.text('result-kills',String(state.kills));this.text('result-gate',String(state.integrity));this.text('result-rewards',`${state.rewardStars} ★  +${state.rewardMedals} เหรียญ`);if(state.config.mode==='endless')this.text('result-description',`เก็บคะแนนที่เวฟ ${state.wave} แล้ว`);
    const honorEl=this.el('result-honors'),honors=honorCards(this.profile,state.config.map,state);if(honorEl.dataset.key!==honors){honorEl.innerHTML=honors;honorEl.dataset.key=honors}
    const result=this.el('result-icon');if(result.dataset.phase!==state.phase){result.innerHTML=icon(won?'shield':'skull');result.dataset.phase=state.phase}
    const records=[...state.records].sort((a,b)=>b.damage-a.damage||b.kills-a.kills||a.id-b.id),performance=this.el('performance'),key=JSON.stringify(records);
    if(performance.dataset.key===key)return;
    performance.innerHTML=records.length?`<table><caption>รวมป้อมที่ขายคืนแล้ว</caption><thead><tr><th scope="col">ป้อม</th><th scope="col">ดาเมจ</th><th scope="col">กำจัด</th><th scope="col">ช่วยทีม</th></tr></thead><tbody>${records.map((record,index)=>`<tr${index===0&&record.damage>0?' class="top-defender"':''}><th scope="row"><span class="rank">${String(index+1).padStart(2,'0')}</span><span><strong>${record.branch?BRANCHES[record.branch].name:TOWERS[record.kind].name}</strong><small>ฐาน ${record.pad+1}${record.branch?` · ${TOWERS[record.kind].short}`:''}${record.sold?' · ขายแล้ว':''}</small></span></th><td>${Math.round(record.damage).toLocaleString()}</td><td>${record.kills.toLocaleString()}</td><td class="support-stats">${record.kind==='stasis'?`${Math.round(record.slowSeconds)} วิ สโลว์<br>${record.interrupts} หยุดพุ่ง`:record.kind==='barracks'?`${Math.round(record.blockedSeconds)} วิ ขวาง`:record.interrupts?`${record.interrupts} หยุดพุ่ง`:'—'}</td></tr>`).join('')}</tbody></table>`:'<p class="no-records">รอบนี้ยังไม่ได้สร้างป้อม</p>';
    performance.insertAdjacentHTML('beforeend',`<p class="hero-performance">${HEROES[state.config.hero].name} · Lv.${state.hero.level} · ${Math.round(state.hero.damageDealt).toLocaleString()} ดาเมจ · กำจัด ${state.hero.kills}</p>`);performance.dataset.key=key;
  }
  notify(message:string){clearTimeout(this.toastTimer);if(this.currentModal())return;this.text('toast',message);this.show('toast',true);this.toastTimer=setTimeout(()=>this.show('toast',false),2400)}
  showError(message:string){this.errorOpen=true;this.text('error-message',message);this.syncModals()}
}

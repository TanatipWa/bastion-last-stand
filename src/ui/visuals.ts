import type { BranchId, DoctrineId, TowerKind } from '../game/types';
const icons:Record<string,string> = {
  coin:'<circle cx="32" cy="32" r="23"/><path d="M32 16v32m9-25H27a6 6 0 0 0 0 12h10a6 6 0 0 1 0 12H23"/>',
  wave:'<path d="m9 44 11-24 12 24 12-24 11 24M9 53h46"/>',
  flag:'<path d="M15 56V8h34l-8 12 8 12H15"/>',
  move:'<path d="M32 7v50M7 32h50M23 16l9-9 9 9M23 48l9 9 9-9M16 23l-9 9 9 9M48 23l9 9-9 9"/>',
  people:'<circle cx="32" cy="19" r="8"/><circle cx="12" cy="25" r="5"/><circle cx="52" cy="25" r="5"/><path d="M19 54V40a13 13 0 0 1 26 0v14M4 49V39a8 8 0 0 1 12-7m44 17V39a8 8 0 0 0-12-7"/>',
  clock:'<circle cx="32" cy="32" r="23"/><path d="M32 16v17l12 7"/>',
  info:'<circle cx="32" cy="32" r="23"/><path d="M32 28v18m0-28v3"/>',
  arrow:'<path d="M10 32h42M36 16l16 16-16 16"/>',
  range:'<circle cx="32" cy="32" r="20"/><path d="M32 4v16m0 24v16M4 32h16m24 0h16"/>',
  damage:'<path d="m14 50 34-34 7-7-1 13-32 34M10 37l17 17M8 56l10-10"/>',
  helmet:'<path d="M13 40V26a19 19 0 0 1 38 0v14L40 55H24zM13 26l14 6v10m24-16-14 6v10M27 52V39h10v13M18 20h28"/>',
  lock:'<rect x="14" y="28" width="36" height="28" rx="4"/><path d="M22 28V17a10 10 0 0 1 20 0v11M32 38v8"/>',
  bug:'<path d="M20 23 13 15m31 8 7-8M15 32H5m44 0h10M18 43l-10 9m38-9 10 9M32 22v31"/><ellipse cx="32" cy="36" rx="15" ry="20"/><path d="m23 14 3-7m15 7-3-7"/>',
  barracks:'<path d="M10 50V22l8-7h28l8 7v28zM22 50V32h20v18M18 15V9m28 6V9M15 23h7m20 0h7M27 20h10M32 16v8"/>',
  bolter:'<path d="M13 34h35v8H13zM20 23h23v11H20zM25 15h8v10M38 15h8v10M18 42l-5 9m30-9 6 9M11 18h10m-7-5v10"/>',
  flamer:'<path d="M17 39h30v7H17zM23 30h18v9H23zM31 30c-13-9 5-12 0-24 17 13 15 18 4 24M26 46l-6 8m19-8 5 8"/>',
  lascannon:'<path d="m16 34 10-9 19 1 9-9 4 4-10 10-16 2-7 9H13zM23 42v9m-8 3h19M34 21l-1-7m7 8 3-7"/>',
  stasis:'<path d="M20 46h24v6H20zM25 37h14v9H25zM32 9v25M19 16l26 15M45 16 19 31M24 10l8 5 8-5M16 22l8 1-1 8M48 22l-8 1 1 8"/>',
  barrage:'<path d="m17 8 22 22m-8-22 17 17M12 27l13 13 10-10-13-13zM30 42l5-6 5 13 13 5-19 2-14-11M8 49l9-3"/>',
  overcharge:'<path d="M35 5 13 34h17l-3 24 24-33H34z"/>',
  shield:'<path d="M32 6 52 14v18c0 14-20 24-20 24S12 46 12 32V14zM32 17v26m-9-16h18"/>',
  gear:'<path d="m28 8-2 8-7 4-8-2-5 10 6 6v8l7 7 8-2 7 4 8-2 3-8 7-4 2-12-7-4-3-8-8-4z"/><circle cx="30" cy="31" r="9"/>',
  pause:'<path d="M21 14v36M43 14v36"/>',
  cross:'<path d="m18 18 28 28m0-28L18 46"/>',
  reset:'<path d="M15 26a20 20 0 1 1 0 17M15 11v15h15"/>',
  sound:'<path d="m11 25 10 0 13-12v38L21 39H11zM43 23c7 5 7 13 0 18M49 15c13 10 13 24 0 34"/>',
  skull:'<path d="M15 28a17 17 0 1 1 34 0v12l-9 4v10H24V44l-9-4zM25 44v10m7-10v10m7-10v10"/><circle cx="24" cy="30" r="3"/><circle cx="40" cy="30" r="3"/>',
};
export function icon(name:string){return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${icons[name]??icons.shield}</svg>`}

export const towerRoles:Record<TowerKind,string>={bolter:'ยิงรัว',flamer:'เผาหมู่',lascannon:'เจาะเกราะ',stasis:'สโลว์',barracks:'ขวางทาง'};
export const towerHints:Record<TowerKind,string>={bolter:'เหมาะกับศัตรูตัวเล็ก',flamer:'เผาศัตรูเป็นกลุ่ม',lascannon:'ยิงไกล ทะลุเกราะ',stasis:'จับคู่กับป้อมดาเมจ',barracks:'ทหาร 3 คน เกิดใหม่ได้'};
export const branchUI:Record<BranchId,{title:string;up:string;down:string;detail:string}>={
 hailstorm:{title:'ยิงรัว',up:'พักยิง −40%',down:'ดาเมจ −28%',detail:'ยิงได้ถี่ขึ้น เหมาะกับฝูงศัตรู แต่แต่ละนัดเบาลง'},
 executioner:{title:'กระสุนสังหาร',up:'ดาเมจ +70%',down:'พักยิง +40%',detail:'ศัตรูเลือดต่ำกว่า 35% โดนแรงขึ้นอีก 60%'},
 inferno:{title:'ไฟวงกว้าง',up:'ระยะ +0.6',down:'ดาเมจ −15%',detail:'กรวยไฟกว้างขึ้น เผาศัตรูได้มากขึ้นในแต่ละครั้ง'},
 napalm:{title:'พื้นลุกไหม้',up:'ไฟบนพื้น 3 วิ',down:'ดาเมจ −25%',detail:'ศัตรูยังติดไฟต่อหลังเดินออกจากเปลวเพลิง'},
 lance:{title:'ลำแสงทะลวง',up:'ดาเมจ +35% · ระยะ +1',down:'พักยิง +15%',detail:'ลำแสงทะลุศัตรูทุกตัวที่อยู่ในแนวยิง'},
 prism:{title:'สายฟ้าชิ่ง',up:'ชิ่งเพิ่ม 2 ตัว',down:'ดาเมจแรก −30%',detail:'แต่ละการชิ่งเหลือดาเมจ 65% ของครั้งก่อน'},
 deepfreeze:{title:'แช่แข็งหนัก',up:'สโลว์ 60%',down:'ระยะ −0.6',detail:'บอสต้านผลสโลว์ได้ครึ่งหนึ่ง'},
 widefield:{title:'สโลว์วงกว้าง',up:'ระยะ +2',down:'สโลว์ 32%',detail:'ครอบคลุมหลายทางและหยุดการพุ่ง แต่สโลว์เบาลง'},
 vanguard:{title:'ทหารแนวหน้า',up:'เลือด +80%',down:'ต่อสู้ระยะประชิด',detail:'ทหาร 3 คน เกราะหนา รับดาเมจน้อยลง และโจมตีประชิดแรงขึ้น'},
 fireteam:{title:'หน่วยยิงสนับสนุน',up:'เจาะเกราะ · ระยะ 3.5',down:'เลือดเท่าเดิม',detail:'ยิงจากระยะไกลและยังขวางศัตรูที่เข้าประชิดได้'},
};
export const doctrineUI:Record<DoctrineId,{icon:string;name:string;value:string;hint:string}>={
 cryoflame:{icon:'flamer',name:'สโลว์แล้วเผา',value:'+20%',hint:'ไฟแรงขึ้นเมื่อศัตรูติดสโลว์ · เผาต่อ 4 วิ'},
 machine_spirit:{icon:'lascannon',name:'ล็อกเป้าเดิม',value:'สูงสุด +60%',hint:'Lascannon แรงขึ้นทีละ 12% · เปลี่ยนเป้าจะรีเซ็ต'},
 war_chest:{icon:'coin',name:'เงินจากการฆ่า',value:'+20%',hint:'ทุกตัวที่กำจัด ให้เงินเพิ่ม'},
 orbital_mastery:{icon:'barrage',name:'สกิลพร้อมไว',value:'45 / 30 วิ',hint:'คูลดาวน์ถล่ม / เร่งยิง'},
 forge_pact:{icon:'gear',name:'อัปเกรดถูกลง',value:'−20%',hint:'ลดราคาทั้งอัปเกรดและสายพิเศษ'},
 brotherhood:{icon:'shield',name:'ทหารเกราะหนา',value:'HP +25%',hint:'Marines จาก Barracks ทนขึ้นทุกกอง'},
 heroic:{icon:'helmet',name:'ฮีโร่แนวหน้า',value:'พลัง +25%',hint:'โจมตีและสกิลทำดาเมจของฮีโร่แรงขึ้น'},
 rapid_deployment:{icon:'people',name:'ทหารพร้อมไว',value:'15 วิ / 30 วิ',hint:'คูลดาวน์ / เวลาประจำการระหว่างต่อสู้'},
 vengeance:{icon:'shield',name:'รักษาแนวรับ',value:'ฐาน +4',hint:'ศัตรูหลุดครั้งต่อไป → ป้อมแรงขึ้น 25% นาน 8 วิ'},
};

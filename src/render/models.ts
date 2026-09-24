import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Ally, BranchId, EnemyKind, TowerKind } from '../game/types';

// Chamfered armor catches the key/rim lights without a post-processing pass.
const plateShape = new THREE.Shape();
plateShape.moveTo(-.38,-.5);plateShape.lineTo(.38,-.5);plateShape.lineTo(.5,-.38);plateShape.lineTo(.5,.38);plateShape.lineTo(.38,.5);plateShape.lineTo(-.38,.5);plateShape.lineTo(-.5,.38);plateShape.lineTo(-.5,-.38);plateShape.closePath();
const armorPlate = new THREE.ExtrudeGeometry(plateShape,{depth:.82,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.045,bevelThickness:.09,curveSegments:1});
armorPlate.translate(0,0,-.41);

// Sculpted primitives are shared by every instance, including dense swarms.
const carapace = new THREE.SphereGeometry(1, 12, 8);
const shellVertices = carapace.getAttribute('position');
for (let i = 0; i < shellVertices.count; i++) {
  const x = shellVertices.getX(i), y = shellVertices.getY(i), z = shellVertices.getZ(i);
  shellVertices.setXYZ(i, x * (1 - Math.max(0, -z) * .16), y > 0 ? y * .85 + (1 - Math.abs(x)) * (1 - Math.abs(z)) * .3 : y * .38, z);
}
carapace.computeVertexNormals();
const talon = new THREE.LatheGeometry(Array.from({ length: 9 }, (_, i) => {
  const t = i / 8; return new THREE.Vector2(Math.pow(1 - t, 1.35), t - .5);
}), 9);
const clawVertices = talon.getAttribute('position');
for (let i = 0; i < clawVertices.count; i++) {
  const t = clawVertices.getY(i) + .5;
  clawVertices.setZ(i, clawVertices.getZ(i) + t * t * .7);
}
talon.computeVertexNormals();

// All geometric primitives and materials are shared for the life of the scene.
export const geometry = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plate: armorPlate,
  rounded: new RoundedBoxGeometry(1, 1, 1, 2, .12),
  organic: new THREE.SphereGeometry(1, 12, 8),
  carapace,
  talon,
  torus: new THREE.TorusGeometry(1, .075, 5, 24),
  ball: new THREE.SphereGeometry(1, 9, 6),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone: new THREE.ConeGeometry(1, 1, 7),
  octa: new THREE.OctahedronGeometry(1),
};
export const materials = {
  stone: new THREE.MeshStandardMaterial({ color: 0x4b4842, roughness: .96, envMapIntensity: .16 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x20272a, roughness: .75, metalness: .45, envMapIntensity: .4 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9daeb9, roughness: .34, metalness: .72 }),
  olive: new THREE.MeshStandardMaterial({ color: 0x67746a, roughness: .57, metalness: .32, envMapIntensity: .7 }),
  bronze: new THREE.MeshStandardMaterial({ color: 0xc99a4e, roughness: .36, metalness: .7 }),
  black: new THREE.MeshStandardMaterial({ color: 0x111718, roughness: .8, envMapIntensity: .25 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xffb961, emissive: 0xff7c22, emissiveIntensity: 2.3 }),
  cyan: new THREE.MeshStandardMaterial({ color: 0xb0eee9, emissive: 0x43cace, emissiveIntensity: 1.6 }),
  purple: new THREE.MeshStandardMaterial({ color: 0xb8a7fa, emissive: 0x8566e8, emissiveIntensity: 1.6 }),
  red: new THREE.MeshStandardMaterial({ color: 0xa53d34, roughness: .6, metalness: .2 }),
  bone: new THREE.MeshStandardMaterial({ color: 0xd7bf98, roughness: .85, envMapIntensity: .35 }),
};
export type MaterialName = keyof typeof materials;
export type Primitive = keyof typeof geometry;
export function piece(parent: THREE.Object3D, shape: Primitive, material: MaterialName | THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry[shape], typeof material === 'string' ? materials[material] : material);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

// Merge each material bucket so detailed static structures cost only a few draws.
export function bake(group: THREE.Group): THREE.Group {
  group.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.traverse(o => { if (o instanceof THREE.Mesh && !Array.isArray(o.material)) {
    const list = buckets.get(o.material) ?? [];
    const normalized = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    list.push(normalized.applyMatrix4(o.matrixWorld)); buckets.set(o.material, list);
  }});
  const result = new THREE.Group();
  for (const [material, geometries] of buckets) {
    const merged = mergeGeometries(geometries, false);
    if (merged) { const mesh = new THREE.Mesh(merged, material); mesh.castShadow = true; mesh.receiveShadow = true; result.add(mesh); }
    for (const g of geometries) g.dispose();
  }
  return result;
}

// Raised heraldry and armor fasteners merge into the material buckets.
function crest(parent:THREE.Group,x:number,y:number,z:number,scale:number){
  piece(parent,'octa','bone',x,y,z,.12*scale,.15*scale,.06*scale);
  piece(parent,'box','bronze',x,y-.15*scale,z,.1*scale,.09*scale,.06*scale);
  for(const side of [-1,1])for(let i=0;i<3;i++)piece(parent,'plate','bronze',x+side*(.2+i*.12)*scale,y+(.03-i*.055)*scale,z,.22*scale,(.2-i*.025)*scale,.045*scale,0,0,side*-.28);
}
function armorRivets(parent:THREE.Group,x:number,y:number,z:number,width:number,height:number){
  for(const side of [-1,1])for(const up of [-1,1])piece(parent,'ball','steel',x+side*width/2,y+up*height/2,z,.026,.026,.022);
}
function rankArmor(parent:THREE.Group,level:number){
  for(let i=0;i<level;i++)piece(parent,'box','bone',(i-(level-1)/2)*.15,.53,.56,.08,.045,.08,0,0,-.45);
  if(level>1)for(const side of [-1,1]){
    piece(parent,'plate','olive',side*.53,.66,0,.22,.44,.64,0,0,-side*.13);
    piece(parent,'box','bronze',side*.66,.72,0,.035,.045,.46);
  }
}

function bore(parent: THREE.Group, x: number, y: number, z: number, radius: number) {
  piece(parent, 'cylinder', 'black', x, y, z - .055, radius * .88, .07, radius * .88, Math.PI / 2);
  piece(parent, 'torus', 'steel', x, y, z, radius, radius, radius);
  for (const side of [-1, 1]) piece(parent, 'box', 'dark', x + side * radius, y, z - .08, radius * .15, radius * .72, .14);
}

export interface TurretModel { root: THREE.Group; head: THREE.Group; core: THREE.Mesh; rotor?: THREE.Group; }
export function turretModel(kind: TowerKind, branch: BranchId | null = null, level = 1): TurretModel {
  if (kind === 'barracks') return barracksModel(branch,level);
  const base = new THREE.Group(); const raw = new THREE.Group();
  piece(raw, 'cylinder', 'dark', 0, .26, 0, .75, .4, .75);
  piece(raw, 'cylinder', 'bronze', 0, .49, 0, .57, .1, .57);
  piece(raw, 'cylinder', 'olive', 0, .7, 0, .44, .36, .44);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4;
    piece(raw, 'rounded', 'dark', Math.sin(a) * .65, .18, Math.cos(a) * .65, .28, .24, .5, 0, a);
    piece(raw, 'box', 'bronze', Math.sin(a) * .62, .32, Math.cos(a) * .62, .13, .05, .25, 0, a);
  }
  for (const side of [-1, 1]) {
    piece(raw, 'cylinder', 'steel', side * .35, .69, .27, .075, .39, .075, 0, 0, -side * .27);
    piece(raw, 'cylinder', 'dark', side * .41, .52, .27, .105, .26, .105, 0, 0, -side * .27);
    piece(raw, 'rounded', 'olive', side * .58, .43, -.28, .32, .22, .45);
  }
  rankArmor(raw,level);
  base.add(bake(raw)); const headRaw = new THREE.Group();
  piece(headRaw, 'rounded', kind==='flamer'?'red':kind==='lascannon'?'steel':'olive', 0, 1.08, 0, .96, .53, .7);
  piece(headRaw, 'box', 'bronze', 0, 1.36, -.08, .44, .05, .38);
  piece(headRaw, 'box', 'dark', 0, 1.14, -.4, .68, .36, .24);
  // Side plates, cooling louvres and optical sight give the gun carriage a readable scale.
  for(const side of [-1,1]){
    piece(headRaw,'plate','dark',side*.5,1.12,-.08,.11,.46,.67);
    for(let i=0;i<4;i++)piece(headRaw,'box','steel',side*.563,1.14,-.27+i*.12,.025,.19,.042,0,0,side*.25);
    piece(headRaw,'ball','bronze',side*.54,1.36,.23,.045,.045,.045);
  }
  piece(headRaw,'plate','dark',.29,1.45,.16,.19,.13,.25);
  piece(headRaw,'box',kind==='lascannon'?'cyan':'amber',.29,1.46,.295,.11,.045,.025);
  crest(headRaw,0,1.18,.37,.47);
  if (kind === 'bolter') {
    for (const x of [-.22, .22]) {
      piece(headRaw, 'cylinder', 'steel', x, 1.13, .66, .12, .82, .12, Math.PI / 2);
      bore(headRaw, x, 1.13, 1.12, .14);
      piece(headRaw, 'cylinder', 'dark', x * 2.4, 1.05, -.12, .26, .32, .26, 0, 0, Math.PI / 2);
      piece(headRaw, 'cylinder', 'bronze', x * 3.1, 1.05, -.12, .23, .07, .23, 0, 0, Math.PI / 2);
    }
    // Belt feeds and ribbed barrels make this read as a ballistic weapon.
    for(const side of [-1,1]){
      for(let i=0;i<4;i++)piece(headRaw,'cylinder','bronze',side*.48,1.13,.03+i*.13,.035,.17,.035);
      for(let i=0;i<3;i++)piece(headRaw,'torus','dark',side*.22,1.13,.49+i*.16,.15,.15,.15);
      armorRivets(headRaw,side*.52,1.13,.31,.13,.33);
    }
  } else if (kind === 'flamer') {
    piece(headRaw, 'cylinder', 'steel', 0, 1.14, .62, .22, .85, .22, Math.PI / 2);
    piece(headRaw, 'cylinder', 'dark', 0, 1.14, .98, .265, .12, .265, Math.PI / 2);
    bore(headRaw, 0, 1.14, 1.12, .27);
    for (const x of [-.5, .5]) { piece(headRaw, 'cylinder', 'red', x, 1.08, -.1, .19, .66, .19); piece(headRaw, 'cylinder', 'bronze', x, 1.4, -.1, .15, .08, .15); }
    for(const side of [-1,1]){
      piece(headRaw,'torus','bronze',side*.5,1.07,-.1,.197,.197,.197,Math.PI/2);
      piece(headRaw,'torus','dark',side*.5,.87,-.1,.198,.198,.198,Math.PI/2);
      piece(headRaw,'box','bone',side*.5,1.11,.095,.1,.23,.018);
      piece(headRaw,'cylinder','steel',side*.5,1.55,-.1,.04,.23,.04);
      piece(headRaw,'torus','red',side*.5,1.67,-.1,.12,.12,.12,Math.PI/2);
    }
    for(const x of [-.14,0,.14])piece(headRaw,'box','amber',x,1.13,1.174,.055,.1,.025);
  } else if (kind === 'lascannon') {
    piece(headRaw, 'box', 'dark', 0, 1.15, .78, .36, .38, 1.3);
    for (let i = 0; i < 5; i++) piece(headRaw, 'box', 'cyan', 0, 1.36, .28 + i * .22, .22, .055, .085);
    piece(headRaw, 'rounded', 'steel', 0, 1.15, 1.48, .44, .46, .22);
    piece(headRaw, 'box', 'black', 0, 1.15, 1.6, .25, .22, .02);
    for(const side of [-1,1]){
      piece(headRaw,'cylinder','dark',side*.42,1.16,-.43,.18,.62,.18);
      for(let i=0;i<4;i++)piece(headRaw,'torus','cyan',side*.42,.95+i*.14,-.43,.185,.185,.185,Math.PI/2);
      piece(headRaw,'plate','olive',side*.29,1.15,.79,.14,.49,.9);
    }
    piece(headRaw,'box','cyan',0,1.15,1.614,.15,.14,.018);
  } else {
    piece(headRaw, 'cylinder', 'dark', 0, 1.4, 0, .31, .55, .31);
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3;
      piece(headRaw, 'box', 'steel', Math.sin(a) * .43, 1.65, Math.cos(a) * .43, .12, .94, .18, 0, a, -.1);
      piece(headRaw, 'octa', 'purple', Math.sin(a) * .43, 2.13, Math.cos(a) * .43, .13, .18, .13);
    }
  }
  // Specializations keep the original weapon readable and add a distinct silhouette.
  if (branch === 'hailstorm') {
    for (const x of [-.22, .22]) for (const y of [1.02, 1.24]) {
      piece(headRaw, 'cylinder', 'steel', x, y, .96, .085, .86, .085, Math.PI / 2);
      bore(headRaw, x, y, 1.4, .11);
    }
    for (const x of [-.61, .61]) piece(headRaw, 'cylinder', 'bronze', x, 1.03, -.16, .25, .34, .25, 0, 0, Math.PI / 2);
  } else if (branch === 'executioner') {
    piece(headRaw, 'box', 'steel', 0, 1.14, .92, .38, .32, 1.22);
    piece(headRaw, 'box', 'bronze', 0, 1.14, 1.56, .5, .43, .24);
    piece(headRaw, 'box', 'black', 0, 1.14, 1.69, .3, .2, .025);
    piece(headRaw, 'box', 'red', 0, 1.45, .18, .2, .13, .44);
  } else if (branch === 'inferno') {
    for (const s of [-1, 1]) {
      piece(headRaw, 'cylinder', 'steel', s * .3, 1.14, .95, .16, .74, .16, Math.PI / 2, s * .3);
      piece(headRaw, 'box', 'amber', s * .46, 1.15, 1.21, .2, .14, .09, 0, s * .3);
      piece(headRaw, 'box', 'red', s * .58, 1.32, .42, .1, .48, .36, 0, 0, s * .32);
    }
  } else if (branch === 'napalm') {
    piece(headRaw, 'cylinder', 'red', 0, 1.27, -.64, .34, 1.2, .34, 0, 0, Math.PI / 2);
    for (const x of [-.43, .43]) piece(headRaw, 'cylinder', 'bronze', x, 1.27, -.64, .35, .09, .35, 0, 0, Math.PI / 2);
    piece(headRaw, 'box', 'bronze', 0, 1.15, 1.13, .65, .35, .21);
    piece(headRaw, 'box', 'amber', 0, 1.14, 1.25, .43, .09, .025);
  } else if (branch === 'lance') {
    piece(headRaw, 'box', 'steel', 0, 1.15, 1.53, .26, .27, 1.3);
    for (const x of [-.19, .19]) {
      piece(headRaw, 'box', 'dark', x, 1.15, 1.46, .09, .37, 1.55);
      piece(headRaw, 'box', 'cyan', x, 1.35, 1.46, .06, .035, 1.33);
    }
  } else if (branch === 'prism') {
    for (const s of [-1, 1]) {
      piece(headRaw, 'box', 'steel', s * .5, 1.15, .45, .2, .24, .85, 0, s * .18);
      piece(headRaw, 'octa', 'cyan', s * .56, 1.36, .53, .22, .43, .22, 0, .4);
    }
    piece(headRaw, 'octa', 'purple', 0, 1.58, .02, .2, .3, .2);
  } else if (branch === 'deepfreeze') {
    piece(headRaw, 'octa', 'cyan', 0, 2.23, 0, .31, .65, .31);
    for (const s of [-1, 1]) piece(headRaw, 'box', 'steel', s * .3, 1.91, 0, .08, .76, .2, 0, 0, -s * .22);
  } else if (branch === 'widefield') {
    piece(headRaw, 'cylinder', 'bronze', 0, 1.68, 0, .72, .075, .72);
    piece(headRaw, 'cylinder', 'dark', 0, 1.73, 0, .63, .06, .63);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      piece(headRaw, 'octa', 'purple', Math.sin(angle) * .72, 1.85, Math.cos(angle) * .72, .12, .25, .12);
    }
  }
  const head = bake(headRaw); base.add(head);
  let rotor:THREE.Group|undefined;
  if(kind==='stasis'){
    rotor=new THREE.Group();rotor.position.y=1.98;
    piece(rotor,'torus','bronze',0,0,0,.53,.53,.53,Math.PI/2,.3);
    piece(rotor,'torus','cyan',0,0,0,.4,.4,.4,.6,0,.4);
    head.add(rotor);
  }
  const core = piece(base, 'octa', kind === 'stasis' ? 'purple' : kind === 'lascannon' ? 'cyan' : 'amber', 0, kind === 'stasis' ? 1.95 : 1.42, 0, .13, .16, .13);
  return { root: base, head, core, rotor };
}

export interface CreaturePart { shape: Primitive; surface: 'skin' | 'shell' | 'claw' | 'eye'; transform: THREE.Matrix4; leg: number; }
export function creatureParts(kind: EnemyKind): CreaturePart[] {
  const parts: CreaturePart[] = []; const dummy = new THREE.Object3D();
  const add = (shape: Primitive, surface: CreaturePart['surface'], x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0, leg = -1) => {
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(rx, ry, rz); dummy.updateMatrix();
    const sculpted = shape === 'ball' && surface === 'shell' ? 'carapace'
      : shape === 'ball' && surface === 'skin' ? 'organic'
      : shape === 'cone' && surface === 'claw' ? 'talon' : shape;
    parts.push({ shape: sculpted, surface, transform: dummy.matrix.clone(), leg });
  };
  if (kind === 'nest') {
    add('ball', 'skin', 0, .38, 0, .95, .45, .95);
    add('torus', 'shell', 0, .88, 0, .61, .61, .61, Math.PI / 2);
    add('ball', 'eye', 0, .87, 0, .37, .24, .37);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      add('cone', 'claw', Math.sin(a) * .7, .85, Math.cos(a) * .7, .18, 1.5, .19, Math.cos(a) * .3, 0, -Math.sin(a) * .3);
      add('ball', 'skin', Math.sin(a) * .94, .2, Math.cos(a) * .94, .32, .2, .32);
    }
    return parts;
  }
  if (kind === 'zoanthrope') {
    // A hovering brain crown, open psychic core and dangling tendrils: no walking legs.
    add('ball', 'skin', 0, 1.48, -.08, .43, .62, .47);
    add('ball', 'shell', 0, 1.73, -.23, .48, .64, .49);
    add('ball', 'skin', 0, 1.92, .13, .39, .45, .32);
    for (let i = 0; i < 4; i++) add('ball', 'skin', (i % 2 ? 1 : -1) * .2, 1.78 + Math.floor(i / 2) * .27, .35, .18, .19, .12);
    add('octa', 'eye', 0, 1.34, .37, .23, .35, .15);
    add('ball', 'skin', 0, 1.3, .34, .25, .22, .28);
    for (const s of [-1, 1]) {
      add('cone', 'shell', s * .45, 1.64, -.26, .2, 1.06, .25, -.24, 0, -s * .43);
      add('ball', 'eye', s * .2, 1.42, .55, .065, .06, .07);
      add('cone', 'claw', s * .17, 1.12, .45, .065, .35, .07, .3, 0, -s * .3);
      add('ball', 'skin', s * .24, .81, -.02, .115, .47, .14, -.3, 0, s * .33, 10 + (s > 0 ? 1 : 0));
      add('cone', 'skin', s * .34, .36, .14, .105, .67, .09, .38, 0, -s * .15, 10 + (s > 0 ? 1 : 0));
    }
    add('cone', 'skin', 0, .65, -.35, .2, 1.12, .14, -.48, 0, 0, 12);
    return parts;
  }
  if (kind === 'ravener') {
    // A long segmented snake body and raised scythes distinguish the charger at a glance.
    for (let i = 0; i < 6; i++) {
      const taper = 1 - i * .135;
      add('ball', i % 2 ? 'shell' : 'skin', Math.sin(i * .95) * .2, .28 + taper * .3, -.35 - i * .32, .36 * taper, .3 * taper, .36, 0, 0, 0, 10 + i);
      if (i < 4) add('cone', 'shell', Math.sin(i * .95) * .2, .58 + taper * .27, -.35 - i * .32, .12 * taper, .31 * taper, .15, -.3, 0, 0, 10 + i);
    }
    add('ball', 'skin', 0, 1.04, .05, .37, .61, .38, .24);
    add('ball', 'shell', 0, 1.21, -.08, .4, .5, .28, .24);
    add('ball', 'skin', 0, 1.46, .46, .28, .26, .41);
    add('ball', 'shell', 0, 1.65, .34, .32, .17, .47);
    add('cone', 'shell', 0, 1.66, .74, .15, .57, .16, Math.PI / 2);
    for (const s of [-1, 1]) {
      add('ball', 'eye', s * .24, 1.48, .7, .07, .055, .08);
      add('cone', 'claw', s * .19, 1.2, .73, .08, .43, .08, .35, 0, -s * .3);
      for (let i = 0; i < 2; i++) {
        add('ball', 'skin', s * .44, 1.17 - i * .32, .35, .13, .17, .45, -.42, s * .4);
        add('cone', 'claw', s * (.69 + i * .1), 1.46 - i * .37, .65, .12, .86, .13, .68, 0, -s * .77);
      }
    }
    return parts;
  }
  const heavy = kind === 'carnifex'; const boss = kind === 'tyrant'; const upright = kind === 'warrior' || boss;
  const h = upright ? 1.05 : .56; const bulk = heavy ? 1.25 : 1;
  add('ball', 'skin', 0, h, 0, .43 * bulk, upright ? .7 : .4, .7);
  add('ball', 'shell', 0, h + .16, -.18, .47 * bulk, upright ? .63 : .35, .6);
  for (let i = 0; i < 3; i++) add('cone', 'shell', 0, h + .5 + (2 - i) * .05, -.15 - i * .22, .16, .42 + (heavy ? .2 : 0), .18, -.4);
  add('ball', 'skin', 0, h + (upright ? .65 : .04), .62, .29, .27, .37);
  add('ball', 'shell', 0, h + (upright ? .83 : .22), .57, .32, .14, .44);
  add('cone', 'shell', 0, h + (upright ? .94 : .23), .95, .15, boss ? .65 : .34, .14, Math.PI / 2);
  for (const s of [-1, 1]) {
    add('ball', 'eye', s * .245, h + (upright ? .68 : .07), .84, .07, .045, .07);
    add('cone', 'claw', s * .17, h + (upright ? .44 : -.15), .87, .075, .29, .075, .3, 0, s * -.2);
  }
  add('talon', 'skin', 0, h - .1, -1.05, .23, 1.25, .19, -Math.PI / 2 - .25);
  for (const side of [-1, 1]) {
    add('organic', 'skin', side * .17, h + (upright ? .53 : -.04), .79, .12, .13, .3);
    for (let i = 0; i < 3; i++) add('talon', 'claw', side * (.12 + i * .06), h + (upright ? .52 : -.04), .94 - i * .05, .035, .16, .035, .4, 0, side * -.25);
  }
  if (upright) {
    // Two connected, weight-bearing legs under the pelvis, with planted toes.
    for (const side of [-1, 1]) {
      const leg = side > 0 ? 1 : 0;
      add('organic', 'skin', side * .36, .61, -.12, .2, .4, .23, -.18, 0, side * .28, leg);
      add('carapace', 'shell', side * .47, .39, .02, .2, .19, .24, 0, 0, side * -.2, leg);
      add('organic', 'claw', side * .51, .22, .13, .115, .24, .125, .3, 0, side * -.1, leg);
      add('organic', 'claw', side * .52, .065, .27, .2, .075, .28, 0, 0, 0, leg);
      for (let toe = -1; toe <= 1; toe++) add('talon', 'claw', side * .52 + toe * .11, .08, .49, .046, .22, .045, Math.PI / 2, 0, 0, leg);
    }
  } else for (let i = 0; i < 3; i++) for (const side of [-1, 1]) {
    const z = (i - 1) * .4, leg = i * 2 + (side > 0 ? 1 : 0);
    add('organic', 'skin', side * .49 * bulk, h - .23, z, .15, .38, .14, .3, 0, side * .75, leg);
    add('talon', 'claw', side * .72 * bulk, .24, z + .13, .13, .62, .11, -.3, 0, side * -.4, leg);
  }
  const claws = kind === 'hormagaunt' || upright || heavy;
  for (const s of [-1, 1]) {
    add('ball', 'skin', s * .53 * bulk, h + .13, .35, .13 * bulk, .17 * bulk, .48, -.4, s * .4);
    if (claws) add('cone', 'claw', s * .82 * bulk, h + .42, .72, heavy ? .21 : .13, heavy ? .95 : .8, .15, .8, 0, s * -.8);
    else add('ball', 'shell', s * .35, h - .04, .93, .18, .17, .42);
  }
  for(let i=0;i<4;i++){
    const z=-.62+i*.24;
    add('ball','shell',0,h+.23+(upright?.08:0),z,.49*bulk,.24,.25,-.15);
    for(const side of [-1,1])add('ball','claw',side*.39*bulk,h-.05+i*.035,z,.06,.13,.18,0,0,side*.4);
  }
  if(heavy||boss)for(const side of [-1,1]){
    add('ball','shell',side*(heavy?.65:.61),h+.35,.18,heavy?.39:.3,.42,.53,0,0,-side*.2);
    for(let i=0;i<3;i++)add('cone','claw',side*(.68+i*.075),h+.68,-.28+i*.23,.09,.48+i*.09,.09,0,0,-side*.6);
    add('ball','shell',side*.22,h+(upright?.7:.09),.83,.17,.18,.32);
    add('cone','claw',side*.18,h+(upright?.94:.27),1.04,.08,.45,.08,.9,0,-side*.3);
  }
  if(boss){
    for(let i=0;i<5;i++)add('cone','shell',(i-2)*.18,2.08+(.4-Math.abs(i-2)*.12),.1,.13,.65,.15,-.18,0,-(i-2)*.16);
    for(const side of [-1,1]){
      add('ball','shell',side*.63,1.37,.42,.23,.26,.36);
      add('cone','claw',side*.96,1.62,.83,.12,1.5,.17,.8,0,-side*.75);
    }
  }
  if (boss) for (const s of [-1, 1]) {
    add('cone', 'shell', s * .82, 1.95, -.2, .4, 1.7, .1, -.2, 0, s * -.65);
    add('cone', 'claw', s * .5, 2.2, .1, .15, .7, .15, -.5, 0, s * -.4);
    add('ball', 'skin', s * .6, 1.05, .6, .15, .16, .45, -.7, s * .5);
  }
  return parts;
}


function barracksModel(branch: BranchId | null, level:number): TurretModel {
  const root = new THREE.Group(), raw = new THREE.Group();
  piece(raw, 'box', 'dark', 0, .3, 0, 1.6, .5, 1.45);
  piece(raw, 'rounded', 'olive', 0, .82, -.2, 1.48, .96, 1.12);
  piece(raw, 'rounded', 'bronze', 0, 1.34, -.2, 1.63, .18, 1.26);
  piece(raw, 'box', 'black', 0, .69, .38, .69, .78, .045);
  for (const side of [-1, 1]) {
    piece(raw, 'box', 'steel', side * .56, .75, .44, .21, .85, .19);
    piece(raw, 'box', 'amber', side * .54, 1.16, .56, .12, .09, .04);
    piece(raw, 'box', 'stone', side * .69, 1.57, -.36, .28, .38, .4);
  }
  piece(raw, 'box', 'steel', -.48, 1.98, -.15, .055, 1.3, .055);
  piece(raw, 'box', 'red', -.19, 2.28, -.15, .58, .54, .045);
  piece(raw, 'octa', 'bone', -.19, 2.28, -.115, .13, .2, .035);
  if (branch === 'vanguard') {
    for (const side of [-1, 1]) {
      piece(raw, 'box', 'bronze', side * .88, .91, .26, .24, 1.05, .63, 0, 0, side * .1);
      piece(raw, 'box', 'steel', side * .88, .94, .6, .16, .75, .035);
    }
    piece(raw, 'box', 'bone', .35, 1.7, -.25, .075, 1.02, .13, 0, 0, -.5);
    piece(raw, 'box', 'bone', .55, 1.7, -.25, .075, 1.02, .13, 0, 0, .5);
  } else if (branch === 'fireteam') {
    for (const side of [-1, 1]) {
      piece(raw, 'box', 'dark', side * .38, 1.67, -.1, .4, .28, .6);
      piece(raw, 'cylinder', 'steel', side * .38, 1.67, .35, .095, .65, .095, Math.PI / 2);
      piece(raw, 'box', 'cyan', side * .38, 1.9, -.1, .22, .06, .3);
    }
  }
  for (const side of [-1, 1]) {
    piece(raw, 'rounded', 'dark', side * .57, 1.48, -.24, .43, .12, .67);
    for (let i = 0; i < 5; i++) piece(raw, 'box', 'steel', side * .57, 1.55, -.48 + i * .11, .31, .025, .045);
  }
  // Armored doorway, buttresses and an illuminated chapter insignia.
  for(const side of [-1,1]){
    piece(raw,'plate','olive',side*.59,.91,.51,.27,.7,.13);
    armorRivets(raw,side*.59,.91,.59,.17,.54);
    for(let i=0;i<3;i++)piece(raw,'box','steel',side*.76,.76,-.43+i*.19,.035,.14,.085);
    piece(raw,'box','bronze',side*.68,.4,.74,.15,.1,.35);
  }
  crest(raw,0,1.36,.5,.72);rankArmor(raw,level);
  piece(raw,'box','bronze',.57,1.9,-.39,.045,.98,.045);
  piece(raw,'ball','cyan',.57,2.39,-.39,.055,.055,.055);
  const head = bake(raw); root.add(head);
  const core = piece(root, 'octa', branch === 'fireteam' ? 'cyan' : 'amber', 0, 1.48, .1, .13, .16, .13);
  return { root, head, core };
}

export interface AllyModel { root: THREE.Group; body: THREE.Group; leftLeg: THREE.Group; rightLeg: THREE.Group; weapon: THREE.Group; cape: THREE.Mesh | null; kind: Ally['kind']; branch: BranchId | null; }
export function allyModel(kind: Ally['kind'], color: number, branch: BranchId | null = null): AllyModel {
  const root = new THREE.Group(), body = new THREE.Group(), raw = new THREE.Group();
  const hero = kind !== 'marine' && kind !== 'reinforcement';
  const armor = new THREE.MeshStandardMaterial({ color, roughness: .46, metalness: .28 });
  const trim = kind === 'reinforcement' ? 'steel' : 'bronze';
  piece(raw, 'rounded', armor, 0, .79, 0, .51, .48, .34);
  piece(raw, 'box', 'dark', 0, .48, 0, .32, .2, .26);
  piece(raw, 'rounded', armor, 0, 1.15, .015, .31, .32, .31);
  for(const side of [-1,1])piece(raw,'box','cyan',side*.081,1.2,.184,.087,.027,.025,0,0,-side*.12);
  piece(raw,'plate','steel',0,1.07,.187,.16,.105,.035);
  for(let i=0;i<3;i++)piece(raw,'box','black',(i-1)*.04,1.07,.21,.018,.055,.02);
  piece(raw,'box',trim,0,1.34,.055,.055,.03,.24);
  piece(raw, 'box', 'dark', 0, .87, -.24, .39, .43, .16);
  for (const side of [-1, 1]) {
    piece(raw, 'organic', trim, side * .33, .97, 0, .248, .24, .265);
    piece(raw,'carapace',armor,side*.335,.99,.025,.222,.228,.25);
    piece(raw,'plate','bone',side*.52,1.03,.07,.025,.14,.12,0,0,side*.18);
    piece(raw, 'box', trim, side * .31, 1.08, .06, .28, .06, .25);
    piece(raw, 'rounded', armor, side * .31, .71, .08, .16, .28, .17, -.3);
    piece(raw, 'cylinder', 'steel', side * .15, 1.02, -.29, .065, .24, .065);
  }
  crest(raw,0,.92,.199,.32);
  for (const side of [-1, 1]) {
    piece(raw, 'torus', 'dark', side * .175, .98, .13, .065, .065, .065, .7, 0, side * .55);
    piece(raw, 'rounded', armor, side * .22, .71, .12, .13, .18, .14);
    piece(raw, 'ball', 'steel', side * .105, 1.08, .2, .028, .028, .025);
    piece(raw, 'rounded', armor, side * .13, 1.31, .01, .045, .075, .25);
  }
  for(const side of [-1,1]){
    piece(raw,'cylinder','dark',side*.2,1.05,-.32,.11,.34,.11);
    piece(raw,'cylinder','steel',side*.2,1.24,-.32,.115,.08,.115);
    piece(raw,'cylinder','black',side*.2,1.29,-.32,.073,.028,.073);
    piece(raw,'plate','dark',side*.24,.52,.09,.15,.19,.18);
    piece(raw,'box','bronze',side*.24,.57,.188,.1,.035,.02);
  }
  piece(raw,'ball','red',-.19,.96,.21,.052,.05,.025);
  for(const side of [-1,1])piece(raw,'box','bone',-.19+side*.019,.82,.217,.032,.21,.018,0,0,side*.12);
  piece(raw,'plate','bronze',0,.51,.179,.13,.105,.028);
  if (kind === 'captain') {
    piece(raw,'torus','bronze',0,1.26,-.22,.34,.34,.34);
    for(const side of [-1,1])piece(raw,'cone','bronze',side*.27,1.49,-.2,.045,.23,.045,0,0,-side*.3);
    piece(raw, 'box', 'bone', 0, 1.37, -.04, .08, .22, .29);
  } else if (kind === 'techmarine') {
    piece(raw, 'box', 'steel', .33, 1.4, -.24, .12, .63, .15, 0, 0, -.3);
    piece(raw, 'box', 'bronze', .49, 1.65, -.17, .44, .14, .18);
    piece(raw, 'octa', 'cyan', .65, 1.62, -.03, .1, .15, .1);
    piece(raw,'cylinder','dark',.49,1.63,-.17,.14,.2,.14,Math.PI/2);
    for(const side of [-1,1])piece(raw,'box','steel',.68+side*.09,1.52,-.03,.07,.29,.08,0,0,side*.26);
    piece(raw,'box','steel',-.36,1.16,-.29,.12,.52,.12,0,0,.35);
    piece(raw,'box','bronze',-.49,1.34,-.19,.28,.09,.12);
  } else if (kind === 'librarian') {
    piece(raw,'torus','bronze',0,1.18,-.12,.25,.31,.25);
    piece(raw,'plate','bone',0,.43,.19,.22,.47,.04);
    piece(raw, 'box', 'purple', 0, 1.04, .19, .1, .15, .025);
    piece(raw, 'box', 'bronze', -.36, .92, .22, .05, 1.55, .05);
    piece(raw, 'octa', 'purple', -.36, 1.78, .22, .17, .24, .17);
  }
  body.add(bake(raw)); root.add(body);
  let cape:THREE.Mesh|null=null;
  if(kind==='captain'||kind==='librarian'){
    const cloth=new THREE.PlaneGeometry(.67,.9,6,8),position=cloth.getAttribute('position');
    for(let i=0;i<position.count;i++){const x=position.getX(i),y=position.getY(i),t=.5-y/.9;position.setXYZ(i,x*(.8+t*.4),y,Math.cos(x*24)*(.015+t*.05)+t*t*.18)}
    cloth.computeVertexNormals();
    cape=new THREE.Mesh(cloth,new THREE.MeshStandardMaterial({color:kind==='captain'?0x70233b:0x414276,roughness:.9,side:THREE.DoubleSide}));
    cape.position.set(0,.76,-.36);cape.rotation.x=.08;cape.castShadow=true;cape.receiveShadow=true;body.add(cape);
  }
  const legs = [-1, 1].map(side => {
    const leg = new THREE.Group(), parts = new THREE.Group();
    piece(parts, 'rounded', armor, 0, .24, 0, .2, .36, .23);
    piece(parts,'plate',trim,0,.36,.135,.165,.12,.045);
    piece(parts,'box','steel',0,.105,.245,.16,.04,.02);
    piece(parts, 'rounded', 'dark', 0, .09, .06, .23, .15, .35);
    leg.add(bake(parts)); leg.position.x = side * .13; root.add(leg); return leg;
  });
  const weapon = new THREE.Group(), weaponRaw = new THREE.Group();
  if (kind === 'captain' || branch === 'vanguard') {
    piece(weaponRaw, 'box', 'steel', .38, .82, .39, .095, .65, .1, .5);
    piece(weaponRaw, 'box', 'cyan', .38, 1.04, .52, .035, .32, .11, .5);
    piece(weaponRaw, 'box', 'bronze', .38, .5, .21, .29, .065, .13);
    piece(weaponRaw, 'plate', trim, -.37, .76, .28, .37, .54, .1);
    piece(weaponRaw, 'plate', armor, -.37, .77, .34, .3, .44, .035);
    piece(weaponRaw, 'box', 'bone', -.37, .78, .365, .055, .3, .02);
    crest(weaponRaw,-.37,.87,.38,.25);
    for(let i=0;i<5;i++)piece(weaponRaw,'box','bronze',.445,.61+i*.1,.28+i*.054,.045,.047,.08,.5);
  } else if (kind !== 'librarian') {
    piece(weaponRaw, 'rounded', 'dark', .2, .79, .34, .2, .23, .5);
    piece(weaponRaw, 'cylinder', 'steel', .2, .79, .63, .065, .18, .065, Math.PI / 2);
    bore(weaponRaw, .2, .79, .71, .07);
    piece(weaponRaw, 'plate', armor, .2, .82, .37, .22, .14, .32);
    if (branch === 'fireteam') piece(weaponRaw, 'box', 'cyan', .2, .93, .39, .14, .05, .32);
  }
  weapon.add(bake(weaponRaw)); body.add(weapon);
  root.scale.setScalar(hero ? 1.28 : .85);
  return { root, body, leftLeg: legs[0], rightLeg: legs[1], weapon, cape, kind, branch };
}

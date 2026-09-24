import * as THREE from 'three';
import type { GameState, MapDef } from '../game/types';
import { bake, geometry, materials, piece } from './models';
import { groundTexture, sceneryModel, sceneryMaterials } from './scenery';
import type { Scenery } from './scenery';

export interface TerrainModel {
  root: THREE.Group;
  vents: {x:number;y:number;z:number}[];
  scenery: Scenery;
  pads: THREE.Mesh[];
  gates: THREE.Mesh[];
  reactor: THREE.Mesh;
  reactorRing: THREE.Mesh;
  captureRing: THREE.Mesh;
  captureFlag: THREE.Mesh;
  diversion: THREE.Group;
  routes: THREE.Sprite[];
}

export function label(text: string, color = '#f5e5b5', width = 512, height = 64): THREE.Sprite {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${height * .4}px Arial, sans-serif`;
  ctx.shadowColor = '#172124'; ctx.shadowBlur = 5; ctx.fillStyle = color; ctx.fillText(text, width / 2, height / 2);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false }));
}

export function disposeModel(root: THREE.Object3D, disposeMaterials = false): void {
  root.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>(), ownedMaterials = new Set<THREE.Material>();
  const sharedGeometry: THREE.BufferGeometry[] = Object.values(geometry), sharedMaterials: THREE.Material[] = [...Object.values(materials), ...sceneryMaterials];
  root.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      if (!sharedGeometry.includes(object.geometry)) geometries.add(object.geometry);
      if (disposeMaterials) for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (!sharedMaterials.includes(material)) ownedMaterials.add(material);
    } else if (object instanceof THREE.Sprite && disposeMaterials) ownedMaterials.add(object.material);
  });
  for (const item of geometries) item.dispose();
  const textures = new Set<THREE.Texture>();
  for (const item of ownedMaterials) { const map = (item as THREE.MeshBasicMaterial).map; if (map) textures.add(map); item.dispose(); }
  for (const texture of textures) texture.dispose();
}

function ring(root: THREE.Group, x: number, z: number, radius: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(radius * .91, radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, .18, z); root.add(mesh); return mesh;
}

export function terrainModel(map: MapDef): TerrainModel {
  const root = new THREE.Group(), raw = new THREE.Group();
  const scenery = sceneryModel(map); root.add(scenery.root);
  const vents = scenery.vents;
  const surface = groundTexture(map.id === 'wastes', map.id === 'crossroads');
  const groundColor=map.id==='foundry'?0x414844:map.id==='crossroads'?0x545b58:0x71604b;
  const soil = new THREE.MeshStandardMaterial({ color: groundColor, roughness: 1, envMapIntensity: .12, map: map.id === 'wastes' ? surface : null });
  const road = new THREE.MeshStandardMaterial({ color: map.id==='wastes'?0x423d32:0x252e30, roughness: .93, envMapIntensity: .12 });
  const edge = new THREE.MeshStandardMaterial({ color: map.id==='foundry'?0x8c724b:map.id==='crossroads'?0x878270:0x9c8258, roughness: .86, envMapIntensity: .2 });
  const seam=new THREE.MeshStandardMaterial({color:0x1c272a,roughness:.8,metalness:.25});
  const lamp=new THREE.MeshBasicMaterial({color:map.id==='foundry'?0xffb260:0x8fc4d1,toneMapped:false});
  const wastes = map.id === 'wastes', crossroads = map.id === 'crossroads';
  piece(raw, 'box', 'dark', 0, -.8, 1, 37, 1.5, 24);
  piece(raw, 'box', soil, 0, -.035, 1, 36.6, .12, 23.6);
  for (const z of [-10.8, 12.8]) piece(raw, 'box', edge, 0, -.13, z, 36.7, .2, .15);
  for (const x of [-18.3, 18.3]) piece(raw, 'box', edge, x, -.13, 1, .15, .2, 23.7);
  // Baked floor panels add scale without adding a draw call for every tile.
  if(!wastes){
    const tiles=[.93,1,1.065].map(shade=>new THREE.MeshStandardMaterial({color:new THREE.Color(groundColor).multiplyScalar(shade),map:surface,envMapIntensity:.16,roughness:.88,metalness:crossroads?.08:.23}));
    for(let row=0;row<8;row++)for(let col=0;col<12;col++){
      const x=-16.7+col*3.02,z=-9.25+row*2.92,variant=Math.abs(Math.floor(Math.sin(col*73+row*29)*99))%3;
      piece(raw,'box',tiles[variant],x,.027,z,2.98,.025,2.88);
      if((col+row)%3===0)for(const side of [-1,1])piece(raw,'cylinder','steel',x+side*1.35,.046,z-1.25,.034,.014,.034);
      if(!crossroads&&(col+row*3)%7===0){
        piece(raw,'box',seam,x,.047,z,1.1,.018,.58);
        for(let j=0;j<6;j++)piece(raw,'box','steel',x-.43+j*.17,.06,z,.045,.02,.5);
      }
    }
  }else{
    // Low, faceted ash drifts stay below the roads and emplacement bases.
    for(let i=0;i<95;i++){
      const x=Math.sin(i*5.71)*17.8,z=1+Math.cos(i*13.1)*10.8;
      piece(raw,'octa',i%2?soil:edge,x,.015,z,.32+(i%4)*.2,.03,.16+(i%3)*.12,0,i*.73);
    }
  }
  const routes: THREE.Sprite[] = [];
  map.paths.forEach((path, index) => {
    path.slice(1).forEach((b, i) => {
      const a = path[i], length = Math.hypot(b.x - a.x, b.z - a.z), angle = Math.atan2(b.x - a.x, b.z - a.z);
      piece(raw, 'box', edge, (a.x + b.x) / 2, .05, (a.z + b.z) / 2, 1.7, .09, length + 1.7, 0, angle);
      piece(raw, 'box', road, (a.x + b.x) / 2, .105, (a.z + b.z) / 2, 1.42, .05, length + 1.42, 0, angle);
      for(let n=.5;n<length;n+=.95){
        const x=a.x+(b.x-a.x)*n/length,z=a.z+(b.z-a.z)*n/length;
        piece(raw,'box',seam,x,.137,z,1.3,.012,.018,0,angle);
      }
      for (let n = .7; n < length; n += 1.7) {
        const x = a.x + (b.x - a.x) * n / length, z = a.z + (b.z - a.z) * n / length;
        for (const side of [-1, 1]) {
          piece(raw, 'box', 'bone', x + Math.cos(angle) * .61 * side, .14, z - Math.sin(angle) * .61 * side, .045, .018, .32, 0, angle);
          if(!wastes)piece(raw,'box',lamp,x+Math.cos(angle)*.78*side,.13,z-Math.sin(angle)*.78*side,.07,.035,.13,0,angle);
        }
      }
    });
    const start = path[0], routeLabel = label(`${String(index + 1).padStart(2, '0')}  /  APPROACH`, '#f6dc9d');
    routeLabel.position.set(start.x + 1.1, .65, start.z - .9); routeLabel.scale.set(3.3, .42, 1); root.add(routeLabel); routes.push(routeLabel);
  });
  const pads: THREE.Mesh[] = [];
  map.pads.forEach((p, i) => {
    piece(raw, 'cylinder', 'dark', p.x, .15, p.z, .94, .22, .94);
    piece(raw, 'cylinder', 'steel', p.x, .27, p.z, .85, .07, .85);
    piece(raw, 'cylinder', 'olive', p.x, .32, p.z, .75, .05, .75);
    for (let n = 0; n < 4; n++) { const angle = n * Math.PI / 2; piece(raw, 'box', 'bone', p.x + Math.sin(angle) * .75, .36, p.z + Math.cos(angle) * .75, .16, .025, .16); }
    const pad = ring(root, p.x, p.z, .64, 0xffd789); pad.position.y = .37; pads.push(pad);
    const padLabel = label(String(i + 1).padStart(2, '0'), '#fff0cc', 128, 64); padLabel.position.set(p.x, .47, p.z + .46); padLabel.scale.set(.65, .33, 1); root.add(padLabel);
  });
  const gates: THREE.Mesh[] = [];
  map.gateNames.forEach((name, index) => {
    const path = map.paths.find((_, pathIndex) => map.exits[pathIndex] === index) ?? map.paths[0];
    const p = path[path.length - 1], a = path[path.length - 2], angle = Math.atan2(p.x - a.x, p.z - a.z);
    const gate = new THREE.Group();
    for (const side of [-1, 1]) {
      piece(gate, 'box', 'stone', side * 1.35, 1.28, .65, .86, 2.6, 1.3);
      piece(gate, 'box', 'olive', side * 1.35, 1.42, -.04, .72, 2.55, .12);
      piece(gate, 'box', 'bronze', side * 1.35, 2.15, -.14, .57, .12, .13);
      piece(gate, 'cone', 'steel', side * 1.35, 3, .65, .45, 1, .45);
    }
    piece(gate, 'box', 'dark', 0, 1.12, .77, 1.8, 2.3, .32);
    for (let y = .35; y < 2.4; y += .4) piece(gate, 'box', 'steel', 0, y, .56, 1.74, .08, .12);
    piece(gate, 'box', 'bronze', 0, 2.62, .35, 3.45, .25, .7);
    for(const side of [-1,1]){
      piece(gate,'box','dark',side*1.82,.8,.8,.4,1.6,1.5);
      piece(gate,'box','steel',side*1.82,1.37,.34,.43,.13,.55,0,0,side*.35);
      piece(gate,'box','red',side*1.35,1.75,-.14,.38,.86,.035);
      piece(gate,'box','bronze',side*1.35,1.76,-.165,.055,.59,.015);
      piece(gate,'box','bronze',side*1.35,1.87,-.167,.24,.045,.017);
      piece(gate,'box',lamp,side*1.35,2.5,-.17,.27,.08,.05);
    }
    piece(gate,'box','olive',0,3.01,.5,1.3,.54,.72);
    piece(gate,'octa','bronze',0,3.04,.07,.19,.27,.075);
    for(const side of [-1,1])piece(gate,'box','bone',side*.34,3.03,.07,.45,.08,.06,0,0,side*.25);
    gate.rotation.y = angle; gate.position.set(p.x, 0, p.z); raw.add(gate);
    const light = new THREE.Mesh(geometry.ball, new THREE.MeshBasicMaterial({ color: 0x9dffae, toneMapped: false }));
    light.scale.set(.18, .18, .18); light.position.set(p.x, 2.83, p.z); root.add(light); gates.push(light);
    const gateLabel = label(name.toUpperCase()); gateLabel.position.set(p.x, 3.8, p.z); gateLabel.scale.set(3.8, .45, 1); root.add(gateLabel);
  });
  const closeToGameplay = (x: number, z: number) => [...map.pads, map.objective, map.capture].some(p => Math.hypot(p.x - x, p.z - z) < 1.7) || map.paths.some(path => path.slice(1).some((b, i) => {
    const a = path[i], dx = b.x - a.x, dz = b.z - a.z, t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    return Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < 1.45;
  }));
  for (let i = 0; i < 72; i++) {
    const x = Math.sin(i * 13.4) * 17, z = 1 + Math.cos(i * 7.23) * 10;
    if (closeToGameplay(x, z)) continue;
    const size = .18 + (i % 5) * .12;
    if (wastes) { piece(raw, 'octa', i % 3 ? edge : 'bone', x, size * .4, z, size * 1.1, size, size, .2, i); }
    else if (crossroads && i % 4 === 0) {
      piece(raw, 'cylinder', 'stone', x, .75, z, .22, 1.5, .22);
      piece(raw, 'box', 'bone', x, 1.51, z, .7, .22, .7, 0, i);
    } else piece(raw, 'box', i % 3 ? edge : 'steel', x, .18, z, size, .34, size * .7, 0, i);
  }
  const p = map.objective;
  piece(raw, 'cylinder', 'dark', p.x, .22, p.z, .82, .4, .82);
  for (const side of [-1, 1]) piece(raw, 'box', 'steel', p.x + side * .6, .8, p.z, .16, 1.3, .8);
  piece(raw, 'cylinder', 'bronze', p.x, 1.49, p.z, .62, .15, .62);
  const reactor = new THREE.Mesh(geometry.cylinder, new THREE.MeshStandardMaterial({ color: 0x72d8ed, emissive: 0x3698b0, emissiveIntensity: 1.2 }));
  reactor.position.set(p.x, .9, p.z); reactor.scale.set(.43, 1.1, .43); root.add(reactor);
  const reactorRing = ring(root, p.x, p.z, 1.2, 0x83e4f3);
  const reactorLabel = label('REACTOR', '#abeafa'); reactorLabel.position.set(p.x, 2.1, p.z); reactorLabel.scale.set(2.1, .34, 1); root.add(reactorLabel);
  const captureRing = ring(root, map.capture.x, map.capture.z, 1.6, 0xffd581);
  const captureFlag = new THREE.Mesh(geometry.box, new THREE.MeshStandardMaterial({ color: 0xbca578, roughness: .7 }));
  captureFlag.position.set(map.capture.x + .33, 2.05, map.capture.z); captureFlag.scale.set(.65, .58, .055); root.add(captureFlag);
  if (map.mechanic === 'capture') {
    piece(raw, 'cylinder', 'steel', map.capture.x, 1.25, map.capture.z, .055, 2.5, .055);
    const captureLabel = label('HERO CAPTURE', '#ffdc99'); captureLabel.position.set(map.capture.x, 3, map.capture.z); captureLabel.scale.set(2.8, .4, 1); root.add(captureLabel);
  } else { captureRing.visible = captureFlag.visible = false; }
  const diversion = new THREE.Group();
  const junction = map.paths[0][Math.min(2, map.paths[0].length - 1)];
  if (map.mechanic === 'diversion') {
    piece(diversion, 'cylinder', 'bronze', 0, .27, 0, .4, .45, .4);
    piece(diversion, 'box', 'bone', 0, .65, 0, 1.1, .17, .22);
    diversion.position.set(junction.x, .16, junction.z); root.add(diversion);
  }
  root.add(bake(raw));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: map.id==='wastes'?0x302a27:map.id==='crossroads'?0x18242b:0x141f27 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; floor.receiveShadow = true; root.add(floor);
  return { root, scenery, vents, pads, gates, reactor, reactorRing, captureRing, captureFlag, diversion, routes };
}

export function updateTerrain(model: TerrainModel, map: MapDef, state: GameState): void {
  model.pads.forEach((pad, i) => {
    pad.visible = !state.towers.some(t => t.pad === i);
    const locked = map.lockedPads.includes(i) && !state.mapState.captured;
    (pad.material as THREE.MeshBasicMaterial).color.setHex(locked ? 0xeb775c : 0xffdf8b);
    (pad.material as THREE.MeshBasicMaterial).opacity = locked ? .85 : .65;
    pad.rotation.z = locked ? Math.PI / 4 : 0;
  });
  model.gates.forEach((gate, i) => { (gate.material as THREE.MeshBasicMaterial).color.setHex((state.gates[i] ?? state.integrity) <= 5 ? 0xff5a46 : 0xa3ffb1); });
  const status = state.objective.status, color = status === 'failed' ? 0xff6555 : status === 'success' ? 0xa6f19c : status === 'active' ? 0x75eaff : 0xb2a579;
  const core = model.reactor.material as THREE.MeshStandardMaterial; core.color.setHex(color); core.emissive.setHex(color); core.emissiveIntensity = status === 'active' ? 1.1 : .25;
  (model.reactorRing.material as THREE.MeshBasicMaterial).color.setHex(color);
  model.reactorRing.visible = status !== 'offered' || state.phase === 'ready' || state.phase === 'prep';
  const capture = state.mapState.captured;
  (model.captureRing.material as THREE.MeshBasicMaterial).color.setHex(capture ? 0x8ceab0 : 0xffd581);
  model.captureRing.scale.setScalar(capture ? 1 : .5 + Math.min(1, state.mapState.captureProgress / 5) * .5);
  (model.captureFlag.material as THREE.MeshStandardMaterial).color.setHex(capture ? 0x78d9a0 : 0xbca578);
  model.diversion.rotation.y = state.mapState.diverted ? Math.PI / 2 : 0;
  model.routes.forEach((route, i) => { route.material.opacity = map.mechanic === 'diversion' ? (i === (state.mapState.diverted ? 1 : 0) ? 1 : .4) : 1; });
}

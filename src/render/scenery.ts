import * as THREE from 'three';
import type { MapDef } from '../game/types';
import { bake, piece } from './models';

interface Banner { mesh: THREE.Mesh; rest: Float32Array; phase: number }
// Identical heraldry shares one texture/material for the renderer lifetime,
// just like the shared metal and stone finishes in models.ts.
export const sceneryMaterials: THREE.Material[] = [];
function bannerMaterial(): THREE.MeshStandardMaterial {
  if (sceneryMaterials.length) return sceneryMaterials[0] as THREE.MeshStandardMaterial;
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#6b2633'; ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = '#cfaa61'; ctx.fillRect(8, 0, 5, 246); ctx.fillRect(115, 0, 5, 246);
  ctx.fillRect(59, 39, 10, 118); ctx.fillRect(32, 75, 64, 9);
  ctx.beginPath(); ctx.moveTo(64, 167); ctx.lineTo(87, 188); ctx.lineTo(64, 220); ctx.lineTo(41, 188); ctx.fill();
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 1 });
  sceneryMaterials.push(material); return material;
}

export interface Scenery {
  root: THREE.Group;
  vents: { x: number; y: number; z: number }[];
  fans: THREE.Group[];
  banners: Banner[];
  furnace: THREE.MeshStandardMaterial | null;
  lastTime: number;
  lastMode: number;
}

/** Local, deterministic surface detail; no downloaded textures or per-frame allocation. */
export function groundTexture(wastes: boolean, stone: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  let seed = 4189;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.fillStyle = '#d4d4d4'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const shade = Math.floor(175 + random() * 70);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},.22)`;
    ctx.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1);
  }
  ctx.strokeStyle = wastes ? 'rgba(95,82,63,.09)' : 'rgba(75,83,79,.18)';
  ctx.lineWidth = stone ? .8 : .5;
  for (let i = 0; i < (wastes ? 38 : 20); i++) {
    const x = random() * 256, y = random() * 256;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + 4 + random() * 20, y + (wastes ? 2 : random() * 9 - 4));
    if (stone) ctx.lineTo(x + 18 + random() * 15, y + 8 + random() * 10);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  if (wastes) texture.repeat.set(12, 8);
  texture.anisotropy = 4;
  return texture;
}


export function sceneryModel(map: MapDef): Scenery {
  const root = new THREE.Group(), raw = new THREE.Group();
  const furnace = new THREE.MeshStandardMaterial({ color: 0xff9c3f, emissive: 0xff6014, emissiveIntensity: 1.1, roughness: .8 });
  const masonry = new THREE.MeshStandardMaterial({ color: 0x89918a, roughness: .96 });
  const rock = new THREE.MeshStandardMaterial({ color: 0x92785b, roughness: 1 });
  const darkRock = new THREE.MeshStandardMaterial({ color: 0x685347, roughness: 1 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x59b7c4, emissive: 0x236370, emissiveIntensity: .65, roughness: .45 });
  const fans: THREE.Group[] = [], banners: Banner[] = [], vents: Scenery['vents'] = [];
  const clear = (x: number, z: number, radius: number) => ![...map.pads, map.objective, map.capture].some(p => Math.hypot(p.x - x, p.z - z) < radius + 1.05)
    && !map.paths.some(path => path.slice(1).some((b, i) => {
      const a = path[i], dx = b.x - a.x, dz = b.z - a.z;
      const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      return Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < radius + .95;
    }));
  const banner = (x: number, y: number, z: number, width: number, height: number, angle = 0) => {
    const geometry = new THREE.PlaneGeometry(width, height, 6, 10);
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const free = .5 - pos.getY(i) / height;
      pos.setZ(i, Math.sin(pos.getX(i) / width * 12) * .035 * free);
      if (free > .99) pos.setY(i, pos.getY(i) + Math.abs(pos.getX(i)) * .2);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, bannerMaterial());
    mesh.position.set(x, y, z); mesh.rotation.y = angle;
    mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
    banners.push({ mesh, rest: new Float32Array(pos.array), phase: x * .7 + z });
    piece(raw, 'cylinder', 'bronze', x, y + height / 2 + .04, z, .045, width + .2, .045, 0, 0, Math.PI / 2);
  };
  const forge = (x: number, z: number, large: boolean) => {
    const w = large ? 3.5 : 2.5, h = large ? 2 : 1.3;
    piece(raw, 'plate', 'dark', x, .19, z, w + .5, .35, 1.9);
    piece(raw, 'plate', 'olive', x, h / 2 + .25, z, w, h, 1.35);
    piece(raw, 'box', 'black', x, .8, z + .69, w * .78, .73, .04);
    piece(raw, 'box', furnace, x, .8, z + .73, w * .72, .52, .02);
    for (let i = -3; i <= 3; i++) piece(raw, 'box', 'steel', x + i * w * .1, .8, z + .78, .07, .72, .09);
    for (const side of [-1, 1]) {
      piece(raw, 'plate', 'bronze', x + side * (w / 2 - .12), h / 2 + .22, z + .7, .19, h, .13);
      const sx = x + side * w * .31;
      piece(raw, 'cylinder', 'steel', sx, h + .8, z - .15, .24, 2, .24);
      for (const y of [h + .12, h + .88, h + 1.73]) piece(raw, 'cylinder', 'bronze', sx, y, z - .15, .29, .1, .29);
      piece(raw, 'cylinder', 'black', sx, h + 1.81, z - .15, .29, .08, .29);
      vents.push({ x: sx, y: h + 1.88, z: z - .15 });
    }
    piece(raw, 'box', 'steel', x, h + .29, z, w + .12, .14, 1.5);
    const fanRaw = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      piece(fanRaw, 'plate', 'steel', Math.sin(a) * .24, Math.cos(a) * .24, 0, .18, .43, .04, 0, 0, -a + .3);
    }
    piece(fanRaw, 'cylinder', 'bronze', 0, 0, .06, .13, .15, .13, Math.PI / 2);
    const fan = bake(fanRaw); fan.position.set(x, h + .3, z + .79); root.add(fan); fans.push(fan);
    piece(raw, 'torus', 'black', x, h + .3, z + .8, .55, .55, .18);
    for (let i = 0; i < 5; i++) piece(raw, 'box', i % 2 ? 'black' : 'bronze', x - .7 + i * .35, .42, z + 1, .19, .03, .32, 0, .5);
  };
  const ruin = (x: number, z: number, intact: boolean) => {
    piece(raw, 'plate', masonry, x, .14, z, 2.8, .25, 1.2);
    for (const side of [-1, 1]) {
      const h = side === 1 && !intact ? 1.7 : 3.1;
      piece(raw, 'box', 'stone', x + side * .98, h / 2, z, .43, h, .67);
      piece(raw, 'plate', masonry, x + side * 1.2, .8, z + .17, .36, 1.6, .96, 0, 0, side * .08);
      for (const y of [.2, 1.6, h]) piece(raw, 'box', masonry, x + side * .98, y, z, .64, .15, .81);
      if (h > 2) piece(raw, 'cone', 'stone', x + side * .98, 3.42, z, .27, .65, .3);
      if (intact || side === -1) piece(raw, 'box', masonry, x + side * .48, 3.12, z, 1.17, .28, .66, 0, 0, side * -.53);
    }
    if (intact) {
      piece(raw, 'box', glass, x, 2, z - .16, 1.48, 1.55, .035);
      piece(raw, 'cone', glass, x, 2.99, z - .16, .77, .8, .04);
      piece(raw, 'box', 'bronze', x, 2.08, z - .09, .065, 1.9, .05);
      piece(raw, 'box', 'bronze', x, 2.14, z - .09, 1.55, .065, .05);
      banner(x, 1.25, z + .5, .65, 1.4);
    } else {
      piece(raw, 'box', masonry, x + .2, .28, z + .38, 1.3, .35, .59, 0, .65, .09);
      banner(x - .98, 2.1, z + .43, .48, 1.1);
    }
  };
  if (map.id === 'foundry') {
    for (const [x, z, large] of [[12, -9.3, 1], [3, -10, 0], [-16, -10, 0]]) if (clear(x, z, large ? 2 : 1.5)) forge(x, z, !!large);
    for (const x of [8.4, 16.1]) {
      piece(raw, 'cylinder', 'dark', x, .15, -7.8, .7, .28, .7);
      piece(raw, 'cylinder', 'steel', x, 1.1, -7.8, .48, 1.9, .48);
      for (const y of [.35, 1, 1.85]) piece(raw, 'cylinder', 'bronze', x, y, -7.8, .53, .1, .53);
      piece(raw, 'ball', 'olive', x, 2.07, -7.8, .48, .27, .48);
      piece(raw, 'cylinder', 'steel', x, .4, -9, .12, 2.4, .12, Math.PI / 2);
    }
  } else if (map.id === 'crossroads') {
    for (const [x, z, intact] of [[12, -9.6, 1], [2, -10.1, 0], [-15, -10.1, 0]]) if (clear(x, z, 1.45)) ruin(x, z, !!intact);
    for (const x of [-5, 3, 11]) if (clear(x, 10.8, 1.1)) {
      piece(raw, 'plate', masonry, x, .18, 10.8, 1.7, .32, .9);
      piece(raw, 'cylinder', 'stone', x, .55, 10.8, .29, .85, .29, 0, 0, .16);
      piece(raw, 'box', masonry, x + .6, .22, 11.1, .5, .35, .7, .2, .5);
    }
  } else {
    for (const [x, z, size] of [[13, -9.3, 2.1], [16, -8.3, 1.4], [2, -10.1, 1.35], [-4, -9.7, 1.1], [-16, 11, 1.2]]) if (clear(x, z, size)) {
      for (let i = 0; i < 4; i++) {
        const a = i * 2.4;
        piece(raw, 'octa', i % 2 ? rock : darkRock, x + Math.sin(a) * size * .4, size * (.38 + i * .06), z + Math.cos(a) * size * .3, size * (.55 + i * .08), size * (1.1 + i * .2), size * .58, .12, a, .18);
      }
      for (let i = 0; i < 5; i++) piece(raw, 'octa', rock, x + Math.sin(i * 2.4) * size, .13, z + Math.cos(i * 2.4) * size, .3, .25, .24, 0, i);
    }
    // Low wreckage in the foreground leaves the paths behind it visible.
    const wreck = new THREE.Group();
    piece(wreck, 'plate', 'olive', 0, .55, 0, 3.6, .8, 1.7, 0, 0, -.07);
    piece(wreck, 'plate', 'dark', .3, 1.03, -.12, 1.8, .55, 1.25, 0, 0, .15);
    piece(wreck, 'plate', 'steel', .2, 1.22, .05, 1.15, .18, .85, .3, .1, .2);
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
      piece(wreck, 'cylinder', 'black', -1.5 + i * .57, .3, side * .84, .27, .19, .27, Math.PI / 2);
      piece(wreck, 'cylinder', 'bronze', -1.5 + i * .57, .3, side * .96, .11, .025, .11, Math.PI / 2);
    }
    piece(wreck, 'cylinder', 'steel', 1, .8, .7, .13, 2.1, .13, Math.PI / 2, 0, -.8);
    wreck.position.set(9.3, 0, 8.4); wreck.rotation.y = -.35; raw.add(wreck);
    const x = -6.5, z = 10;
    piece(raw, 'plate', 'dark', x, .17, z, 1.1, .32, 1.1);
    piece(raw, 'cylinder', 'steel', x, 1.4, z, .055, 2.7, .055);
    banner(x + .47, 2.02, z, .86, 1.13);
  }
  // Recessed armor along the display base adds depth below the playable surface.
  for (let i = 0; i < 9; i++) {
    const x = -16 + i * 4;
    piece(raw, 'plate', 'olive', x, -.83, 13.01, 3.7, .95, .07);
    for (const side of [-1, 1]) piece(raw, 'box', 'bronze', x + side * 1.55, -.8, 13.06, .09, .57, .025);
  }
  root.add(bake(raw));
  // Materials for other biomes were never attached and can be released immediately.
  const used = new Set<THREE.Material>();
  root.traverse(o => { if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) used.add(m); });
  for (const material of [furnace, masonry, rock, darkRock, glass]) if (!used.has(material)) material.dispose();
  return { root, vents, fans, banners, furnace: used.has(furnace) ? furnace : null, lastTime: -1, lastMode: -1 };
}

export function animateScenery(model: Scenery, time: number, high: boolean, reduced: boolean): void {
  const frameTime = reduced ? 0 : time, mode = (high ? 1 : 0) + (reduced ? 2 : 0);
  if (model.lastTime === frameTime && model.lastMode === mode) return;
  const updateCloth = high && !reduced || model.lastMode !== mode;
  model.lastTime = frameTime; model.lastMode = mode;
  const moving = !reduced;
  model.fans.forEach((fan, i) => { fan.rotation.z = moving ? time * (i % 2 ? -.85 : 1.1) : 0; });
  if (model.furnace) model.furnace.emissiveIntensity = moving && high ? 1.05 + Math.sin(time * 1.8) * .12 + Math.sin(time * 3.3) * .04 : 1.05;
  if (!updateCloth) return;
  for (const banner of model.banners) {
    const pos = banner.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const height = (banner.mesh.geometry as THREE.PlaneGeometry).parameters.height;
    for (let i = 0; i < pos.count; i++) {
      const x = banner.rest[i * 3], y = banner.rest[i * 3 + 1], free = .5 - y / height;
      const wave = moving && high ? Math.sin(time * 2.4 + banner.phase - free * 4 + x * 2) * .105 * free * free : 0;
      pos.setXYZ(i, x, y, banner.rest[i * 3 + 2] + wave);
    }
    pos.needsUpdate = true; banner.mesh.geometry.computeVertexNormals();
  }
}

import * as THREE from 'three';
import type { Command, GameState, MapDef, Point } from '../game/types';
import { LIVERIES, LOADOUTS } from '../game/campaign';
import { allyModel, geometry } from './models';
import type { AllyModel } from './models';
import { disposeModel, label } from './terrain';
import type { CommandPreview } from '../game/commands';

const MAX_ALLIES = 96, MAX_HAZARDS = 32, MAX_BARS = MAX_ALLIES + 8;
interface TacticalSelection { ability: Command | null; towerId: number | null; aim: Point | null }

/** Snapshot adapter: all state is read-only; geometry and feedback are renderer-owned. */
export class Tactics {
  readonly root = new THREE.Group();
  private models = new Map<number, AllyModel & { motion: { x: number; z: number; stride: number; blend: number } }>();
  private livery = '';
  private dummy = new THREE.Object3D();
  private right = new THREE.Vector3();
  private color = new THREE.Color();
  private back: THREE.InstancedMesh;
  private fill: THREE.InstancedMesh;
  private allyRings: THREE.InstancedMesh;
  private acid: THREE.InstancedMesh;
  private acidCores: THREE.InstancedMesh;
  private weakPoints: THREE.InstancedMesh;
  private disabled: THREE.InstancedMesh;
  private heroRing: THREE.Mesh;
  private destination: THREE.Mesh;
  private rally: THREE.Group;
  private commandLine: THREE.Line;
  private bossLabel: THREE.Sprite | null = null;
  private bossKey = '';
  private heroLabel: THREE.Sprite | null = null;
  private heroKey = '';
  constructor(private camera: THREE.Camera) {
    const plane = new THREE.PlaneGeometry(1, 1);
    const transparent = { depthTest: false, depthWrite: false, transparent: true, toneMapped: false };
    this.back = new THREE.InstancedMesh(plane, new THREE.MeshBasicMaterial({ ...transparent, color: 0x17242c, opacity: .94 }), MAX_BARS);
    this.fill = new THREE.InstancedMesh(plane, new THREE.MeshBasicMaterial(transparent), MAX_BARS);
    this.back.renderOrder = 13; this.fill.renderOrder = 14;
    const ring = new THREE.RingGeometry(.86, 1, 40);
    this.allyRings = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ transparent: true, opacity: .85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), MAX_ALLIES);
    this.acid = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xdbfb73, transparent: true, opacity: .95, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), MAX_HAZARDS);
    this.acidCores = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xa7d542, transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), MAX_HAZARDS);
    this.weakPoints = new THREE.InstancedMesh(geometry.octa, new THREE.MeshBasicMaterial({ color: 0x9effe7, toneMapped: false }), 8);
    this.disabled = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xc8fa66, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), 32);
    for (const mesh of [this.back, this.fill, this.allyRings, this.acid, this.acidCores, this.weakPoints, this.disabled]) { mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.root.add(mesh); }
    this.acid.renderOrder = 3; this.acidCores.renderOrder = 2;
    this.heroRing = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xa8f4ff, transparent: true, opacity: .95, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.heroRing.rotation.x = -Math.PI / 2; this.root.add(this.heroRing);
    this.destination = new THREE.Mesh(new THREE.RingGeometry(.35, .44, 32), new THREE.MeshBasicMaterial({ color: 0x9ff2ff, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.destination.rotation.x = -Math.PI / 2; this.root.add(this.destination);
    this.rally = new THREE.Group();
    const pole = new THREE.Mesh(geometry.cylinder, new THREE.MeshBasicMaterial({ color: 0xffe4a6 })); pole.position.y = .65; pole.scale.set(.04, 1.1, .04); this.rally.add(pole);
    const flag = new THREE.Mesh(geometry.box, new THREE.MeshBasicMaterial({ color: 0xffcb63, side: THREE.DoubleSide })); flag.position.set(.25, 1.05, 0); flag.scale.set(.5, .3, .035); this.rally.add(flag);
    const rallyRing = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xffd47c, transparent: true, opacity: .85, depthWrite: false, side: THREE.DoubleSide })); rallyRing.rotation.x = -Math.PI / 2; rallyRing.scale.setScalar(.65); this.rally.add(rallyRing); this.root.add(this.rally);
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.commandLine = new THREE.Line(lineGeometry, new THREE.LineDashedMaterial({ color: 0xffe2a8, transparent: true, opacity: .65, dashSize: .25, gapSize: .2, depthWrite: false })); this.commandLine.frustumCulled = false; this.root.add(this.commandLine);
  }
  reset(): void {
    for (const model of this.models.values()) disposeModel(model.root, true);
    this.models.clear(); this.livery = '';
    for (const mesh of [this.back, this.fill, this.allyRings, this.acid, this.acidCores, this.weakPoints, this.disabled]) mesh.count = 0;
    for (const sprite of [this.bossLabel, this.heroLabel]) if (sprite) disposeModel(sprite, true);
    this.bossLabel = this.heroLabel = null; this.bossKey = this.heroKey = '';
    this.heroRing.visible = this.destination.visible = this.rally.visible = this.commandLine.visible = false;
  }
  private bar(index: number, x: number, y: number, z: number, width: number, fraction: number, color: number): void {
    fraction = THREE.MathUtils.clamp(fraction, 0, 1);
    this.dummy.position.set(x, y, z); this.dummy.quaternion.copy(this.camera.quaternion); this.dummy.scale.set(width + .07, .16, 1); this.dummy.updateMatrix(); this.back.setMatrixAt(index, this.dummy.matrix);
    this.dummy.position.addScaledVector(this.right, -(1 - fraction) * width / 2); this.dummy.scale.set(Math.max(.001, width * fraction), .09, 1); this.dummy.updateMatrix(); this.fill.setMatrixAt(index, this.dummy.matrix); this.color.setHex(color); this.fill.setColorAt(index, this.color);
  }
  update(state: GameState, map: MapDef, selection: TacticalSelection, time: number, reducedMotion: boolean, dt: number, preview: CommandPreview | null): void {
    if (this.livery !== state.config.livery) { this.reset(); this.livery = state.config.livery; }
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const allies = [state.hero, ...state.allies].slice(0, MAX_ALLIES), active = new Set(allies.filter(a => a.hp > 0).map(a => a.id));
    for (const [id, model] of this.models) if (!active.has(id)) { disposeModel(model.root, true); this.models.delete(id); }
    let health = 0, rings = 0;
    for (const ally of allies) {
      if (ally.hp <= 0) continue;
      const isHero = ally.id === state.hero.id, owner = ally.owner === null ? null : state.towers.find(t => t.id === ally.owner), branch = owner?.branch ?? null;
      let model = this.models.get(ally.id);
      if (model && (model.kind !== ally.kind || model.branch !== branch)) { disposeModel(model.root, true); this.models.delete(ally.id); model = undefined; }
      if (!model) { model = { ...allyModel(ally.kind, LIVERIES[state.config.livery].color, branch), motion: { x: ally.x, z: ally.z, stride: ally.id, blend: 0 } }; this.models.set(ally.id, model); this.root.add(model.root); }
      const motion = model.motion, distance = Math.hypot(ally.x - motion.x, ally.z - motion.z);
      if (dt > 0) {
        motion.stride += Math.min(distance, .6) * 8;
        motion.blend += ((distance > .001 ? 1 : 0) - motion.blend) * (1 - Math.exp(-dt * 14));
      }
      motion.x = ally.x; motion.z = ally.z;
      const moving = reducedMotion ? 0 : motion.blend, step = Math.sin(motion.stride) * moving;
      const interval = branch === 'fireteam' ? .85 : .9;
      const attack = !reducedMotion && ally.engaged !== null && ally.cooldown > interval - .24 ? Math.sin((interval - ally.cooldown) / .24 * Math.PI) : 0;
      const ranged = ally.kind === 'techmarine' || ally.kind === 'librarian' || branch === 'fireteam';
      model.root.position.set(ally.x, .17, ally.z); model.root.rotation.y = ally.facing;
      model.leftLeg.position.y = Math.max(0, step) * .12; model.rightLeg.position.y = Math.max(0, -step) * .12;
      model.leftLeg.rotation.x = step * .2; model.rightLeg.rotation.x = -step * .2;
      model.body.position.y = reducedMotion ? 0 : Math.abs(step) * .025 + Math.sin(time * 2.3 + ally.id) * .008;
      model.body.rotation.x = moving * .035 + attack * (ranged ? -.035 : .075);
      model.body.rotation.y = attack * (ranged ? 0 : -.1);
      model.body.rotation.z = reducedMotion ? 0 : ally.hit > 0 ? -.09 * Math.min(1, ally.hit * 5) : step * .035;
      model.weapon.rotation.x = attack * (ranged ? -.09 : -.28);
      model.weapon.rotation.z = attack * (ranged ? 0 : -.3);
      if (model.cape) {
        model.cape.rotation.x = .08 + (reducedMotion ? 0 : Math.sin(time * 3 + ally.id) * .045 + moving * .12);
        model.cape.rotation.z = reducedMotion ? 0 : Math.sin(time * 2.2 + ally.id) * .035;
      }
      this.bar(health++, ally.x, isHero ? (ally.kind==='librarian'?2.98:ally.kind==='techmarine'?2.7:2.48) : 1.6, ally.z, isHero ? 1.03 : .59, ally.hp / ally.maxHp, isHero ? 0x9ff4ff : ally.hp < ally.maxHp * .3 ? 0xffaa65 : 0xa9ef9b);
      this.dummy.position.set(ally.x, .17, ally.z); this.dummy.rotation.set(-Math.PI / 2, 0, 0); this.dummy.scale.setScalar(isHero ? .58 : .3); this.dummy.updateMatrix(); this.allyRings.setMatrixAt(rings, this.dummy.matrix);
      this.color.setHex(ally.engaged !== null ? 0xffdf85 : isHero ? 0x99eeff : 0x90d59a); this.allyRings.setColorAt(rings++, this.color);
    }
    if (state.objective.status === 'active') this.bar(health++, state.objective.x, 1.85, state.objective.z, 1.3, state.objective.hp / 150, state.objective.hp < 50 ? 0xff8269 : 0xffd478);
    map.gateNames.forEach((_, i) => {
      if (health >= MAX_BARS) return;
      const path = map.paths.find((_, pathIndex) => map.exits[pathIndex] === i) ?? map.paths[0], end = path[path.length - 1], hp = state.gates[i] ?? state.integrity;
      this.bar(health++, end.x, 3.28, end.z, 1.55, hp / ((20 + LOADOUTS[state.config.loadout].gateBonus) / map.gateNames.length), hp <= 5 ? 0xff765b : 0xa2efb0);
    });
    this.back.count = this.fill.count = health; this.allyRings.count = rings;
    const heroSelected = selection.ability === 'moveHero', hero = state.hero;
    this.heroRing.visible = heroSelected || hero.hp <= 0;
    this.heroRing.position.set(hero.x, .2, hero.z); this.heroRing.scale.setScalar(hero.hp <= 0 ? .8 : .92);
    (this.heroRing.material as THREE.MeshBasicMaterial).color.setHex(hero.hp <= 0 ? 0xffd28a : 0xb6f4ff);
    const heroText = hero.hp <= 0 ? `REVIVING ${Math.ceil(hero.respawn)}s` : heroSelected ? 'HERO SELECTED' : '';
    if (heroText !== this.heroKey) {
      if (this.heroLabel) disposeModel(this.heroLabel, true); this.heroLabel = heroText ? label(heroText, hero.hp <= 0 ? '#ffda97' : '#b5f6ff') : null;
      this.heroKey = heroText; if (this.heroLabel) { this.heroLabel.scale.set(2.6, .4, 1); this.root.add(this.heroLabel); }
    }
    if (this.heroLabel) this.heroLabel.position.set(hero.x, hero.hp > 0 ? (hero.kind==='librarian'?3.36:hero.kind==='techmarine'?3.08:2.86) : .95, hero.z);
    const heroMoving = hero.hp > 0 && Math.hypot(hero.destination.x - hero.x, hero.destination.z - hero.z) > .3;
    this.destination.visible = heroMoving || heroSelected && !!selection.aim;
    const dest = heroSelected && selection.aim ? preview?.valid ? preview.point : selection.aim : hero.destination; this.destination.position.set(dest.x, .22, dest.z);
    (this.destination.material as THREE.MeshBasicMaterial).color.setHex(heroSelected && preview && !preview.valid ? 0xff806b : 0x9ff2ff);
    const tower = state.towers.find(t => t.id === selection.towerId && t.kind === 'barracks');
    this.rally.visible = !!tower;
    this.commandLine.visible = !!tower || (heroSelected || heroMoving) && hero.hp > 0;
    (this.commandLine.material as THREE.LineDashedMaterial).color.setHex(preview && !preview.valid ? 0xff806b : tower ? 0xffe2a8 : 0x9ff2ff);
    if (tower) {
      const point = selection.ability === 'rally' && selection.aim ? preview?.valid ? preview.point : selection.aim : tower.rally;
      this.rally.position.set(point.x, .22, point.z); this.line(tower, point);
    } else if (heroSelected || heroMoving) this.line(hero, dest);
    let acid = 0;
    for (const hazard of state.hazards.slice(0, MAX_HAZARDS)) {
      this.dummy.position.set(hazard.x, .23, hazard.z); this.dummy.rotation.set(-Math.PI / 2, 0, 0); this.dummy.scale.set(hazard.radius, hazard.radius, 1); this.dummy.updateMatrix(); this.acid.setMatrixAt(acid, this.dummy.matrix);
      const progress = THREE.MathUtils.clamp(1 - hazard.timer / 2.5, .08, 1);
      this.dummy.position.y = .2; this.dummy.scale.set(hazard.radius * progress, hazard.radius * progress, 1); this.dummy.updateMatrix(); this.acidCores.setMatrixAt(acid++, this.dummy.matrix);
    }
    this.acid.count = this.acidCores.count = acid;
    let disabled = 0;
    for (const tower of state.towers) if (tower.disabled > 0 && disabled < 32) {
      this.dummy.position.set(tower.x, .48, tower.z); this.dummy.rotation.set(-Math.PI / 2, 0, 0); this.dummy.scale.setScalar(1.05); this.dummy.updateMatrix(); this.disabled.setMatrixAt(disabled++, this.dummy.matrix);
    }
    this.disabled.count = disabled;
    const bosses = state.enemies.filter(e => e.kind === 'tyrant').slice(0, 8); let weak = 0;
    for (const boss of bosses) if (boss.weakTime > 0) {
      this.dummy.position.set(boss.x + Math.sin(boss.facing) * .9, 3.4, boss.z + Math.cos(boss.facing) * .9); this.dummy.rotation.set(0, reducedMotion ? 0 : time, 0); this.dummy.scale.set(.4, .55, .4); this.dummy.updateMatrix(); this.weakPoints.setMatrixAt(weak++, this.dummy.matrix);
    }
    this.weakPoints.count = weak;
    const boss = bosses[0], bossText = boss ? `PHASE ${boss.bossPhase || 1} / ${boss.weakTime > 0 ? 'WEAK POINT' : boss.shielded || boss.barrier ? 'DESTROY NESTS' : 'HIVE TYRANT'}` : '';
    if (bossText !== this.bossKey) {
      if (this.bossLabel) disposeModel(this.bossLabel, true); this.bossLabel = bossText ? label(bossText, boss?.weakTime ? '#a8ffe8' : '#ffbc94') : null;
      this.bossKey = bossText; if (this.bossLabel) { this.bossLabel.scale.set(4, .46, 1); this.root.add(this.bossLabel); }
    }
    if (boss && this.bossLabel) this.bossLabel.position.set(boss.x, 6.5, boss.z);
    for (const mesh of [this.back, this.fill, this.allyRings, this.acid, this.acidCores, this.weakPoints, this.disabled]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }
  private line(from: Point, to: Point): void {
    const position = this.commandLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setXYZ(0, from.x, .23, from.z); position.setXYZ(1, to.x, .23, to.z); position.needsUpdate = true; this.commandLine.computeLineDistances();
  }
  get diagnostics() { return { allies: this.models.size, allyCapacity: MAX_ALLIES, acidWarnings: this.acid.count, disabledTowers: this.disabled.count, weakPoints: this.weakPoints.count }; }
}

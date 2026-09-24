import * as THREE from 'three';
import { ENEMIES, TOWERS, towerStats } from '../game/data';
import type { BranchId, CombatEvent, Command, EnemyKind, GameState, MapDef, Point, TowerKind } from '../game/types';
import { creatureParts, geometry, turretModel } from './models';
import type { CreaturePart, TurretModel } from './models';
import { getMap } from '../game/maps';
import { terrainModel, updateTerrain, disposeModel } from './terrain';
import { animateScenery, sceneryMaterials } from './scenery';
import type { TerrainModel } from './terrain';
import { Tactics } from './tactics';
import { BattlefieldVfx, shotOrigin } from './vfx';
import { contactShadowBatch, miniatureLighting } from './lighting';
import { previewCommand, type CommandPreview } from '../game/commands';
import { CommandFeedback } from './command-feedback';

export interface Selection { pad: number | null; kind: TowerKind | null; towerId: number | null; ability: Command | null; aim: Point | null; hoverPad?: number | null }
interface CreatureBatch { mesh: THREE.InstancedMesh; parts: CreaturePart[]; count: number }
interface Effect { mesh: THREE.Mesh; life: number; total: number; mode: 'bolt' | 'beam' | 'flame' | 'burst' | 'ring' | 'slash'; from: THREE.Vector3; to: THREE.Vector3; size: number; opacity: number }
const MAX_ENEMIES = 128;
const MAX_FIRES = 64;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const COLOR = new THREE.Color();

export class World {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-20, 20, 20, -20, .1, 150);
  private renderer: THREE.WebGLRenderer;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private target = new THREE.Vector3(-.3, 0, 1);
  private cameraOffset = new THREE.Vector3(20, 34, 36);
  private zoomFactor = 1;
  private time = 0;
  private width = 1;
  private height = 1;
  private quality: 'high' | 'low' = 'high';
  private reducedMotion = false;
  private lastElapsed = -1;
  private lastWave = -1;
  private sun: THREE.DirectionalLight;
  private lighting: ReturnType<typeof miniatureLighting>;
  private towers = new Map<number, TurretModel & { level: number; kind: TowerKind; branch: BranchId | null; recoil: number }>();
  private pulseTimes = new Map<number, number>();
  private creatures = new Map<EnemyKind, CreatureBatch[]>();
  private map: MapDef;
  private terrain: TerrainModel;
  private tactics: Tactics;
  private vfx = new BattlefieldVfx();
  private commands = new CommandFeedback();
  private commandPreview: CommandPreview | null = null;
  private runId = '';
  private range: THREE.Mesh;
  private aim: THREE.Group;
  private aimRing: THREE.Mesh;
  private selectedPad: THREE.Mesh;
  private healthBack: THREE.InstancedMesh;
  private healthFill: THREE.InstancedMesh;
  private contactShadows = contactShadowBatch(MAX_ENEMIES + 96 + 32);
  private auras: THREE.InstancedMesh;
  private telegraphs: THREE.InstancedMesh;
  private strikeProgress: THREE.InstancedMesh;
  private countdowns = new THREE.InstancedBufferAttribute(new Float32Array(32), 1);
  private shields: THREE.InstancedMesh;
  private chargeRings: THREE.InstancedMesh;
  private chargeArrows: THREE.InstancedMesh;
  private chargeTrails: THREE.InstancedMesh;
  private firePools: THREE.InstancedMesh;
  private fireCores: THREE.InstancedMesh;
  private fireRims: THREE.InstancedMesh;
  private effectPool: Effect[] = [];
  private dummy = new THREE.Object3D();
  private matrix = new THREE.Matrix4();
  private rootMatrix = new THREE.Matrix4();
  private limbMatrix = new THREE.Matrix4();
  private forward = new THREE.Vector3();
  private effectStart = new THREE.Vector3();
  private effectEnd = new THREE.Vector3();
  private effectDirection = new THREE.Vector3();
  private healthGeometry = new THREE.PlaneGeometry(1, 1);
  private slashGeometry = new THREE.RingGeometry(.72,1,24,1,0,Math.PI*.85);
  private ash: THREE.Points;

  constructor(private canvas: HTMLCanvasElement, private getState: () => GameState) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x11191c);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.fog = new THREE.FogExp2(0x172126, .0105);
    this.lighting = miniatureLighting(this.renderer, this.scene); this.sun = this.lighting.sun;
    this.map = getMap(this.getState().config.map);
    this.terrain = terrainModel(this.map); this.scene.add(this.terrain.root);
    this.setAtmosphere();
    this.scene.add(this.vfx.root);
    this.scene.add(this.contactShadows);
    this.scene.add(this.commands.root);
    this.tactics = new Tactics(this.camera); this.scene.add(this.tactics.root);
    const ringGeometry = new THREE.RingGeometry(.96, 1, 96);
    this.range = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xdbbd7a, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
    this.range.rotation.x = -Math.PI / 2; this.range.position.y = .17; this.range.visible = false; this.scene.add(this.range);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(.96, 96), new THREE.MeshBasicMaterial({ color: 0xe0bd74, transparent: true, opacity: .065, side: THREE.DoubleSide, depthWrite: false }));
    disk.position.z = -.001; this.range.add(disk);
    this.selectedPad = new THREE.Mesh(new THREE.RingGeometry(.87, .95, 48), new THREE.MeshBasicMaterial({ color: 0xffdd94, transparent: true, opacity: .95, depthWrite: false }));
    this.selectedPad.rotation.x = -Math.PI / 2; this.selectedPad.visible = false; this.scene.add(this.selectedPad);
    this.aim = new THREE.Group();
    this.aimRing = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xff704c, transparent: true, opacity: .9, depthWrite: false }));
    this.aimRing.rotation.x = -Math.PI / 2; this.aim.add(this.aimRing);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const bar = new THREE.Mesh(geometry.box, new THREE.MeshBasicMaterial({ color: 0xffb284 })); bar.position.set(Math.sin(a) * .95, 0, Math.cos(a) * .95); bar.rotation.y = a; bar.scale.set(.025, .01, .22); this.aim.add(bar); }
    this.scene.add(this.aim); this.aim.visible = false;
    // Both layers must share the transparent queue for renderOrder to keep the fill on top.
    this.healthBack = new THREE.InstancedMesh(this.healthGeometry, new THREE.MeshBasicMaterial({ color: 0x172022, depthTest: false, depthWrite: false, transparent: true, opacity: .92 }), MAX_ENEMIES);
    this.healthFill = new THREE.InstancedMesh(this.healthGeometry, new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, transparent: true, toneMapped: false }), MAX_ENEMIES);
    this.healthBack.renderOrder = 11; this.healthFill.renderOrder = 12;
    this.auras = new THREE.InstancedMesh(new THREE.RingGeometry(.84, 1, 32), new THREE.MeshBasicMaterial({ color: 0x9f7fe9, transparent: true, opacity: .55, depthWrite: false, side: THREE.DoubleSide }), MAX_ENEMIES);
    this.telegraphs = new THREE.InstancedMesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xff794b, transparent: true, opacity: .85, depthWrite: false, side: THREE.DoubleSide }), 32);
    const countdownGeometry = new THREE.RingGeometry(.88, .945, 80);
    countdownGeometry.setAttribute('countdown', this.countdowns); this.countdowns.setUsage(THREE.DynamicDrawUsage);
    this.strikeProgress = new THREE.InstancedMesh(countdownGeometry, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'attribute float countdown; varying float vProgress; varying vec2 vRing; void main(){vProgress=countdown;vRing=position.xy;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying float vProgress; varying vec2 vRing; void main(){float angle=mod(atan(vRing.x,vRing.y)+6.283185,6.283185)/6.283185;if(angle>vProgress)discard;gl_FragColor=vec4(1.,.83,.48,.95);}',
    }), 32);
    this.strikeProgress.count = 0; this.strikeProgress.frustumCulled = false; this.strikeProgress.renderOrder = 4;
    this.strikeProgress.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(this.strikeProgress);
    const shieldMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMotion: { value: 1 } }, transparent: true, depthWrite: false,
      vertexShader: `varying vec3 vNormal; varying vec3 vView; varying float vHeight;
        void main() {
          vec4 local = instanceMatrix * vec4(position, 1.0);
          vec4 view = modelViewMatrix * local;
          mat3 instanceBasis = mat3(instanceMatrix);
          vec3 scaledNormal = normal / vec3(dot(instanceBasis[0], instanceBasis[0]), dot(instanceBasis[1], instanceBasis[1]), dot(instanceBasis[2], instanceBasis[2]));
          vNormal = normalize(normalMatrix * instanceBasis * scaledNormal);
          vView = normalize(-view.xyz); vHeight = position.y;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `uniform float uTime; uniform float uMotion; varying vec3 vNormal; varying vec3 vView; varying float vHeight;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.5);
          float bands = pow(0.5 + 0.5 * sin(vHeight * 24.0 - uTime * 2.0 * uMotion), 10.0);
          gl_FragColor = vec4(mix(vec3(0.46, 0.20, 0.85), vec3(0.83, 0.64, 1.0), rim), 0.035 + rim * 0.36 + bands * 0.055);
        }`,
    });
    this.shields = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 12), shieldMaterial, MAX_ENEMIES);
    this.chargeRings = new THREE.InstancedMesh(new THREE.RingGeometry(.88, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .82, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), MAX_ENEMIES);
    this.chargeArrows = new THREE.InstancedMesh(geometry.cone, new THREE.MeshBasicMaterial({ color: 0xffa544, transparent: true, opacity: .8, depthWrite: false, toneMapped: false }), MAX_ENEMIES * 2);
    this.chargeTrails = new THREE.InstancedMesh(geometry.ball, new THREE.MeshBasicMaterial({ color: 0xff4d35, transparent: true, opacity: .5, depthWrite: false, toneMapped: false }), MAX_ENEMIES * 3);
    this.firePools = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: 0xb84317, transparent: true, opacity: .4, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), MAX_FIRES);
    this.fireCores = new THREE.InstancedMesh(geometry.ball, new THREE.MeshBasicMaterial({ color: 0xff8c32, transparent: true, opacity: .56, depthWrite: false, toneMapped: false }), MAX_FIRES * 3);
    this.fireRims = new THREE.InstancedMesh(new THREE.RingGeometry(.93, 1, 28), new THREE.MeshBasicMaterial({ color: 0xff9149, transparent: true, opacity: .6, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), MAX_FIRES);
    this.firePools.renderOrder = 1; this.fireRims.renderOrder = 2; this.shields.renderOrder = 5;
    for (const m of [this.healthBack, this.healthFill, this.auras, this.telegraphs, this.shields, this.chargeRings, this.chargeArrows, this.chargeTrails, this.firePools, this.fireCores, this.fireRims]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(m); }
    this.createCreatures();
    for (let i = 0; i < 180; i++) {
      const mesh = new THREE.Mesh(geometry.ball, new THREE.MeshBasicMaterial({ color: 0xffcf78, transparent: true, opacity: 1, depthWrite: false, toneMapped: false }));
      mesh.visible = false; this.scene.add(mesh);
      this.effectPool.push({ mesh, life: 0, total: 1, mode: 'burst', from: new THREE.Vector3(), to: new THREE.Vector3(), size: 1, opacity: 1 });
    }
    const ashGeometry = new THREE.BufferGeometry(); const positions = new Float32Array(150 * 3);
    for (let i = 0; i < 150; i++) { positions[i * 3] = this.random(i * 3) * 44 - 22; positions[i * 3 + 1] = this.random(i * 3 + 1) * 11 + 1; positions[i * 3 + 2] = this.random(i * 3 + 2) * 30 - 15; }
    ashGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.ash = new THREE.Points(ashGeometry, new THREE.PointsMaterial({ color: 0xc3b9a2, size: .038, transparent: true, opacity: .36, depthWrite: false })); this.scene.add(this.ash);
    this.resize();
  }

  private setAtmosphere(){
    const color=this.map.id==='wastes'?0x302a27:this.map.id==='crossroads'?0x18242b:0x141f27;
    this.renderer.setClearColor(color);this.scene.fog=new THREE.FogExp2(color,.006);
    this.vfx.setMap(this.map,this.terrain.vents);
    this.sun.color.setHex(this.map.id==='wastes'?0xffcc9a:this.map.id==='crossroads'?0xe1edff:0xffdec2);
  }
  private random(seed: number) { const r = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return r - Math.floor(r); }
  private syncMap(state: GameState): void {
    if (this.map.id !== state.config.map) {
      disposeModel(this.terrain.root, true);
      this.map = getMap(state.config.map);
      this.terrain = terrainModel(this.map); this.scene.add(this.terrain.root);
      this.setAtmosphere();
      this.resetCamera();
    }
    if (this.runId !== state.runId) {
      this.resetEffects(); this.tactics.reset();
      for (const model of this.towers.values()) this.removeTowerModel(model);
      this.towers.clear(); this.runId = state.runId;
    }
    updateTerrain(this.terrain, this.map, state);
  }

  private createCreatures() {
    for (const kind of Object.keys(ENEMIES) as EnemyKind[]) {
      const mats = {
        skin: new THREE.MeshStandardMaterial({ color: ENEMIES[kind].color, roughness: .72, envMapIntensity: .45 }),
        shell: new THREE.MeshStandardMaterial({ color: kind === 'carnifex' ? 0x514356 : kind === 'tyrant' ? 0x65354e : kind === 'zoanthrope' ? 0x573688 : kind === 'ravener' ? 0x653e33 : 0x5b395b, roughness: .4, metalness: .08, envMapIntensity: .8 }),
        claw: new THREE.MeshStandardMaterial({ color: 0xe9dac0, roughness: .57, envMapIntensity: .5 }),
        eye: new THREE.MeshStandardMaterial({ color: kind === 'zoanthrope' ? 0xd3adff : 0xffc370, emissive: kind === 'zoanthrope' ? 0x954bff : 0xff6c2d, emissiveIntensity: 2.5 }),
      };
      const buckets = new Map<string, CreaturePart[]>();
      for (const part of creatureParts(kind)) { const key = `${part.shape}:${part.surface}`; const parts = buckets.get(key) ?? []; parts.push(part); buckets.set(key, parts); }
      const batches: CreatureBatch[] = [];
      for (const parts of buckets.values()) {
        const mesh = new THREE.InstancedMesh(geometry[parts[0].shape], mats[parts[0].surface], MAX_ENEMIES * parts.length);
        mesh.count = 0; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(mesh);
        batches.push({ mesh, parts, count: 0 });
      }
      this.creatures.set(kind, batches);
    }
  }

  update(dt: number, events: CombatEvent[], selection: Selection): void {
    const state = this.getState();
    this.syncMap(state);
    if (state.elapsed < this.lastElapsed || state.wave < this.lastWave) this.resetEffects();
    this.lastElapsed = state.elapsed; this.lastWave = state.wave;
    const animDt = state.paused ? 0 : Math.min(dt, .1) * state.speed; this.time += animDt;
    animateScenery(this.terrain.scenery, this.time, this.quality === 'high', this.reducedMotion);
    this.updateContactShadows(state);
    (this.shields.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;
    const active = new Set(state.towers.map(t => t.id));
    for (const [id, model] of this.towers) if (!active.has(id)) { this.removeTowerModel(model); this.towers.delete(id); this.pulseTimes.delete(id); }
    for (const tower of state.towers) {
      let model = this.towers.get(tower.id);
      if (model && (model.branch !== tower.branch || model.kind !== tower.kind || model.level !== tower.level)) { this.removeTowerModel(model); model = undefined; }
      if (!model) { model = { ...turretModel(tower.kind, tower.branch, tower.level), level: tower.level, kind: tower.kind, branch: tower.branch, recoil: 0 }; model.root.position.set(tower.x, .32, tower.z); this.scene.add(model.root); this.towers.set(tower.id, model); }
      model.head.rotation.y = tower.kind === 'barracks' ? 0 : tower.aim;
      model.recoil *= Math.exp(-animDt * 17);
      if (!this.reducedMotion && events.some(e => e.type === 'shot' && e.towerId === tower.id)) model.recoil = tower.kind === 'lascannon' ? .18 : tower.kind === 'bolter' ? .11 : .045;
      model.head.position.set(-Math.sin(tower.aim) * model.recoil, 0, -Math.cos(tower.aim) * model.recoil);
      if(model.rotor)model.rotor.rotation.y=this.reducedMotion?0:this.time*.6;
      model.core.rotation.y = this.reducedMotion ? 0 : this.time * 1.4;
      const pulse = this.reducedMotion ? (tower.overcharge > 0 ? 1.35 : 1) : tower.overcharge > 0 ? 1.4 + Math.sin(this.time * 10) * .3 : 1 + Math.sin(this.time * 2) * .1;
      model.core.scale.set(.13 * pulse, .16 * pulse, .13 * pulse);
      model.head.scale.setScalar(1 + (tower.level - 1) * .065);
      if (model.level !== tower.level) model.level = tower.level;
      model.root.position.set(tower.x, .32, tower.z);
      if (state.phase === 'combat' && !state.paused && this.time - (this.pulseTimes.get(tower.id) ?? -10) > 1.2) {
        const radius = towerStats(tower.kind, tower.level, tower.branch).range;
        if (tower.kind === 'stasis' && state.enemies.some(e => Math.hypot(e.x - tower.x, e.z - tower.z) <= radius)) {
          this.effect('ring', tower.x, .19, tower.z, tower.x, .19, tower.z, tower.branch === 'deepfreeze' ? 0x94eafa : 0xb398ff, 1.1, radius);
          this.pulseTimes.set(tower.id, this.time);
        } else if (tower.overcharge > 0) {
          this.effect('ring', tower.x, .36, tower.z, tower.x, .36, tower.z, 0xffdc89, .85, 1.5);
          this.pulseTimes.set(tower.id, this.time);
        }
      }
    }
    const hoveredTower = state.towers.find(t => t.pad === selection.hoverPad);
    this.commandPreview = selection.ability && selection.aim ? previewCommand(state, selection.ability, selection.ability === 'overcharge' ? hoveredTower?.id ?? -1 : selection.aim, selection.towerId) : null;
    this.commands.update(this.commandPreview, selection.aim, animDt, this.reducedMotion);
    this.tactics.update(state, this.map, selection, this.time, this.reducedMotion, animDt, this.commandPreview);
    for (const batches of this.creatures.values()) for (const b of batches) b.count = 0;
    let healthCount = 0, auraCount = 0, shieldCount = 0, chargeCount = 0, arrowCount = 0, trailCount = 0;
    this.forward.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    for (const enemy of state.enemies.slice(0, MAX_ENEMIES)) {
      const scale = ENEMIES[enemy.kind].scale;
      // Distance-driven feet follow stasis, charge speed and blocked movement exactly.
      const heavy = enemy.kind === 'carnifex' || enemy.kind === 'tyrant';
      const gait = enemy.progress * (heavy ? 3.4 : 6) + enemy.id * 2.1;
      const caster = enemy.kind === 'zoanthrope', ravener = enemy.kind === 'ravener';
      const planted = enemy.kind === 'nest' || enemy.blockedBy !== null || ravener && enemy.chargePhase === 'winding';
      const bob = this.reducedMotion || planted ? 0 : caster ? Math.sin(this.time * 2 + enemy.id) * .08 : Math.abs(Math.sin(gait)) * (heavy ? .022 : .045) * scale;
      const strike = !this.reducedMotion && enemy.blockedBy !== null && enemy.attackTimer > .84 ? Math.sin((1.1 - enemy.attackTimer) / .26 * Math.PI) : 0;
      const impact = this.reducedMotion ? 0 : Math.sin(Math.min(1, enemy.hit / .12) * Math.PI);
      const pitch = (this.reducedMotion ? 0 : ravener && enemy.chargePhase === 'winding' ? -.16 : ravener && enemy.chargePhase === 'charging' ? .12 : strike * .13) - impact * (heavy ? .035 : .1);
      const source = enemy.lastHitBy === -1 ? state.hero : state.towers.find(t => t.id === enemy.lastHitBy);
      const recoil = source ? Math.atan2(enemy.x - source.x, enemy.z - source.z) : enemy.facing + Math.PI;
      const push = impact * (heavy ? .045 : .12);
      this.dummy.position.set(enemy.x + Math.sin(recoil) * push, (caster ? .4 : .12) + bob, enemy.z + Math.cos(recoil) * push);
      this.dummy.rotation.set(pitch, enemy.facing, this.reducedMotion || planted ? 0 : Math.sin(gait) * (heavy ? .035 : .02));
      this.dummy.scale.set(scale * (1 + impact * .025), scale * (1 - impact * .04), scale * (1 + impact * .025)); this.dummy.updateMatrix(); this.rootMatrix.copy(this.dummy.matrix);
      const batches = this.creatures.get(enemy.kind)!;
      for (const batch of batches) {
        for (const part of batch.parts) {
          this.matrix.copy(this.rootMatrix);
          if (part.leg >= 0 && !this.reducedMotion && !planted) {
            if (part.leg >= 10) this.limbMatrix.makeTranslation(Math.sin((caster ? this.time * 2 : gait) + part.leg * .9) * (caster ? .045 : .075), 0, 0);
            else this.limbMatrix.makeTranslation(0, Math.max(0, Math.sin(gait + part.leg * Math.PI)) * .12, Math.sin(gait + part.leg * Math.PI) * .11);
            this.matrix.multiply(this.limbMatrix);
          }
          this.matrix.multiply(part.transform); batch.mesh.setMatrixAt(batch.count, this.matrix);
          COLOR.set(enemy.slowTimer > 0 ? 0xb4b6ff : enemy.burnTime > 0 ? 0xffbe91 : enemy.armorCracked && part.surface === 'shell' ? 0xdfb7a8 : 0xffffff); if (enemy.hit > 0 && !this.reducedMotion) COLOR.multiplyScalar(1.6); batch.mesh.setColorAt(batch.count++, COLOR);
        }
      }
      if (healthCount < MAX_ENEMIES && (enemy.hp < enemy.maxHp || enemy.kind === 'warrior' || enemy.kind === 'tyrant' || enemy.kind === 'carnifex' || enemy.kind === 'nest' || caster || ravener)) {
        const y = enemy.kind === 'tyrant' ? 6 : caster ? 3.12 : enemy.kind === 'warrior' ? 2.7 : ravener ? 2 : 1.65 * scale;
        const width = enemy.kind === 'tyrant' ? 2.5 : .8 * Math.max(1, scale); const fraction = Math.max(0, enemy.hp / enemy.maxHp);
        this.dummy.position.set(enemy.x, y, enemy.z); this.dummy.quaternion.copy(this.camera.quaternion); this.dummy.scale.set(width + .08, .15, 1); this.dummy.updateMatrix(); this.healthBack.setMatrixAt(healthCount, this.dummy.matrix);
        this.dummy.position.addScaledVector(this.forward, -(1 - fraction) * width / 2); this.dummy.scale.set(width * fraction, .08, 1); this.dummy.updateMatrix(); this.healthFill.setMatrixAt(healthCount, this.dummy.matrix);
        COLOR.set(enemy.kind === 'tyrant' ? 0xfa805c : enemy.barrier || enemy.shielded ? 0xc5a0fa : enemy.hp / enemy.maxHp < .3 ? 0xee785c : 0xcbbb88); this.healthFill.setColorAt(healthCount++, COLOR);
      }
      if (auraCount < MAX_ENEMIES && (enemy.shielded || enemy.barrier || caster || enemy.kind === 'warrior' || enemy.kind === 'tyrant' || enemy.slowTimer > 0)) {
        this.dummy.position.set(enemy.x, .14, enemy.z); this.dummy.rotation.set(-Math.PI / 2, 0, 0);
        const auraScale = (enemy.kind === 'warrior' || enemy.kind === 'tyrant' || caster) ? scale * 1.3 : scale * .85;
        this.dummy.scale.set(auraScale, auraScale, 1); this.dummy.updateMatrix(); this.auras.setMatrixAt(auraCount, this.dummy.matrix); COLOR.set(enemy.slowTimer > 0 ? 0x77dcf0 : 0xca98ff); this.auras.setColorAt(auraCount++, COLOR);
      }
      if (shieldCount < MAX_ENEMIES && (enemy.barrier || caster)) {
        this.dummy.position.set(enemy.x, caster ? 1.9 : scale * .96, enemy.z); this.dummy.rotation.set(0, enemy.facing, 0);
        this.dummy.scale.set(scale * .92, scale * (caster ? 1.35 : 1), scale * 1.18); this.dummy.updateMatrix(); this.shields.setMatrixAt(shieldCount++, this.dummy.matrix);
      }
      if (ravener && enemy.chargePhase !== 'moving' && chargeCount < MAX_ENEMIES) {
        const winding = enemy.chargePhase === 'winding', progress = THREE.MathUtils.clamp(1 - enemy.chargeTimer / 1.8, 0, 1);
        this.dummy.position.set(enemy.x, .19, enemy.z); this.dummy.rotation.set(-Math.PI / 2, 0, 0);
        const radius = winding ? .9 + progress * .35 : .9;
        this.dummy.scale.set(radius, radius, 1); this.dummy.updateMatrix(); this.chargeRings.setMatrixAt(chargeCount, this.dummy.matrix); COLOR.set(winding ? 0xffa544 : 0xff5b40); this.chargeRings.setColorAt(chargeCount++, COLOR);
        const dx = Math.sin(enemy.facing), dz = Math.cos(enemy.facing);
        if (winding) for (let i = 0; i < 2; i++) {
          this.dummy.position.set(enemy.x + dx * (1.3 + i * .75), .2, enemy.z + dz * (1.3 + i * .75));
          this.effectDirection.set(dx, 0, dz); this.dummy.quaternion.setFromUnitVectors(Y_AXIS, this.effectDirection); this.dummy.scale.set(.18, .48, .055); this.dummy.updateMatrix(); this.chargeArrows.setMatrixAt(arrowCount++, this.dummy.matrix);
        }
        else for (let i = 0; i < (this.reducedMotion ? 1 : 3); i++) {
          this.dummy.position.set(enemy.x - dx * (.6 + i * .5), .2, enemy.z - dz * (.6 + i * .5)); this.dummy.rotation.set(0, enemy.facing, 0);
          this.dummy.scale.set(.28 - i * .045, .055, .65 - i * .09); this.dummy.updateMatrix(); this.chargeTrails.setMatrixAt(trailCount++, this.dummy.matrix);
        }
      }
    }
    for (const batches of this.creatures.values()) for (const batch of batches) { batch.mesh.count = batch.count; batch.mesh.instanceMatrix.needsUpdate = true; if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true; }
    this.healthBack.count = this.healthFill.count = healthCount; this.auras.count = auraCount; this.shields.count = shieldCount;
    this.chargeRings.count = chargeCount; this.chargeArrows.count = arrowCount; this.chargeTrails.count = trailCount;
    for (const m of [this.healthBack, this.healthFill, this.auras, this.shields, this.chargeRings, this.chargeArrows, this.chargeTrails]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    this.updateFires(state);
    this.telegraphs.count = Math.min(32, state.strikes.length);
    state.strikes.slice(0, 32).forEach((strike, i) => { this.dummy.position.set(strike.x, .2, strike.z); this.dummy.rotation.set(-Math.PI / 2, 0, this.reducedMotion ? 0 : this.time); const r = this.reducedMotion ? 4 : 4 * (1 + Math.sin(this.time * 14) * .025); this.dummy.scale.set(r, r, 1); this.dummy.updateMatrix(); this.telegraphs.setMatrixAt(i, this.dummy.matrix); }); this.telegraphs.instanceMatrix.needsUpdate = true;
    this.strikeProgress.count = this.telegraphs.count;
    state.strikes.slice(0, 32).forEach((strike, i) => {
      this.dummy.position.set(strike.x, .215, strike.z); this.dummy.rotation.set(-Math.PI / 2, 0, 0); this.dummy.scale.set(4, 4, 1); this.dummy.updateMatrix();
      this.strikeProgress.setMatrixAt(i, this.dummy.matrix); this.countdowns.setX(i, THREE.MathUtils.clamp(1 - strike.timer / 1.5, 0, 1));
    });
    this.strikeProgress.instanceMatrix.needsUpdate = true; this.countdowns.needsUpdate = true;
    const tower = state.towers.find(t => t.id === selection.towerId);
    const point = tower ?? (selection.pad !== null ? this.map.pads[selection.pad] : null);
    const kind = tower?.kind ?? selection.kind;
    this.range.visible = !!point && !!kind && !selection.ability;
    if (point && kind) { const radius = towerStats(kind, tower?.level ?? 1, tower?.branch ?? null).range; this.range.position.set(point.x, .18, point.z); this.range.scale.set(radius, radius, 1); (this.range.material as THREE.MeshBasicMaterial).color.set(TOWERS[kind].color); }
    if (selection.ability === 'heroSkill' || selection.ability === 'rally' && tower) {
      const origin = selection.ability === 'heroSkill' ? state.hero : tower!, radius = selection.ability === 'heroSkill' ? 7 : 6;
      this.range.visible = true; this.range.position.set(origin.x, .18, origin.z); this.range.scale.set(radius, radius, 1);
      (this.range.material as THREE.MeshBasicMaterial).color.setHex(0x9edacb);
    }
    this.selectedPad.visible = !!point;
    if (point) this.selectedPad.position.set(point.x, .34, point.z);
    const aimedAbility = selection.ability === 'barrage' || selection.ability === 'reinforcements' || selection.ability === 'heroSkill';
    this.aim.visible = !!selection.aim && aimedAbility;
    if (selection.aim && aimedAbility) {
      const radius = selection.ability === 'barrage' ? 4 : selection.ability === 'heroSkill' ? state.hero.kind === 'techmarine' ? 4 : 3 : .9;
      const color = selection.ability === 'reinforcements' ? 0x9ce5ad : state.hero.kind === 'librarian' ? 0xb9a4ff : state.hero.kind === 'techmarine' ? 0x8ceaf2 : 0xffd27d;
      const target = this.commandPreview?.valid ? this.commandPreview.point : selection.aim;
      this.aim.position.set(target.x, .19, target.z); this.aim.scale.setScalar(radius);
      this.aim.rotation.y = this.reducedMotion || selection.ability === 'reinforcements' ? 0 : this.time * .25;
      (this.aimRing.material as THREE.MeshBasicMaterial).color.setHex(this.commandPreview && !this.commandPreview.valid ? 0xff5b51 : selection.ability === 'barrage' ? 0xffd27d : color);
    }
    for (const event of events) { this.addEvent(event); this.vfx.event(event,state); }
    this.updateEffects(animDt);
    this.vfx.update(animDt,this.camera);
    this.ash.rotation.y = this.reducedMotion ? 0 : Math.sin(this.time * .015) * .04; this.ash.position.x = this.reducedMotion ? 0 : Math.sin(this.time * .07) * .4;
    this.renderer.render(this.scene, this.camera);
  }

  private removeTowerModel(model: TurretModel): void {
    disposeModel(model.root, true);
  }

  private updateFires(state: GameState): void {
    let count = 0, coreCount = 0;
    for (const fire of state.fires) {
      if (fire.time <= 0 || count >= MAX_FIRES) continue;
      const fade = Math.min(1, fire.time / .6);
      this.dummy.position.set(fire.x, .155, fire.z); this.dummy.rotation.set(-Math.PI / 2, 0, 0); this.dummy.scale.set(fire.radius, fire.radius, 1); this.dummy.updateMatrix();
      this.firePools.setMatrixAt(count, this.dummy.matrix);
      COLOR.set(0xffffff).multiplyScalar(.35 + fade * .65); this.firePools.setColorAt(count, COLOR);
      this.dummy.position.y = .165; this.dummy.updateMatrix(); this.fireRims.setMatrixAt(count, this.dummy.matrix); this.fireRims.setColorAt(count++, COLOR);
      for (let i = 0; i < 3; i++) {
        const angle = fire.id * 1.7 + i * Math.PI * 2 / 3, pulse = this.reducedMotion ? 1 : 1 + Math.sin(this.time * 5 + fire.id + i) * .16;
        this.dummy.position.set(fire.x + Math.sin(angle) * fire.radius * .43, .21, fire.z + Math.cos(angle) * fire.radius * .43);
        this.dummy.rotation.set(0, angle, 0); this.dummy.scale.set(fire.radius * .23, (.14 + i * .035) * pulse * fade, fire.radius * .35); this.dummy.updateMatrix(); this.fireCores.setMatrixAt(coreCount, this.dummy.matrix); this.fireCores.setColorAt(coreCount++, COLOR);
      }
    }
    this.firePools.count = this.fireRims.count = count; this.fireCores.count = coreCount;
    for (const mesh of [this.firePools, this.fireCores, this.fireRims]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }

  private effect(mode: Effect['mode'], x: number, y: number, z: number, toX: number, toY: number, toZ: number, color: number, life: number, size: number, opacity = 1) {
    const e = this.effectPool.find(p => p.life <= 0); if (!e) return;
    e.life = e.total = life; e.mode = mode; e.size = size; e.opacity = opacity; e.from.set(x, y, z); e.to.set(toX, toY, toZ); e.mesh.visible = true;
    e.mesh.geometry = mode === 'beam' || mode === 'bolt' ? geometry.cylinder : mode === 'ring' ? this.range.geometry : mode === 'slash' ? this.slashGeometry : geometry.ball;
    const material = e.mesh.material as THREE.MeshBasicMaterial; material.color.setHex(color); material.opacity = opacity;
  }
  private addEvent(event: CombatEvent) {
    const tx = event.toX ?? event.x, tz = event.toZ ?? event.z;
    if (event.type === 'shot') {
      const origin=shotOrigin(event,this.getState());
      if (event.kind === 'stasis') this.effect('ring', event.x, .19, event.z, tx, .19, tz, event.branch === 'deepfreeze' ? 0x94eafa : 0xb398ff, .75, towerStats('stasis', Math.min(3, event.size ?? 1), event.branch ?? null).range);
      else if (event.kind === 'flamer') {
        const count = this.reducedMotion ? 2 : this.quality === 'high' ? 5 : 3, spread = event.branch === 'inferno' ? 1.65 : .9;
        for (let i = 0; i < count; i++) this.effect('flame', origin.x, origin.y, origin.z, tx + (this.random(this.time + i) - .5) * spread, .5 + this.random(i + this.time), tz + (this.random(i * 3 + this.time) - .5) * spread, i % 2 ? 0xffb744 : 0xf86826, .28 + i * .04, .23 + i * .05, this.reducedMotion ? .65 : 1);
      } else if (event.kind === 'lascannon') {
        const color = event.branch === 'prism' ? 0xb6a5ff : 0x72eee5;
        this.effect('beam', origin.x, origin.y, origin.z, tx, .7, tz, color, .27, event.branch === 'lance' ? .13 : .095, this.reducedMotion ? .25 : .42);
        this.effect('beam', origin.x, origin.y, origin.z, tx, .7, tz, 0xdffff8, .18, .035, this.reducedMotion ? .7 : 1);
        this.effect('burst', tx, .65, tz, tx, .8, tz, color, .23, .23, .65);
        if (!this.reducedMotion && this.quality === 'high') this.effect('ring', tx, .22, tz, tx, .22, tz, color, .3, .7, .8);
      } else this.effect('bolt', origin.x, origin.y, origin.z, tx, .7, tz, event.branch === 'executioner' ? 0xffb265 : 0xffd88b, .13, event.branch === 'executioner' ? .085 : .055);
    } else if (event.type === 'barrage') {
      if(!this.reducedMotion){
        this.effect('beam',event.x,8,event.z,event.x,.3,event.z,0xffe5b2,.17,.085,.95);
        if(this.quality==='high')this.effect('beam',event.x,8,event.z,event.x,.3,event.z,0xffae5b,.22,.24,.25);
      }
      this.effect('ring', event.x, .25, event.z, tx, .25, tz, 0xffb771, .7, 4);
      // Small fragments complement the soft flash and smoke without hiding the lane.
      for (let i = 0; i < (this.reducedMotion ? 2 : this.quality === 'high' ? 8 : 4); i++) { const angle = i * 2.399; const r = this.random(i + this.time) * 2.4; this.effect('burst', event.x, .3, event.z, event.x + Math.sin(angle) * r, this.reducedMotion ? .4 : .5 + this.random(i) * 1.4, event.z + Math.cos(angle) * r, i % 3 ? 0x88705c : 0xffb15c, .4 + this.random(i) * .4, .1 + this.random(i) * .14, this.reducedMotion ? .45 : .8); }
    } else if (event.type === 'bosskill') {
      // Reserve space for the one-off finish, even if a barrage filled the pool with kill debris.
      for (const e of this.effectPool) if (e.mode === 'bolt' || e.mode === 'flame' || e.mode === 'beam') { e.life = 0; e.mesh.visible = false; }
      let free = this.effectPool.reduce((count, e) => count + (e.life <= 0 ? 1 : 0), 0);
      for (const e of this.effectPool) { if (free >= 27) break; if (e.life > 0) { e.life = 0; e.mesh.visible = false; free++; } }
      for (let i = 0; i < (this.reducedMotion ? 1 : 3); i++) this.effect('ring', event.x, .2 + i * .025, event.z, event.x, .2, event.z, i % 2 ? 0xd4a7ff : 0xffc489, 1.1 + i * .22, 2.4 + i * 1.1, this.reducedMotion ? .5 : .85);
      const count = this.reducedMotion ? 6 : this.quality === 'high' ? 24 : 12;
      for (let i = 0; i < count; i++) { const a = i * 2.399, r = 1 + this.random(i + this.time) * 2.2; this.effect('burst', event.x, 1, event.z, event.x + Math.sin(a) * r, this.reducedMotion ? .45 : .3 + this.random(i + 60) * 2.6, event.z + Math.cos(a) * r, i % 3 ? 0xc394ad : 0xffc99a, .8 + this.random(i) * .55, .25 + this.random(i + 20) * .28, this.reducedMotion ? .6 : 1); }
    } else if (event.type === 'armorbreak') {
      const count = this.reducedMotion ? 3 : 7;
      for (let i = 0; i < count; i++) { const a = i * 2.399; this.effect('burst', event.x, .8, event.z, event.x + Math.sin(a) * .75, .35 + this.random(i + this.time) * .8, event.z + Math.cos(a) * .75, i % 2 ? 0x94eee6 : 0xc4af94, .3 + i * .025, .09 * Math.min(2, event.size ?? 1), .8); }
    } else if (event.type === 'melee') {
      this.effect(this.reducedMotion?'beam':'slash', event.x, .64, event.z, tx, .64, tz, 0xffe6ae, .16, this.reducedMotion?.045:.78, .82);
      this.effect('burst', tx, .62, tz, tx, .82, tz, 0xffbc6b, .18, .13, .75);
    } else if (event.type === 'heal') {
      this.effect('ring', event.x, .22, event.z, event.x, .22, event.z, 0x9cf5bc, .65, Math.max(1, event.size ?? 1), .85);
      this.effect('burst', event.x, .25, event.z, event.x, 1.65, event.z, 0xc8ffe0, .55, .16, .8);
    } else if (event.type === 'hero') {
      const radius = Math.max(1.1, event.size ?? 1);
      this.effect('ring', event.x, .23, event.z, event.x, .23, event.z, 0x8eeeff, .72, radius, .9);
      if (!this.reducedMotion) for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        this.effect('burst', event.x, .35, event.z, event.x + Math.sin(angle) * radius * .65, 1.1, event.z + Math.cos(angle) * radius * .65, 0xbaf8ff, .5, .14, .78);
      }
    } else if (event.type === 'acid') {
      const radius = Math.max(1, event.size ?? 1);
      this.effect('ring', event.x, .2, event.z, event.x, .2, event.z, 0xcdf56b, .7, radius, .9);
      const count = this.reducedMotion ? 3 : 7;
      for (let i = 0; i < count; i++) {
        const angle = i * 2.399;
        this.effect('burst', event.x, .25, event.z, event.x + Math.sin(angle) * radius * .7, .45 + this.random(i + this.time) * 1.1, event.z + Math.cos(angle) * radius * .7, i % 2 ? 0xb7e45a : 0x75943f, .55, .18, .72);
      }
    } else if (event.type === 'nest') {
      this.effect('ring', event.x, .18, event.z, event.x, .18, event.z, 0xd2a5ff, .9, 1.7, .9);
      this.effect('burst', event.x, .3, event.z, event.x, 1.8, event.z, 0xaa73d9, .8, .36, .85);
    } else if (event.type === 'objective') {
      const color = event.size === 0 ? 0xff6e59 : event.size === 2 ? 0xa4f2aa : 0x8ceaf2;
      this.effect('ring', event.x, .22, event.z, event.x, .22, event.z, color, 1, event.size === 2 ? 2.5 : 1.8, .9);
      this.effect('burst', event.x, .35, event.z, event.x, event.size === 0 ? .4 : 2.1, event.z, color, .85, .28, .8);
    } else if (event.type === 'charge' || event.type === 'interrupt') {
      this.effect('ring', event.x, .24, event.z, event.x, .24, event.z, event.type === 'interrupt' ? 0x93e8ff : 0xffa044, .55, 1.5, .8);
    } else if (event.type === 'kill' || event.type === 'leak') {
      for (let i = 0; i < (this.reducedMotion ? 2 : 4); i++) { const a = i * Math.PI / 2 + this.time; this.effect('burst', event.x, .45, event.z, event.x + Math.sin(a) * .7, .25 + this.random(i) * .6, event.z + Math.cos(a) * .7, event.type === 'leak' ? 0xff734b : i % 2 ? 0x9b617b : 0xbda184, .35 + i * .05, .14 * (event.size ?? 1)); }
    } else if (event.type === 'build' || event.type === 'upgrade') this.effect('ring', event.x, .4, event.z, tx, .4, tz, 0xe5c17b, .75, 1.8);
  }
  private updateEffects(dt: number) {
    for (const e of this.effectPool) {
      if (e.life <= 0) continue; e.life -= dt;
      if (e.life <= 0) { e.mesh.visible = false; continue; }
      const t = 1 - e.life / e.total; const m = e.mesh.material as THREE.MeshBasicMaterial;
      e.mesh.quaternion.identity(); m.opacity = e.opacity * (1 - t) * (e.mode === 'flame' ? .72 : 1);
      if (e.mode === 'beam' || e.mode === 'bolt') {
        const end = this.effectEnd.copy(e.to), start = this.effectStart.copy(e.from);
        if (e.mode === 'bolt') { start.lerp(e.to, Math.min(1, t * 1.1)); end.copy(e.from).lerp(e.to, Math.min(1, t * 1.1 + .2)); }
        const direction = this.effectDirection.copy(end).sub(start); const length = direction.length(); e.mesh.position.copy(start).addScaledVector(direction, .5);
        if (length > .0001) e.mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize()); e.mesh.scale.set(e.size, Math.max(.001, length), e.size);
      } else if(e.mode==='slash'){e.mesh.position.copy(e.from).lerp(e.to,.55);e.mesh.rotation.set(-Math.PI/2,0,-Math.atan2(e.to.z-e.from.z,e.to.x-e.from.x)-Math.PI*.65+t*.9);e.mesh.scale.setScalar(e.size);}
      else if (e.mode === 'ring') { e.mesh.rotation.x = -Math.PI / 2; e.mesh.position.copy(e.from); const r = Math.max(.01, e.size * (this.reducedMotion ? .85 : t)); e.mesh.scale.set(r, r, 1); }
      else { e.mesh.position.copy(e.from).lerp(e.to, t); e.mesh.position.y += Math.sin(t * Math.PI) * (e.mode === 'burst' ? .35 : .1); const s = e.size * (e.mode === 'flame' ? .5 + t * 2 : 1 + t * .8); e.mesh.scale.set(s, s * .8, s); }
    }
  }

  pick(clientX: number, clientY: number): { pad: number | null; point: Point } | null {
    // Pointer movement can be fractional while click/contextmenu coordinates are integers.
    clientX = Math.floor(clientX); clientY = Math.floor(clientY);
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
    if (!hit || hit.x < -18.5 || hit.x > 18.5 || hit.z < -11 || hit.z > 13) return null;
    // Screen-space tolerance also catches the visible turret above its ground pivot.
    let pad: number | null = null; let closest = Infinity;
    getMap(this.getState().config.map).pads.forEach((p, i) => { const projected = this.project(p); const distance = Math.hypot(projected.x - clientX, projected.y - clientY); const worldDistance = Math.hypot(hit.x - p.x, hit.z - p.z); const tolerance = Math.max(15, this.width / (this.camera.right - this.camera.left) * 1.02); if ((worldDistance < 1.02 || distance < tolerance) && distance < closest) { pad = i; closest = distance; } });
    return { pad, point: { x: hit.x, z: hit.z } };
  }
  project(point: Point): { x: number; y: number } {
    const p = new THREE.Vector3(point.x, .35, point.z).project(this.camera); const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  }
  resetCamera(): void { this.target.set(-.3, 0, 1); this.zoomFactor = 1; this.updateCamera(); }
  resetEffects(): void {
    this.vfx.reset();
    this.commands.reset(); this.commandPreview = null; this.strikeProgress.count = 0;
    this.time = 0; this.lastElapsed = this.lastWave = -1; this.pulseTimes.clear();
    for (const effect of this.effectPool) { effect.life = 0; effect.mesh.visible = false; }
    for (const model of this.towers.values()) { model.recoil = 0; model.head.position.set(0, 0, 0); }
    for (const mesh of [this.chargeRings, this.chargeArrows, this.chargeTrails, this.firePools, this.fireCores, this.fireRims, this.telegraphs, this.shields]) mesh.count = 0;
  }
  commandFeedback(command: Command, point: Point, valid: boolean): void { this.commands.show(command, point, valid); }
  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
    this.vfx.configure(this.quality==='high',value);
    (this.shields.material as THREE.ShaderMaterial).uniforms.uMotion.value = value ? 0 : 1;
    if (value) for (const model of this.towers.values()) { model.recoil = 0; model.head.position.set(0, 0, 0); }
  }
  pan(x: number, z: number, dt: number): void { if (!x && !z) return; this.target.x = THREE.MathUtils.clamp(this.target.x + x * dt * 11, -7, 7); this.target.z = THREE.MathUtils.clamp(this.target.z + z * dt * 11, -5, 6); this.updateCamera(); }
  zoom(delta: number): void { this.zoomFactor = THREE.MathUtils.clamp(this.zoomFactor * Math.exp(-delta * .001), .8, 1.85); this.updateCamera(); }
  resize(): void { const rect = this.canvas.getBoundingClientRect(); this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height); this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 1.5 : 1)); this.renderer.setSize(this.width, this.height, false); this.updateCamera(); }
  private updateCamera() {
    this.camera.position.copy(this.target).add(this.cameraOffset); this.camera.lookAt(this.target); this.camera.updateMatrixWorld();
    const aspect = this.width / this.height;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const x of [-18.8, 18.8]) for (const z of [-11.2, 13.2]) { const p = new THREE.Vector3(x, 0, z).sub(new THREE.Vector3(-.3, 0, 1)).applyQuaternion(this.camera.quaternion.clone().invert()); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const safeHeight = Math.max(this.height * .45, this.height - 220);
    const viewHeight = Math.max((maxY - minY + 4) * this.height / safeHeight, (maxX - minX + 2) / aspect) / this.zoomFactor;
    const offset = -38 * viewHeight / this.height;
    this.camera.left = -viewHeight * aspect / 2; this.camera.right = viewHeight * aspect / 2; this.camera.top = viewHeight / 2 + offset; this.camera.bottom = -viewHeight / 2 + offset; this.camera.updateProjectionMatrix();
  }
  private updateContactShadows(state: GameState): void {
    let count = 0;
    const place = (x: number, z: number, y: number, width: number, depth: number, facing = 0) => {
      this.dummy.position.set(x, y, z); this.dummy.rotation.set(-Math.PI / 2, 0, facing);
      this.dummy.scale.set(width, depth, 1); this.dummy.updateMatrix();
      this.contactShadows.setMatrixAt(count++, this.dummy.matrix);
    };
    for (const enemy of state.enemies.slice(0, MAX_ENEMIES)) {
      const scale = ENEMIES[enemy.kind].scale;
      place(enemy.x, enemy.z, .148, scale * .75, scale * (enemy.kind === 'ravener' ? 1.15 : .95), enemy.facing);
    }
    for (const ally of [state.hero, ...state.allies].slice(0, 96)) if (ally.hp > 0) {
      const hero = ally.id === state.hero.id;
      place(ally.x, ally.z, .15, hero ? .47 : .29, hero ? .38 : .25, ally.facing);
    }
    for (const tower of state.towers.slice(0, 32)) place(tower.x, tower.z, .373, .81, .81);
    this.contactShadows.count = count; this.contactShadows.instanceMatrix.needsUpdate = true;
  }
  setQuality(quality: 'high' | 'low'): void { this.quality = quality; this.vfx.configure(quality==='high',this.reducedMotion); this.renderer.shadowMap.enabled = quality === 'high'; this.ash.visible = quality === 'high'; this.resize(); }
  get diagnostics() { return { drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, effects: this.effectPool.filter(e => e.life > 0).length, effectCapacity: this.effectPool.length, shields: this.shields.count, chargeWarnings: this.chargeRings.count, chargeTrails: this.chargeTrails.count, firePools: this.firePools.count, map: this.map.id, sceneryFans: this.terrain.scenery.fans.length, sceneryBanners: this.terrain.scenery.banners.length, sceneryTime: this.time, commandPreview: this.commandPreview ? { ...this.commandPreview, point: { ...this.commandPreview.point } } : null, strikeCountdowns: Array.from(this.countdowns.array).slice(0, this.strikeProgress.count), ...this.commands.diagnostics, ...this.tactics.diagnostics, ...this.vfx.diagnostics }; }
  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(sceneryMaterials);
    this.scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m)); } else if (o instanceof THREE.Sprite) mats.add(o.material); });
    geometries.add(this.slashGeometry);
    const textures = new Set<THREE.Texture>();
    for (const g of geometries) g.dispose();
    for (const m of mats) { const map = (m as THREE.MeshBasicMaterial).map; if (map) textures.add(map); m.dispose(); }
    for (const texture of textures) texture.dispose();
    this.lighting.dispose();
    this.renderer.dispose();
  }
}

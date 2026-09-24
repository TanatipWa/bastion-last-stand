import * as THREE from 'three';
import type { Command, Point } from '../game/types';
import type { CommandPreview } from '../game/commands';

const material = () => new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
const ringGeometry = new THREE.RingGeometry(.43, .49, 40);
const barGeometry = new THREE.PlaneGeometry(1, 1);

function marker() {
  const root = new THREE.Group(), ink = material(), ring = new THREE.Mesh(ringGeometry, ink);
  const bars = [new THREE.Mesh(barGeometry, ink), new THREE.Mesh(barGeometry, ink)];
  root.add(ring, ...bars); root.rotation.x = -Math.PI / 2; root.visible = false;
  for (const child of root.children) child.renderOrder = 8;
  return { root, ink, ring, bars, life: 0, valid: true };
}
type Marker = ReturnType<typeof marker>;

/** Small visual acknowledgements never enter saves or consume the combat-effect pool. */
export class CommandFeedback {
  readonly root = new THREE.Group();
  private cursor = marker();
  private pulses = Array.from({ length: 6 }, marker);
  private next = 0;
  private last: { command: Command; valid: boolean; point: Point } | null = null;
  constructor() { this.root.add(this.cursor.root, ...this.pulses.map(p => p.root)); }
  private pose(m: Marker, point: Point, valid: boolean) {
    m.root.position.set(point.x, .26, point.z); m.root.visible = true; m.valid = valid;
    m.ink.color.setHex(valid ? 0xa4f4de : 0xff806b);
    const segments = valid ? [[-.2, 0, -.045, -.14], [-.045, -.14, .24, .17]] : [[-.18, -.18, .18, .18], [-.18, .18, .18, -.18]];
    segments.forEach(([x1, y1, x2, y2], i) => {
      m.bars[i].position.set((x1 + x2) / 2, (y1 + y2) / 2, .002);
      m.bars[i].rotation.z = Math.atan2(y2 - y1, x2 - x1);
      m.bars[i].scale.set(Math.hypot(x2 - x1, y2 - y1), .075, 1);
    });
  }
  show(command: Command, point: Point, valid: boolean) {
    const pulse = this.pulses[this.next++ % this.pulses.length];
    this.pose(pulse, point, valid); pulse.life = 1.15;
    this.last = { command, valid, point: { ...point } };
  }
  update(preview: CommandPreview | null, raw: Point | null, dt: number, reduced: boolean) {
    this.cursor.root.visible = !!preview && !!raw;
    if (preview && raw) {
      this.pose(this.cursor, preview.valid ? preview.point : raw, preview.valid);
      this.cursor.root.scale.setScalar(.9); this.cursor.ink.opacity = .96;
    }
    for (const pulse of this.pulses) {
      pulse.life = Math.max(0, pulse.life - dt); pulse.root.visible = pulse.life > 0;
      const age = 1 - pulse.life / 1.15;
      pulse.root.scale.setScalar(reduced ? 1.1 : 1 + Math.sin(Math.min(1, age * 2) * Math.PI / 2) * .45);
      pulse.ink.opacity = Math.min(1, pulse.life / .35);
    }
  }
  reset() { for (const pulse of this.pulses) { pulse.life = 0; pulse.root.visible = false; } this.cursor.root.visible = false; this.last = null; }
  get diagnostics() { return { commandPulses: this.pulses.filter(p => p.life > 0).length, commandPulseCapacity: this.pulses.length, lastCommand: this.last ? { ...this.last, point: { ...this.last.point } } : null }; }
}

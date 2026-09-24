import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** A single bounded batch grounds miniatures, including when Low disables shadows. */
export function contactShadowBatch(capacity: number): THREE.InstancedMesh {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vUv; void main(){float r=length(vUv*2.0-1.0);float a=(1.0-smoothstep(0.12,1.0,r))*.3;gl_FragColor=vec4(.025,.035,.04,a);}',
  });
  const batch = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), material, capacity);
  batch.count = 0; batch.frustumCulled = false; batch.renderOrder = 1;
  batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return batch;
}

/** A baked studio reflection keeps small painted surfaces legible without bloom. */
export function miniatureLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  renderer.toneMappingExposure = 1.06;
  const room = new RoomEnvironment(), generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(room, .03);
  room.dispose(); generator.dispose();
  scene.environment = environment.texture; scene.environmentIntensity = .38;
  scene.environmentRotation.y = .65;
  const fill = new THREE.HemisphereLight(0xd1e2ee, 0x343331, 1.5);
  const sun = new THREE.DirectionalLight(0xffdec2, 2.9);
  sun.position.set(-12, 28, 10); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 23, bottom: -23, near: 1, far: 70 });
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0003; sun.shadow.normalBias = .04;
  const rim = new THREE.DirectionalLight(0xb0d8f1, 1.9); rim.position.set(5, 12, -20);
  scene.add(fill, sun, rim);
  return { sun, dispose() { scene.environment = null; environment.dispose(); } };
}

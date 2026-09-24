import {it,expect} from 'vitest';
import * as THREE from 'three';
import {bake,piece} from './models';
it('bakes indexed and non-indexed primitives together without losing scene structures',()=>{
 const source=new THREE.Group();piece(source,'box','stone',0,0,0,1,1,1);piece(source,'octa','stone',3,0,0,1,1,1);
 const result=bake(source),bounds=new THREE.Box3().setFromObject(result);
 expect(result.children).toHaveLength(1);expect(bounds.min.x).toBeCloseTo(-.5);expect(bounds.max.x).toBeCloseTo(4);
});

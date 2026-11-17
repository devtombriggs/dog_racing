import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MAPS } from '../shared/maps.js';
import { WENDOVER as W, woodlandWaterAt, woodlandSwimMultiplier, woodlandDogY, entersBurrow } from '../shared/wendoverData.js';

function poolPoint(pool, along, side=0) {
  const a=pool.rotationY;
  return [pool.center[0]+along*Math.sin(a)+side*Math.cos(a), pool.center[2]+along*Math.cos(a)-side*Math.sin(a)];
}

test('Wendover pools have smooth walk-in banks, deep swimming and dry exits', () => {
  assert.equal(W.pools.length,3);
  for(const pool of W.pools) {
    const middle=woodlandWaterAt(...poolPoint(pool,0));
    assert.equal(middle.swimming,true);
    for (const dog of ['gsp','second_dog','black_lab','pablo','ralph']) {
      const y=woodlandDogY(middle,dog);
      assert.ok(y>middle.groundY && y<middle.waterY-.4,'float with legs under water and clear of the bottom');
    }
    assert.ok(Math.abs(middle.depth-pool.depth)<1e-6);
    for(const direction of [-1,1]) {
      const edge=woodlandWaterAt(...poolPoint(pool,direction*(pool.halfLength-.001)));
      assert.equal(edge.inWater,false);
      assert.ok(Math.abs(edge.groundY-(direction<0?pool.startY:pool.endY))<.001);
      assert.equal(woodlandWaterAt(...poolPoint(pool,direction*(pool.halfLength+.1))),null);
      const side=woodlandWaterAt(...poolPoint(pool,0,direction*(pool.halfWidth-.001)));
      assert.equal(side.swimming,false);
    }
    let previous=null;
    for(let s=pool.sStart+1;s<pool.sEnd-1;s+=.1) {
      const p=W.pointAt(s), water=woodlandWaterAt(p.x,p.z);
      assert.ok(water,'the whole marked crossing must be supported');
      if(previous!==null) assert.ok(Math.abs(water.groundY-previous)<.1,'no steps in the basin');
      previous=water.groundY;
    }
  }
  assert.ok(woodlandSwimMultiplier(10)/woodlandSwimMultiplier(4)>2.4,'Poppy gets a substantial swimming advantage');
  assert.equal(woodlandSwimMultiplier(1),woodlandSwimMultiplier(4));
});

test('Ralph burrows require a close forward crossing at ground height', () => {
  for(const t of W.tunnels) {
    const pos=(s,side=0,y=0)=>[t.entry[0]+s*Math.sin(t.entryYaw)+side*Math.cos(t.entryYaw),t.entry[1]+y,t.entry[2]+s*Math.cos(t.entryYaw)-side*Math.sin(t.entryYaw)];
    assert.equal(entersBurrow(pos(-1),pos(1),t),true);
    assert.equal(entersBurrow(pos(1),pos(-1),t),false);
    assert.equal(entersBurrow(pos(-1,2),pos(1,2),t),false);
    assert.equal(entersBurrow(pos(-1,0,2),pos(1,0,2),t),false);
    assert.equal(entersBurrow(pos(-20),pos(20),t),false);
  }
});

test('Wendover GLB matches the swimming physics, burrow mouths and unchanged starting grid', async () => {
  const bytes=await readFile(new URL('../public/models/wendover_woods.glb',import.meta.url));
  const loader=new GLTFLoader();
  loader.register(()=>({name:'test-textures',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);
  const ground=[],obstacles=[],waters=[];
  scene.traverse(o=>{if(!o.isMesh)return; if(o.name.startsWith('Track_Surface')) ground.push(o); if(o.name.startsWith('Scenery_Rocks_Burrow')) {o.material.side=THREE.DoubleSide;obstacles.push(o);} if(o.name.startsWith('Water_'))waters.push(o);});
  const ray=new THREE.Raycaster();
  const down=(x,y,z,meshes)=>{ray.set(new THREE.Vector3(x,y,z),new THREE.Vector3(0,-1,0));return ray.intersectObjects(meshes,false)[0];};
  for(const {position:p} of MAPS.wendover.startPositions) {
    const hit=down(p[0],p[1]+5,p[2],ground);assert.ok(hit,'grid remains on track');assert.ok(Math.abs(hit.point.y-p[1])<.1);
  }
  for(const pool of W.pools) {
    assert.ok(scene.getObjectByName('Water_Swim_'+pool.id));
    for(let s=pool.sStart+2;s<pool.sEnd-2;s+=2) {
      const p=W.pointAt(s), water=woodlandWaterAt(p.x,p.z),hit=down(p.x,20,p.z,ground);
      assert.ok(hit,'pool bed must face upwards');
      assert.ok(Math.abs(hit.point.y-water.groundY)<.08,`physics and visible bed agree: ${pool.id} at ${s}`);
      if(water.swimming){ const surface=down(p.x,20,p.z,waters);assert.ok(surface);assert.ok(Math.abs(surface.point.y-water.waterY)<.06,'no old water sheet above the pool'); }
    }
  }
  for(const t of W.tunnels) {
    for(const end of ['entry','exit']) assert.ok(scene.getObjectByName(`Scenery_Rocks_Burrow_${t.id}_${end}`));
    const p=t.entry,a=t.entryYaw;
    ray.set(new THREE.Vector3(p[0]-Math.sin(a),p[1]+.35,p[2]-Math.cos(a)),new THREE.Vector3(Math.sin(a),0,Math.cos(a)));
    const hit=ray.intersectObjects(obstacles,false)[0];
    assert.ok(!hit || hit.distance>1.5,`Ralph can reach ${t.id}'s trigger`);
    const center=W.pointAt(t.exitS-4);
    ray.set(new THREE.Vector3(center.x-Math.sin(t.exitYaw)*2,center.y+.5,center.z-Math.cos(t.exitYaw)*2),new THREE.Vector3(Math.sin(t.exitYaw),0,Math.cos(t.exitYaw)));
    const road=ray.intersectObjects(obstacles,false)[0];
    assert.ok(!road || road.distance>4,'exit mouths leave the main racing line clear');
  }
});

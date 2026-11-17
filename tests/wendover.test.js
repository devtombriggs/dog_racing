import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MAPS } from '../shared/maps.js';
import { WENDOVER as W, woodlandWaterAt, woodlandPlankAt, plankTopY, woodlandSwimMultiplier, woodlandDogY, entersBurrow, woodlandBogAt, BOG_WIDTH, BOG_SPEED } from '../shared/wendoverData.js';

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
  assert.ok(woodlandSwimMultiplier(10)/woodlandSwimMultiplier(4)>2.3,'Poppy gets a substantial swimming advantage');
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

test('each pool has one really thin tightrope plank: dry on top, back in the water if you slip off', () => {
  for (const pool of W.pools) {
    const pl = pool.plank;
    assert.ok(pl && pl.halfWidth * 2 <= 0.45, 'really thin');
    const [x, z] = poolPoint(pool, 0, pl.lateral), top = plankTopY(pool, 0);
    assert.ok(top > pool.waterY, 'above the water');
    assert.equal(woodlandWaterAt(x, z, top), null, 'standing on it: dry');
    assert.equal(woodlandPlankAt(x, z, top), pool);
    const [sx, sz] = poolPoint(pool, 0, pl.lateral + pl.halfWidth + 0.05);
    assert.equal(woodlandWaterAt(sx, sz, top)?.swimming, true, 'a step off the side is a swim');
    assert.equal(woodlandWaterAt(x, z, pool.waterY - 1)?.swimming, true, 'a swimmer under it stays in the water');
    // it runs bank to bank, so a dog can get on it from dry ground at either end
    for (const end of [-1, 1]) {
      const along = end * (pool.halfLength - 0.5);
      assert.equal(woodlandWaterAt(...poolPoint(pool, along, pl.lateral), plankTopY(pool, along)), null);
    }
  }
});

test('water speed follows the swim stat: Poppy is a touch faster in the water than on land, Meela and Ralph crawl', () => {
  const poppy = woodlandSwimMultiplier(10), pippa = woodlandSwimMultiplier(6), pablo = woodlandSwimMultiplier(5), meela = woodlandSwimMultiplier(4);
  assert.ok(Math.abs(poppy - 1.05) < 1e-9, 'Poppy speeds up a little in the water: 105 % of her land speed');
  assert.ok(Math.abs(pippa - 0.62) < 0.01 && Math.abs(pablo - 0.51) < 0.01, 'the others are as they were');
  assert.ok(poppy > pippa && pippa > pablo && pablo > meela);
  assert.ok(meela < 0.5 && meela > 0.4, 'weak swimmers keep under half their speed (Meela pays for her land speed here)');
});

test('Ralph\'s burrows are off the road: he has to swerve into them, and they never block other dogs', () => {
  for (const t of W.tunnels) {
    for (const end of ['entry', 'exit']) {
      const road = W.pointAt(t[end + 'S']);
      const fromCentre = Math.hypot(t[end][0] - road.x, t[end][2] - road.z);
      assert.ok(fromCentre - road.halfWidth >= 2.5, `${t.id} ${end}: off the road`);
    }
    const road = W.pointAt(t.entryS);
    const turn = Math.abs(Math.atan2(Math.sin(t.entryYaw - road.rotationY), Math.cos(t.entryYaw - road.rotationY)));
    assert.ok(turn > 1.0, `${t.id}: running straight down the road does not take you in`);
    // a dog running along the road edge on the burrow's side passes the mouth without entering
    const L = [Math.cos(road.rotationY), -Math.sin(road.rotationY)], side = t.side === 'left' ? 1 : -1;
    const edge = d => [road.x + L[0] * side * road.halfWidth + Math.sin(road.rotationY) * d, t.entry[1], road.z + L[1] * side * road.halfWidth + Math.cos(road.rotationY) * d];
    assert.equal(entersBurrow(edge(-3), edge(3), t), false);
  }
});

test('Wendover GLB: nothing solid between the road and any burrow mouth (Ralph can swerve in and out)', async () => {
  const bytes = await readFile(new URL('../public/models/wendover_woods.glb', import.meta.url));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'test-textures', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  const solid = [];
  scene.traverse(o => {
    if (!o.isMesh) return;
    let name = ''; for (let n = o; n; n = n.parent) name += ` ${n.name}`;
    if (/(scenery[_\s-]*(trees|rocks|fences)|obstacle[_\s-]*log)/.test(name.toLowerCase())) {
      solid.push(o); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.side = THREE.DoubleSide; });
    }
  });
  const ray = new THREE.Raycaster();
  const clear = (a, b) => {
    const from = new THREE.Vector3(...a), dir = new THREE.Vector3(...b).sub(from), len = dir.length();
    ray.set(from, dir.normalize()); ray.near = 0; ray.far = len;
    return ray.intersectObjects(solid, false)[0]?.object.name ?? null;
  };
  for (const t of W.tunnels) {
    const ex = Math.sin(t.entryYaw), ez = Math.cos(t.entryYaw), y = t.entry[1] + 0.1;
    for (const h of [0.55, 1.15]) {          // the game's forward rays, above the road
      const stop = h > 1 ? 1.0 : -0.6;        // the upper ray only needs to reach the low portal
      assert.equal(clear([t.entry[0] - ex * 9, y + h, t.entry[2] - ez * 9], [t.entry[0] - ex * stop, y + h, t.entry[2] - ez * stop]), null, `${t.id}: way in`);
      const xx = Math.sin(t.exitYaw), xz = Math.cos(t.exitYaw);
      assert.equal(clear([t.exit[0], t.exit[1] + 0.1 + h, t.exit[2]], [t.exit[0] + xx * 12, t.exit[1] + 0.1 + h, t.exit[2] + xz * 12]), null, `${t.id}: way out`);
    }
  }
});

test('Wendover GLB: a walkable plank top across every pool', async () => {
  const bytes = await readFile(new URL('../public/models/wendover_woods.glb', import.meta.url));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'test-textures', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const pool of W.pools) {
    const plank = scene.getObjectByName('Track_Surface_Plank_' + pool.id);
    assert.ok(plank?.isMesh, `plank in ${pool.id}`);
    for (const along of [-pool.halfLength + 2, 0, pool.halfLength - 2]) {
      const [x, z] = poolPoint(pool, along, pool.plank.lateral);
      ray.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(plank, false)[0];
      assert.ok(hit && Math.abs(hit.point.y - plankTopY(pool, along)) < 0.05, `the game stands a dog on the plank top (${pool.id} at ${along})`);
    }
  }
});

test('the banks beside every pool are bog: no way round the water that beats swimming it', () => {
  assert.ok(BOG_SPEED < woodlandSwimMultiplier(4), 'the bog is slower than the weakest swimmer in the water');
  for (const pool of W.pools) {
    const mid = (pool.sStart + pool.sEnd) / 2, edge = pool.halfWidth;
    for (const side of [1, -1]) {
      for (const s of [pool.sStart + 3, mid, pool.sEnd - 3]) {
        for (const out of [edge + 0.5, edge + BOG_WIDTH / 2, edge + BOG_WIDTH - 0.5]) {
          const p = W.pointAt(s, side * out);
          assert.equal(woodlandBogAt(p.x, p.z)?.id, pool.id, `${pool.id}: bog ${out.toFixed(1)} m out at s=${s.toFixed(0)}`);
          assert.equal(woodlandWaterAt(p.x, p.z), null, 'bog is not water');
        }
        const beyond = W.pointAt(s, side * (edge + BOG_WIDTH + 2));
        assert.equal(woodlandBogAt(beyond.x, beyond.z), null, 'firm ground beyond the bog');
      }
    }
    // the water itself, the plank and the road before and after the pool are not bog
    for (const s of [pool.sStart - 6, mid, pool.sEnd + 6]) {
      const p = W.pointAt(s);
      assert.equal(woodlandBogAt(p.x, p.z), null);
    }
    // right round the outside of the bog at off-track speed (half) is still a slower trip than the
    // weakest swimmer's swim, even with a free running jump (13 m at full speed) to start it
    const length = pool.halfLength * 2, round = length + 2 * (pool.halfWidth + BOG_WIDTH);
    assert.ok((round - 13) / 0.5 + 13 > length / woodlandSwimMultiplier(4) * 1.2, `${pool.id}: going right round is at least a fifth slower`);
  }
});

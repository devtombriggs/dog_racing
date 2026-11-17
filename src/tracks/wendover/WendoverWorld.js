import * as THREE from 'three';
import { WENDOVER, woodlandWaterAt } from '../../../shared/wendoverData.js';

// Extra live scenery around the authored woodland: signs, flowing water, wakes,
// warm forest light, and amber markers for Ralph's four paired burrows.
export function createWendoverWorld(scene, renderer, terrain) {
  const group = new THREE.Group(); group.name = 'Wendover_Adventure'; scene.add(group);
  const resources = [], glows = [];
  const previous = { fog:scene.fog, background:scene.background, tone:renderer.toneMapping,
    exposure:renderer.toneMappingExposure, shadows:renderer.shadowMap.enabled, shadowType:renderer.shadowMap.type };
  const oldLights = scene.children.filter(o => o.isLight);
  oldLights.forEach(light => { light.visible=false; });
  scene.background=new THREE.Color(0xc5dfdb); scene.fog=new THREE.Fog(0xc5dfdb,100,620);
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.08;
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap;
  const hemi=new THREE.HemisphereLight(0xe1f3ff,0x536742,1.65);
  const sun=new THREE.DirectionalLight(0xffe6ae,3.2); sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:1,far:220});
  sun.shadow.bias=-0.0003;sun.shadow.normalBias=0.12;
  group.add(hemi,sun,sun.target);

  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'), pixels=ctx.createImageData(128,128);
  for(let y=0;y<128;y++) for(let x=0;x<128;x++) {
    const i=(y*128+x)*4, value=128+45*Math.sin(x*Math.PI/16+2*Math.sin(y*Math.PI/32))+25*Math.sin((x+y)*Math.PI/8);
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const ripple=new THREE.CanvasTexture(canvas);ripple.wrapS=ripple.wrapT=THREE.RepeatWrapping;resources.push(ripple);
  terrain.traverse(object=>{
    if(!object.isMesh) return;
    const name=object.name.toLowerCase();
    object.receiveShadow=true;
    object.castShadow=/trees|rocks|bridge|obstacle|gantry/.test(name);
    if(!name.includes('water')) return;
    const position=object.geometry.getAttribute('position'), uv=new Float32Array(position.count*2), point=new THREE.Vector3();
    for(let i=0;i<position.count;i++) {
      point.fromBufferAttribute(position,i);object.localToWorld(point);uv[i*2]=point.x*0.11;uv[i*2+1]=point.z*0.11;
    }
    object.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    const mat=new THREE.MeshStandardMaterial({color:0x438e8b,transparent:true,opacity:0.88,
      roughness:0.22,metalness:0.1,bumpMap:ripple,bumpScale:0.1,side:THREE.DoubleSide,depthWrite:false});
    object.material=mat;object.renderOrder=2;resources.push(mat);
  });

  function sign(position,yaw,title,subtitle,color='#ffc478',width=5.6) {
    const c=document.createElement('canvas');c.width=768;c.height=256;const g=c.getContext('2d');
    g.fillStyle='#263d32';g.fillRect(0,0,768,256);g.strokeStyle=color;g.lineWidth=10;g.strokeRect(10,10,748,236);
    g.textAlign='center';g.fillStyle='#f6f4db';g.font='bold 49px sans-serif';g.fillText(title.toUpperCase(),384,102);
    g.fillStyle=color;g.font='bold 33px sans-serif';g.fillText(subtitle,384,177);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    const geo=new THREE.PlaneGeometry(width,width/3),mat=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(...position);mesh.position.y+=3;mesh.rotation.y=yaw+Math.PI;group.add(mesh);
    const postGeo=new THREE.CylinderGeometry(.1,.14,3.2,7),postMat=new THREE.MeshStandardMaterial({color:0x785b3b,roughness:1});
    const post=new THREE.Mesh(postGeo,postMat);post.position.set(...position);post.position.y+=1.5;post.castShadow=true;group.add(post);
    resources.push(texture,geo,mat,postGeo,postMat);
  }
  const amber=new THREE.MeshBasicMaterial({color:0xffc36a,toneMapped:false,transparent:true,opacity:.9});
  const archGeo=new THREE.TorusGeometry(1,0.065,6,32,Math.PI);
  resources.push(amber,archGeo);
  for(const tunnel of WENDOVER.tunnels) {
    const side=tunnel.entry[0]-WENDOVER.pointAt(tunnel.entryS).x;
    const p=WENDOVER.pointAt(tunnel.entryS-14,side>0?8:-8);
    sign([p.x,p.y,p.z],p.rotationY,tunnel.name,'RALPH ONLY  »');
    for(const end of ['entry','exit']) {
      const yaw=tunnel[end+'Yaw'], pos=tunnel[end], holder=new THREE.Group();
      holder.position.set(...pos);holder.rotation.y=yaw;
      if(end==='exit') holder.translateZ(-4);
      const arch=new THREE.Mesh(archGeo,amber);arch.scale.set(1.22,.62,1);arch.position.y=.5;holder.add(arch);
      const arrowGeo=new THREE.ConeGeometry(.28,.8,3).rotateX(Math.PI/2);
      for(let i=1;i<=3;i++) {const a=new THREE.Mesh(arrowGeo,amber);a.position.set(0,.05,-i*1.8);a.scale.y=.12;holder.add(a);}
      group.add(holder);glows.push(arch);resources.push(arrowGeo);
    }
  }
  const buoyGeo=new THREE.SphereGeometry(.23,10,6),buoyMat=new THREE.MeshStandardMaterial({color:0xffd67e,roughness:.5});
  resources.push(buoyGeo,buoyMat);
  for(const pool of WENDOVER.pools) {
    const p=WENDOVER.pointAt(pool.sStart-14,-8);
    sign([p.x,p.y,p.z],p.rotationY,pool.name,'SWIM ZONE  ·  POPPY’S SPECIALITY','#9de5df',6.2);
    for(let s=pool.sStart+10;s<pool.sEnd-8;s+=9) for(const side of [-1,1]) {
      const q=WENDOVER.pointAt(s,side*5.8), buoy=new THREE.Mesh(buoyGeo,buoyMat);
      buoy.position.set(q.x,pool.waterY+.16,q.z);group.add(buoy);
    }
  }
  sign([-9,0,-10],Math.PI/2,'Wendover Woods','BURROWS · BROOKS · BLUEBELLS','#b9df90',7.5);

  // Reusable surface rings under each swimmer; no per-frame allocation of GPU resources.
  const wakeGeo=new THREE.RingGeometry(.55,.63,28).rotateX(-Math.PI/2);
  const wakeMat=new THREE.MeshBasicMaterial({color:0xe2ffff,transparent:true,opacity:.4,depthWrite:false,side:THREE.DoubleSide});
  const wakes=Array.from({length:10},()=>{const m=new THREE.Mesh(wakeGeo,wakeMat);m.visible=false;m.renderOrder=3;group.add(m);return m;});
  resources.push(wakeGeo,wakeMat);
  const motesGeo=new THREE.BufferGeometry(),motesPos=[];
  for(let i=0;i<120;i++) { const p=WENDOVER.pointAt((i*.618%1)*WENDOVER.length,Math.sin(i*2.7)*8);motesPos.push(p.x,p.y+1+(i%11)*.22,p.z); }
  motesGeo.setAttribute('position',new THREE.Float32BufferAttribute(motesPos,3));
  const motesMat=new THREE.PointsMaterial({color:0xffebaa,size:.09,transparent:true,opacity:.6,depthWrite:false});
  const motes=new THREE.Points(motesGeo,motesMat);group.add(motes);resources.push(motesGeo,motesMat);
  return {
    update(t,focus,swimmers=[]) {
      if(focus){sun.target.position.copy(focus);sun.position.copy(focus).add(new THREE.Vector3(-55,100,35));}
      ripple.offset.set(t*.016,t*.009);motes.position.y=Math.sin(t*.3)*.12;
      glows.forEach((g,i)=>g.scale.z=1+.08*Math.sin(t*4+i));
      wakes.forEach(w=>w.visible=false);
      swimmers.slice(0,5).forEach((p,i)=>{
        const water=woodlandWaterAt(p.x,p.z,p.y);if(!water?.swimming || Math.abs(p.y-water.waterY)>2) return;
        for(let k=0;k<2;k++){const w=wakes[i*2+k],phase=(t*1.5+k*.5)%1;w.visible=true;w.position.set(p.x,water.waterY+.025,p.z);w.scale.setScalar(.8+phase*1.7);}
      });
    },
    dispose() {
      scene.remove(group);resources.forEach(r=>r.dispose());sun.shadow.map?.dispose();
      oldLights.forEach(light=>{light.visible=true;});
      scene.fog=previous.fog;scene.background=previous.background;renderer.toneMapping=previous.tone;
      renderer.toneMappingExposure=previous.exposure;renderer.shadowMap.enabled=previous.shadows;renderer.shadowMap.type=previous.shadowType;
    }
  };
}

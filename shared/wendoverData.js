import features from './wendoverFeatures.json' with { type: 'json' };
import pathData from './wendoverPath.json' with { type: 'json' };
import { polylinePath } from './polylinePath.js';

const path = polylinePath(pathData.points, pathData.halfWidth);
export const WENDOVER = { ...path, ...features };
const smooth = x => { const t = Math.max(0, Math.min(1,x)); return t*t*(3-2*t); };

// The Blender build uses this same basin profile. Water is a racing surface, so
// swimming never starts the off-track rescue timer.
export function woodlandWaterAt(x,z) {
  for (const pool of WENDOVER.pools) {
    const dx=x-pool.center[0], dz=z-pool.center[2];
    const sin=Math.sin(pool.rotationY), cos=Math.cos(pool.rotationY);
    const along=dx*sin+dz*cos, side=dx*cos-dz*sin;
    if (Math.abs(along)>pool.halfLength || Math.abs(side)>pool.halfWidth) continue;
    const t=(along+pool.halfLength)/(2*pool.halfLength);
    const original=pool.startY+(pool.endY-pool.startY)*t;
    const blend=smooth((pool.halfLength-Math.abs(along))/pool.bank)
      * smooth((pool.halfWidth-Math.abs(side))/2);
    const groundY=original+(pool.waterY-pool.depth-original)*blend;
    const depth=Math.max(0,pool.waterY-groundY);
    return { pool, groundY, waterY:pool.waterY, depth, inWater:depth>0.08, swimming:depth>0.35 };
  }
  return null;
}

export function woodlandSwimMultiplier(swimming=4) {
  return 0.38+0.57*Math.max(0,Math.min(1,(swimming-4)/6));
}

export function entersBurrow(previous,current,tunnel) {
  const sin=Math.sin(tunnel.entryYaw), cos=Math.cos(tunnel.entryYaw);
  const project = p => (p[0]-tunnel.entry[0])*sin+(p[2]-tunnel.entry[2])*cos;
  const before=project(previous), after=project(current);
  if(before>=0 || after<0 || after-before>8) return false;
  const t=-before/(after-before);
  const x=previous[0]+(current[0]-previous[0])*t-tunnel.entry[0];
  const z=previous[2]+(current[2]-previous[2])*t-tunnel.entry[2];
  const y=previous[1]+(current[1]-previous[1])*t-tunnel.entry[1];
  return Math.abs(x*cos-z*sin)<tunnel.halfWidth && y>-0.6 && y<0.7;
}

// Find the checkpoint's distance round the lap, including the finish seam.
export function woodlandDistanceAt(x,z) {
  let best=0, distance=Infinity;
  for(let s=0;s<path.length;s+=1) {
    const p=path.pointAt(s), d=(p.x-x)**2+(p.z-z)**2;
    if(d<distance){distance=d;best=s;}
  }
  return best;
}

// Water reaches just below each model's shoulders; size alone does not describe
// a dachshund's short legs or a greyhound's long ones.
export function woodlandDogY(water, dogId) {
  const draft = { gsp: 1.3, second_dog: 1.65, black_lab: 1.3, pablo: 0.9, ralph: 0.42 }[dogId] ?? 1.3;
  return water.swimming ? Math.max(water.groundY, water.waterY - draft) : water.groundY;
}

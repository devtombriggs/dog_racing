import features from './wendoverFeatures.json' with { type: 'json' };
import pathData from './wendoverPath.json' with { type: 'json' };
import { polylinePath } from './polylinePath.js';

const path = polylinePath(pathData.points, pathData.halfWidth);
export const WENDOVER = { ...path, ...features };
const smooth = x => { const t = Math.max(0, Math.min(1,x)); return t*t*(3-2*t); };

function poolLocal(pool,x,z) {
  const dx=x-pool.center[0], dz=z-pool.center[2];
  const sin=Math.sin(pool.rotationY), cos=Math.cos(pool.rotationY);
  return { along:dx*sin+dz*cos, side:dx*cos-dz*sin };
}

// Each pool has one tightrope plank across it, just above the water: really thin, so it is hard
// to stay on, but a dog that does crosses dry at full running speed.  Its top follows the old
// ground line at the banks and sits `rise` above the water in between (the Blender build uses this).
export function plankTopY(pool,along) {
  const t=(along+pool.halfLength)/(2*pool.halfLength);
  return Math.max(pool.waterY+pool.plank.rise, pool.startY+(pool.endY-pool.startY)*t);
}

/** The pool whose plank a dog at (x, y, z) is standing on, or null.  Without a height, nobody is. */
export function woodlandPlankAt(x,z,y=null) {
  if (y===null) return null;
  for (const pool of WENDOVER.pools) {
    if (!pool.plank) continue;
    const { along, side }=poolLocal(pool,x,z);
    if (Math.abs(along)>pool.halfLength+pool.plank.bankRun || Math.abs(side-pool.plank.lateral)>pool.plank.halfWidth) continue;
    if (y>=plankTopY(pool,along)-0.5) return pool;     // a swimmer below it stays in the water
  }
  return null;
}

// The Blender build uses this same basin profile. Water is a racing surface, so
// swimming never starts the off-track rescue timer.  Pass the dog's height (y) so a dog up on a
// tightrope plank is dry; a dog that slips off it drops into the water.
export function woodlandWaterAt(x,z,y=null) {
  if (woodlandPlankAt(x,z,y)) return null;
  for (const pool of WENDOVER.pools) {
    const { along, side }=poolLocal(pool,x,z);
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

// The banks beside each pool are bog: reeds and deep mud, slower going than the worst swimmer's
// swim, so the water cannot be dodged by running (or hopping) round the side of it.  The ways
// across are the swim and the tightrope plank.  BOG_WIDTH is how far the bog reaches from the
// water's edge on each side; going out round that as well is a longer, slower trip than swimming.
export const BOG_WIDTH = 14;
export const BOG_SPEED = 0.3;          // share of top speed in the bog (the weakest swimmers keep 0.45 in the water)

/** The pool whose boggy bank (x, z) is on, or null. */
export function woodlandBogAt(x,z) {
  for (const pool of WENDOVER.pools) {
    const { along, side }=poolLocal(pool,x,z);
    if (Math.abs(along)<=pool.halfLength && Math.abs(side)>pool.halfWidth && Math.abs(side)<=pool.halfWidth+BOG_WIDTH) return pool;
  }
  return null;
}

// Share of a dog's own top speed it keeps in the water, from its swim stat: Poppy (10) is not slowed
// at all, and is never quicker than she is on land; the weak swimmers (Meela and Ralph, 4) crawl at under half.
//   10 -> 1   6 -> 0.62   5 -> 0.51   4 -> 0.45
// The best a swimmer can do is SWIM_BEST: Poppy was 1.35, then 1.05, and still ran away with every pool.
const SWIM_BEST=1;
export function woodlandSwimMultiplier(swimming=4) {
  const skill=Math.max(0,Math.min(1,(swimming-4)/6));
  return Math.min(SWIM_BEST,0.45+0.9*skill**1.5);
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
  return Math.abs(x*cos-z*sin)<tunnel.halfWidth && y>-(tunnel.below??0.6) && y<(tunnel.above??0.7);
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
  const draft = { gsp: 1.3, second_dog: 1.65, black_lab: 1.3, pablo: 0.9, ralph: 0.42, kombu: 1.2, rocky: 1.25, enzo: 1.5, baz_naz: 0.7, jazz: 1.9 }[dogId] ?? 1.3;
  return water.swimming ? Math.max(water.groundY, water.waterY - draft) : water.groundY;
}

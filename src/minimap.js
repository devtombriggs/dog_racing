// The course map in the corner of the race screen: the whole lap seen from above, with a dot for every dog.
// It works for every course: the outline is the racing line the pickups and the wrong-way check already
// use (shared/pickupSpots.js), so a new course gets its map for free.
//
//   const minimap = createMinimap({ canvas, mapId, marks });   // marks: distances round the lap to flag (Modbury's broken bridges)
//   each frame: minimap.draw([{ x, z, color, rotation, me }]); // rotation: the way the dog faces (your own dog gets an arrow)
//
// North is fixed (the map does not turn with you): +X to the right, +Z down the screen.
import { PICKUP_PATHS } from '../shared/pickupSpots.js';

const SIZE = 230, PAD = 16;                  // CSS pixels: the panel is SIZE wide, as tall as the course needs

export function createMinimap({ canvas, mapId, marks = [] }) {
  const path = PICKUP_PATHS[mapId];
  if (!canvas || !path) return { draw() {}, dispose() {} };

  // the lap, sampled every few metres
  const count = Math.max(120, Math.min(900, Math.round(path.length / 4)));
  const line = Array.from({ length: count }, (_, i) => path.pointAt(i / count * path.length));
  const minX = Math.min(...line.map(p => p.x)), maxX = Math.max(...line.map(p => p.x));
  const minZ = Math.min(...line.map(p => p.z)), maxZ = Math.max(...line.map(p => p.z));
  // fit the course in the panel: a long thin course gets a short panel rather than a tiny drawing
  const scale = (SIZE - PAD * 2) / Math.max(maxX - minX, maxZ - minZ, 1);
  const width = Math.max(90, (maxX - minX) * scale + PAD * 2), height = Math.max(90, (maxZ - minZ) * scale + PAD * 2);
  const ox = (width - (maxX - minX) * scale) / 2, oz = (height - (maxZ - minZ) * scale) / 2;
  const toMap = (x, z) => [ox + (x - minX) * scale, oz + (z - minZ) * scale];

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  const g = canvas.getContext('2d');

  // the panel and the course never change: drawn once
  const base = document.createElement('canvas'); base.width = canvas.width; base.height = canvas.height;
  const b = base.getContext('2d');
  b.scale(dpr, dpr);
  b.fillStyle = 'rgba(12, 26, 18, 0.72)';
  b.beginPath(); b.roundRect(0, 0, width, height, 12); b.fill();
  b.strokeStyle = 'rgba(255, 255, 255, 0.22)'; b.lineWidth = 1; b.stroke();
  const trace = () => { b.beginPath(); line.forEach((p, i) => { const [x, y] = toMap(p.x, p.z); if (i) b.lineTo(x, y); else b.moveTo(x, y); }); b.closePath(); };
  b.lineJoin = b.lineCap = 'round';
  trace(); b.strokeStyle = 'rgba(0, 0, 0, 0.55)'; b.lineWidth = 7; b.stroke();
  trace(); b.strokeStyle = '#e9f3ea'; b.lineWidth = 3.5; b.stroke();
  // little red ticks across the course where there is something to jump
  for (const s of marks) {
    const p = path.pointAt(s), [x, y] = toMap(p.x, p.z), nx = Math.cos(p.rotationY), nz = -Math.sin(p.rotationY);
    b.beginPath(); b.moveTo(x - nx * 5, y - nz * 5); b.lineTo(x + nx * 5, y + nz * 5);
    b.strokeStyle = '#ff5a4d'; b.lineWidth = 3; b.stroke();
  }
  // the start/finish line: a black-and-white tick across the course
  {
    const p = path.pointAt(0), [x, y] = toMap(p.x, p.z), nx = Math.cos(p.rotationY), nz = -Math.sin(p.rotationY);
    b.beginPath(); b.moveTo(x - nx * 7, y - nz * 7); b.lineTo(x + nx * 7, y + nz * 7);
    b.strokeStyle = '#111'; b.lineWidth = 5; b.stroke();
    b.setLineDash([3, 3]); b.strokeStyle = '#fff'; b.lineWidth = 3; b.stroke(); b.setLineDash([]);
  }

  return {
    draw(dogs) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.drawImage(base, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // the others first, your own dog on top
      for (const dog of [...dogs].sort((a, c) => Number(Boolean(a.me)) - Number(Boolean(c.me)))) {
        const [x, y] = toMap(dog.x, dog.z);
        const cx = Math.max(5, Math.min(width - 5, x)), cy = Math.max(5, Math.min(height - 5, y));   // a dog off the edge stays on the rim
        if (dog.me) {
          // an arrow the way you are facing
          const fx = Math.sin(dog.rotation ?? 0), fz = Math.cos(dog.rotation ?? 0);
          g.beginPath();
          g.moveTo(cx + fx * 11, cy + fz * 11);
          g.lineTo(cx - fx * 5 + fz * 7, cy - fz * 5 - fx * 7);
          g.lineTo(cx - fx * 5 - fz * 7, cy - fz * 5 + fx * 7);
          g.closePath();
          g.fillStyle = dog.color; g.fill();
          g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
        } else {
          g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2);
          g.fillStyle = dog.color; g.fill();
          g.strokeStyle = 'rgba(0, 0, 0, 0.7)'; g.lineWidth = 1.5; g.stroke();
        }
      }
    },
    dispose() { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height); },
  };
}

// ---------------------------------
// DOGS BUMPING INTO EACH OTHER
// ---------------------------------
// Each player's game moves only its own dog, so each game works out the
// knocks its own dog takes from where it last saw the others.

export const CONTACT = {
  radius: 0.7,        // a dog is two circles this size, one over the shoulders, one over the hips
  spacing: 0.75,      // how far ahead of and behind its middle those circles sit
  bounce: 0.4,        // how much harder than a dead stop a hit throws a dog
  fade: 4,            // how quickly a knock dies away: higher = shorter shove
  maxKnock: 14,       // fastest a knock can throw a dog
  clearHeight: 1.7,   // jump this far above a dog (times its size) and you pass over it
  staleAfter: 0.3     // seconds without news before another dog counts as standing still
};

// Heavier dogs shove lighter ones further: a dog's weight follows its size
export function dogMass(config) {
  return Math.pow(config?.size ?? 1, 1.5);
}

// The deepest overlap between two dogs seen from above, as the direction
// to push dog A (x, z) and how far, or null if they are not touching
export function dogOverlap(positionA, yawA, sizeA, positionB, yawB, sizeB) {
  const reach = CONTACT.radius * (sizeA + sizeB);
  let best = null;

  for (const a of [-1, 1]) {
    const ax = positionA.x + Math.sin(yawA) * CONTACT.spacing * sizeA * a;
    const az = positionA.z + Math.cos(yawA) * CONTACT.spacing * sizeA * a;

    for (const b of [-1, 1]) {
      const x = ax - (positionB.x + Math.sin(yawB) * CONTACT.spacing * sizeB * b);
      const z = az - (positionB.z + Math.cos(yawB) * CONTACT.spacing * sizeB * b);
      const distance = Math.hypot(x, z);
      const depth = reach - distance;

      if (depth > 0 && (!best || depth > best.depth)) {
        best = distance > 1e-4
          ? { x: x / distance, z: z / distance, depth }
          : { x: Math.cos(yawA), z: -Math.sin(yawA), depth };
      }
    }
  }

  return best;
}

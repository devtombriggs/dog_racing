// Moving about a menu with a controller: which thing is "the next one over" from where the highlight is.
// No page in here (the page side is menuPad.js), so the tests can run it.
//
//   pickInDirection(from, boxes, direction) -> index into boxes, or -1
//     from, boxes[n]: { x, y, width, height } (as getBoundingClientRect gives)
//     direction: 'up' | 'down' | 'left' | 'right'
//
// The next one is the nearest box that lies that way.  Distance across the way counts double, so that
// "right" from a tile is the tile beside it and not one a row up; a box that overlaps the row or column
// the highlight is in counts as dead ahead.
const WAYS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function pickInDirection(from, boxes, direction) {
  const [dx, dy] = WAYS[direction] ?? [0, 0];
  if (!dx && !dy) return -1;
  const centre = box => [box.x + box.width / 2, box.y + box.height / 2];
  const [fx, fy] = centre(from);
  let best = -1, bestScore = Infinity;
  boxes.forEach((box, index) => {
    const [cx, cy] = centre(box);
    const along = (cx - fx) * dx + (cy - fy) * dy;
    if (along < 4) return;                                   // not that way (or the same thing)
    // how far to the side: nothing, if the two overlap across the way
    const gap = dx
      ? Math.max(0, Math.max(box.y, from.y) - Math.min(box.y + box.height, from.y + from.height))
      : Math.max(0, Math.max(box.x, from.x) - Math.min(box.x + box.width, from.x + from.width));
    const off = dx ? Math.abs(cy - fy) : Math.abs(cx - fx);
    const score = along + gap * 2 + off * 0.3;
    if (score < bestScore) { bestScore = score; best = index; }
  });
  return best;
}

// A held direction: goes once, waits, then repeats
export const REPEAT = { firstMs: 380, thenMs: 140 };

/** The direction a controller is asking for: the D-pad, or the left stick pushed most of the way. */
export function padDirection(gamepad) {
  const down = index => Boolean(gamepad?.buttons?.[index]?.pressed);
  if (down(12)) return 'up';
  if (down(13)) return 'down';
  if (down(14)) return 'left';
  if (down(15)) return 'right';
  const x = gamepad?.axes?.[0] ?? 0, y = gamepad?.axes?.[1] ?? 0;
  if (Math.max(Math.abs(x), Math.abs(y)) < 0.6) return null;
  return Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
}

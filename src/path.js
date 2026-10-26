// A*-Wegfindung auf dem Kachelraster (8 Richtungen, keine Ecken schneiden).

let size = 0;
let gScore, cameFrom, stamp, closed;
let generation = 0;

function ensure(n) {
  if (n === size) return;
  size = n;
  gScore = new Float32Array(n);
  cameFrom = new Int32Array(n);
  stamp = new Uint32Array(n);
  closed = new Uint32Array(n);
  generation = 0;
}

class Heap {
  constructor() {
    this.items = [];
    this.prio = [];
  }
  push(item, p) {
    const a = this.items, q = this.prio;
    let i = a.length;
    a.push(item);
    q.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (q[parent] <= p) break;
      a[i] = a[parent];
      q[i] = q[parent];
      i = parent;
    }
    a[i] = item;
    q[i] = p;
  }
  pop() {
    const a = this.items, q = this.prio;
    const top = a[0];
    const lastItem = a.pop(), lastP = q.pop();
    if (a.length) {
      let i = 0;
      const n = a.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && q[c + 1] < q[c]) c++;
        if (q[c] >= lastP) break;
        a[i] = a[c];
        q[i] = q[c];
        i = c;
      }
      a[i] = lastItem;
      q[i] = lastP;
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

// Liefert eine Liste von [x, y] ohne Startfeld, oder null, wenn kein Weg existiert.
export function findPath(map, sx, sy, tx, ty) {
  if (!map.walkable(tx, ty) || !map.inside(sx, sy)) return null;
  if (sx === tx && sy === ty) return [];
  ensure(map.w * map.h);
  generation++;
  const w = map.w;
  const start = sy * w + sx, goal = ty * w + tx;
  const heap = new Heap();
  gScore[start] = 0;
  stamp[start] = generation;
  cameFrom[start] = -1;
  const h = (x, y) => {
    const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  heap.push(start, h(sx, sy));
  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur] === generation) continue;
    closed[cur] = generation;
    const cx = cur % w, cy = (cur / w) | 0;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!map.walkable(nx, ny)) continue;
      if (dx && dy && (!map.walkable(cx + dx, cy) || !map.walkable(cx, cy + dy))) continue;
      const ni = ny * w + nx;
      if (closed[ni] === generation) continue;
      const g = gScore[cur] + cost;
      if (stamp[ni] !== generation || g < gScore[ni]) {
        stamp[ni] = generation;
        gScore[ni] = g;
        cameFrom[ni] = cur;
        heap.push(ni, g + h(nx, ny));
      }
    }
  }
  if (stamp[goal] !== generation) return null;
  const path = [];
  for (let c = goal; c !== start; c = cameFrom[c]) path.push([c % w, (c / w) | 0]);
  return path.reverse();
}

// Kartendaten und prozedurale Kartenerzeugung.
import { TERRAIN, OBJ } from './config.js';
import { makeRng, fbm } from './rng.js';

export class GameMap {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.terrain = new Uint8Array(n);
    this.obj = new Uint8Array(n);
    this.objAmount = new Uint8Array(n); // Felsgröße
    this.objTime = new Float32Array(n); // Pflanzzeitpunkt von Setzling/Feld
    this.fish = new Uint8Array(n); // Fische im Wasserfeld
    this.elev = new Float32Array(n); // Geländehöhe, nur für die Optik (Relief-Schattierung)
    this.owner = new Int8Array(n).fill(-1);
    this.building = new Int32Array(n).fill(-1);
  }

  idx(x, y) {
    return y * this.w + x;
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  walkable(x, y) {
    return this.inside(x, y) && this.terrain[this.idx(x, y)] !== TERRAIN.WASSER;
  }

  // Landfeld direkt neben Wasser, an dem ein Fischer angeln kann. Liefert Index des Wasserfelds.
  fishingWater(x, y) {
    let best = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!this.inside(nx, ny)) continue;
        const i = this.idx(nx, ny);
        if (this.terrain[i] === TERRAIN.WASSER && this.fish[i] > 0 && (best < 0 || this.fish[i] > this.fish[best])) best = i;
      }
    }
    return best;
  }
}

function blob(map, rng, cx, cy, r, fn) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!map.inside(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d <= 1 && rng() > d * d * 0.8) fn(map.idx(x, y), x, y);
    }
  }
}

function countAround(map, cx, cy, r, test) {
  let n = 0;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (map.inside(x, y) && test(map.idx(x, y))) n++;
    }
  }
  return n;
}

export function generateMap(seed, w, h, playerCount) {
  const rng = makeRng(seed);
  const map = new GameMap(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = map.idx(x, y);
      // Ränder etwas absenken, damit die Karte von Wasser umgeben ist.
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      const fall = edge < 6 ? (6 - edge) * 0.06 : 0;
      const height = fbm(x / 22, y / 22, seed) - fall;
      let t = TERRAIN.GRAS;
      if (height < 0.3) t = TERRAIN.WASSER;
      else if (height < 0.335) t = TERRAIN.SAND;
      else if (height > 0.7) t = TERRAIN.BERG;
      map.terrain[i] = t;
    }
  }

  // Startpositionen gleichmäßig auf einer Ellipse um die Kartenmitte.
  const starts = [];
  const angle0 = rng() * Math.PI * 2;
  for (let p = 0; p < playerCount; p++) {
    const a = angle0 + (p / playerCount) * Math.PI * 2;
    const cx = Math.round(w / 2 + Math.cos(a) * w * 0.3);
    const cy = Math.round(h / 2 + Math.sin(a) * h * 0.3);
    starts.push({ x: cx, y: cy });
  }

  for (const s of starts) {
    // Startgebiet: Grasland mit Bergen, Wald, Felsen und einem Teich in Reichweite.
    blob(map, rng, s.x, s.y, 7, (i) => (map.terrain[i] = TERRAIN.GRAS));
    for (let y = s.y - 4; y <= s.y + 4; y++) {
      for (let x = s.x - 4; x <= s.x + 4; x++) {
        if (map.inside(x, y)) map.terrain[map.idx(x, y)] = TERRAIN.GRAS;
      }
    }
    const ma = rng() * Math.PI * 2;
    const mx = Math.round(s.x + Math.cos(ma) * 7), my = Math.round(s.y + Math.sin(ma) * 7);
    blob(map, rng, mx, my, 3, (i) => (map.terrain[i] = TERRAIN.BERG));
    if (countAround(map, s.x, s.y, 12, (i) => map.terrain[i] === TERRAIN.WASSER) < 6) {
      const wa = ma + Math.PI * (0.8 + rng() * 0.4);
      const wx = Math.round(s.x + Math.cos(wa) * 8), wy = Math.round(s.y + Math.sin(wa) * 8);
      blob(map, rng, wx, wy, 3, (i) => (map.terrain[i] = TERRAIN.WASSER));
    }
  }

  // Wälder und Felsen.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = map.idx(x, y);
      if (map.terrain[i] !== TERRAIN.GRAS) continue;
      const wood = fbm(x / 9 + 50, y / 9 + 50, seed + 7, 3);
      if (wood > 0.56 && rng() < 0.7) map.obj[i] = OBJ.BAUM;
      else if (rng() < 0.012) map.obj[i] = OBJ.BAUM;
      else if (rng() < 0.006) {
        map.obj[i] = OBJ.FELS;
        map.objAmount[i] = 2 + rng.int(4);
      }
    }
  }
  // Felsen bevorzugt am Gebirgsrand.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = map.idx(x, y);
      if (map.terrain[i] !== TERRAIN.GRAS || map.obj[i]) continue;
      if (countAround(map, x, y, 1, (j) => map.terrain[j] === TERRAIN.BERG) > 0 && rng() < 0.3) {
        map.obj[i] = OBJ.FELS;
        map.objAmount[i] = 3 + rng.int(4);
      }
    }
  }

  for (const s of starts) {
    const fa = rng() * Math.PI * 2;
    blob(map, rng, Math.round(s.x + Math.cos(fa) * 6), Math.round(s.y + Math.sin(fa) * 6), 3, (i) => {
      if (map.terrain[i] === TERRAIN.GRAS) map.obj[i] = OBJ.BAUM;
    });
    const ra = fa + Math.PI * (0.6 + rng() * 0.8);
    blob(map, rng, Math.round(s.x + Math.cos(ra) * 5), Math.round(s.y + Math.sin(ra) * 5), 2, (i) => {
      if (map.terrain[i] === TERRAIN.GRAS) {
        map.obj[i] = OBJ.FELS;
        map.objAmount[i] = 4 + rng.int(3);
      }
    });
    // Platz ums Hauptquartier freiräumen.
    for (let y = s.y - 2; y <= s.y + 2; y++) {
      for (let x = s.x - 2; x <= s.x + 2; x++) map.obj[map.idx(x, y)] = OBJ.NONE;
    }
  }

  for (let i = 0; i < w * h; i++) {
    if (map.terrain[i] === TERRAIN.WASSER) map.fish[i] = 2 + rng.int(3);
  }

  computeElevation(map, seed);
  return { map, starts };
}

// Höhenrelief passend zum Gelände: Täler am Wasser, sanfte Hügel im Grasland, schroffe Berge.
function computeElevation(map, seed) {
  const { w, h } = map;
  const e = map.elev;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = map.idx(x, y);
      const n = fbm(x / 6 + 200, y / 6 + 200, seed + 31, 3);
      switch (map.terrain[i]) {
        case TERRAIN.WASSER: e[i] = 0.05; break;
        case TERRAIN.SAND: e[i] = 0.22; break;
        case TERRAIN.GRAS: e[i] = 0.3 + n * 0.45; break;
        default: e[i] = 0.9 + fbm(x / 2.5, y / 2.5, seed + 47, 2) * 1.1;
      }
    }
  }
  const tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!map.inside(x + dx, y + dy)) continue;
            sum += e[map.idx(x + dx, y + dy)];
            cnt++;
          }
        }
        const i = map.idx(x, y);
        // Berge nur leicht glätten, damit sie kantig bleiben.
        tmp[i] = map.terrain[i] === TERRAIN.BERG ? e[i] * 0.6 + (sum / cnt) * 0.4 : sum / cnt;
      }
    }
    e.set(tmp);
  }
}

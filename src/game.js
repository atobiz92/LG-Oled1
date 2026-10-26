// Spiellogik ohne DOM: Wirtschaft, Einheiten, Gebiet und Kampf.
// Läuft im Browser und unter Node (für Tests).
import {
  BUILDINGS, FACTIONS, OBJ, TERRAIN, PLAYER_COLORS, START_LAGER, START_TRAEGER,
  START_SOLDATEN, BAUM_WACHSTUM, FELD_WACHSTUM, MAX_AUSGANG, EINGANG_ZIEL, MAP_W, MAP_H,
} from './config.js';
import { generateMap } from './map.js';
import { findPath } from './path.js';
import { makeRng } from './rng.js';

const TRAEGER_SPEED = 2.3;
const SOLDAT_SPEED = 2.1;

function sumOut(b) {
  let n = 0;
  for (const g in b.out) n += b.out[g];
  return n;
}

export class Game {
  constructor({ seed = 1, factions = ['roemer', 'amazonen'], ai = [false, true], w = MAP_W, h = MAP_H } = {}) {
    this.seed = seed;
    this.rng = makeRng(seed ^ 0x5eed);
    const { map, starts } = generateMap(seed, w, h, factions.length);
    this.map = map;
    this.starts = starts;
    this.time = 0;
    this.nextId = 1;
    this.buildings = new Map();
    this.units = new Map();
    this.events = [];
    this.reserved = new Set(); // Kacheln, an denen gerade gearbeitet wird
    this.growing = new Set(); // Setzlinge
    this.territoryDirty = true;
    this.winner = -1;
    this.timers = { dispatch: 0, slow: 0 };

    this.players = factions.map((f, i) => ({
      id: i,
      faction: f,
      fx: FACTIONS[f],
      ai: !!ai[i],
      color: PLAYER_COLORS[i],
      stock: { ...START_LAGER },
      reserved: {},
      defeated: false,
      hq: null,
      produced: {},
    }));

    for (const p of this.players) {
      const s = starts[p.id];
      const hq = this.createBuilding(p.id, 'hq', s.x, s.y);
      hq.state = 'aktiv';
      hq.out = p.stock; // Das HQ-Lager ist der Spielerbestand
      hq.reservedOut = p.reserved;
      p.hq = hq;
      for (let i = 0; i < START_TRAEGER; i++) this.spawnUnit(p.id, 'traeger', s.x, s.y);
      for (let i = 0; i < START_SOLDATEN; i++) {
        const u = this.spawnUnit(p.id, 'soldat', s.x, s.y);
        this.enterGarrison(u, hq);
      }
    }
    this.recomputeTerritory();
  }

  emit(type, data = {}) {
    this.events.push({ type, time: this.time, ...data });
  }

  // ---------------------------------------------------------------- Gebäude

  createBuilding(player, type, x, y) {
    const b = {
      id: this.nextId++,
      type,
      def: BUILDINGS[type],
      player,
      x,
      y,
      state: 'baustelle',
      progress: 0,
      delivered: {},
      pending: {},
      inStock: {},
      out: {},
      reservedOut: {},
      worker: null,
      workerComing: false,
      timer: 1,
      busy: 0, // Restzeit der laufenden Produktion
      garrison: [],
      incoming: 0,
      spawned: 0,
      recruitComing: false,
      recruits: 0,
      created: this.time,
      lastMsg: -999,
    };
    this.buildings.set(b.id, b);
    this.map.building[this.map.idx(x, y)] = b.id;
    return b;
  }

  canPlace(player, type, x, y) {
    const def = BUILDINGS[type];
    const m = this.map;
    if (!def || def.hidden || !m.inside(x, y)) return false;
    const i = m.idx(x, y);
    if (m.owner[i] !== player || m.building[i] >= 0 || m.obj[i] !== OBJ.NONE || this.reserved.has(i)) return false;
    const t = m.terrain[i];
    if (def.terrain === TERRAIN.BERG ? t !== TERRAIN.BERG : t !== TERRAIN.GRAS && t !== TERRAIN.SAND) return false;
    // Ein Feld Abstand zu anderen Gebäuden, damit Träger durchkommen und es ordentlich aussieht.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (m.inside(nx, ny) && m.building[m.idx(nx, ny)] >= 0) return false;
      }
    }
    return true;
  }

  placeBuilding(player, type, x, y) {
    if (!this.canPlace(player, type, x, y)) return null;
    const b = this.createBuilding(player, type, x, y);
    this.emit('bau_platziert', { player, x, y, building: b.id, btype: type });
    return b;
  }

  alive(b) {
    return b && this.buildings.get(b.id) === b;
  }

  destroyBuilding(b, reason = 'abriss') {
    if (!this.alive(b)) return;
    this.buildings.delete(b.id);
    this.map.building[this.map.idx(b.x, b.y)] = -1;
    if (b.worker != null) {
      const w = this.units.get(b.worker);
      if (w) this.makeCarrier(w, b.x, b.y);
    }
    for (const sid of b.garrison) {
      const s = this.units.get(sid);
      if (!s) continue;
      if (reason === 'abriss') {
        s.x = b.x + 0.5;
        s.y = b.y + 0.5;
        s.visible = true;
        this.stationSoldier(s);
      } else this.removeUnit(s);
    }
    b.garrison = [];
    if (BUILDINGS[b.type].territory) this.territoryDirty = true;
    this.emit('gebaeude_weg', { player: b.player, x: b.x, y: b.y, btype: b.type, reason });
  }

  // ---------------------------------------------------------------- Einheiten

  spawnUnit(player, kind, x, y) {
    const u = {
      id: this.nextId++,
      player,
      kind, // traeger | arbeiter | soldat
      job: null,
      x: x + 0.5,
      y: y + 0.5,
      steps: [],
      cur: null,
      path: null,
      abort: null,
      state: 'idle',
      idleTime: 0,
      carrying: null,
      visible: true,
      action: null,
      moving: false,
      dir: 1,
      home: null,
      phase: this.rng() * 10,
    };
    this.units.set(u.id, u);
    return u;
  }

  removeUnit(u) {
    u.abort = null;
    this.units.delete(u.id);
  }

  // Soldat findet keinen Weg: zurück in die Reserve des Hauptquartiers.
  soldierHome(u) {
    const hq = this.players[u.player].hq;
    if (this.alive(hq) && hq.player === u.player) this.enterGarrison(u, hq);
    else this.removeUnit(u);
  }

  setPlan(u, steps, abort = null, state = 'job') {
    u.steps = steps;
    u.cur = null;
    u.path = null;
    u.abort = abort;
    u.state = state;
    u.action = null;
  }

  abortUnit(u) {
    const a = u.abort;
    u.abort = null;
    u.steps = [];
    u.cur = null;
    u.path = null;
    u.action = null;
    if (a) a(u);
    if (u.state !== 'garrison' && u.steps.length === 0 && this.units.has(u.id)) {
      if (u.kind === 'traeger') u.state = 'idle';
    }
  }

  makeCarrier(u, x, y) {
    u.kind = 'traeger';
    u.job = null;
    u.home = null;
    u.visible = true;
    u.x = x + 0.5;
    u.y = y + 0.5;
    u.carrying = null;
    this.setPlan(u, [], null, 'idle');
  }

  speed(u) {
    const base = u.kind === 'soldat' ? SOLDAT_SPEED : TRAEGER_SPEED;
    return base * FACTIONS[this.players[u.player].faction].bonus.speed;
  }

  updateUnit(u, dt) {
    u.moving = false;
    let guard = 8;
    while (guard-- > 0) {
      if (!u.cur) {
        u.cur = u.steps.shift() || null;
        u.path = null;
        if (!u.cur) {
          if (u.state === 'job') u.state = u.kind === 'traeger' ? 'idle' : u.state;
          if (u.state === 'idle') u.idleTime += dt;
          return;
        }
      }
      const s = u.cur;
      if (s.type === 'move') {
        if (!u.path) {
          u.path = findPath(this.map, Math.floor(u.x), Math.floor(u.y), s.x, s.y);
          if (!u.path) {
            this.abortUnit(u);
            return;
          }
        }
        let step = this.speed(u) * dt;
        while (step > 0 && u.path.length) {
          const [px, py] = u.path[0];
          const dx = px + 0.5 - u.x, dy = py + 0.5 - u.y;
          const d = Math.hypot(dx, dy);
          if (dx) u.dir = dx > 0 ? 1 : -1;
          if (d <= step) {
            u.x = px + 0.5;
            u.y = py + 0.5;
            u.path.shift();
            step -= d;
          } else {
            u.x += (dx / d) * step;
            u.y += (dy / d) * step;
            step = 0;
          }
        }
        u.moving = true;
        if (u.path.length) return;
        u.cur = null;
        return;
      }
      if (s.type === 'wait') {
        u.action = s.action || null;
        if (s.sfx && !s.played) {
          s.played = true;
          this.emit('sfx', { name: s.sfx, x: u.x, y: u.y, player: u.player });
        }
        s.t -= dt;
        if (s.t > 0) return;
        u.action = null;
        u.cur = null;
        return;
      }
      if (s.type === 'do') {
        u.cur = null;
        s.fn(u);
        continue;
      }
      u.cur = null;
    }
  }

  // ---------------------------------------------------------------- Transport

  storage(player) {
    return this.players[player].hq;
  }

  available(b, g) {
    return (b.out[g] || 0) - (b.reservedOut[g] || 0);
  }

  deliver(b, g) {
    if (b.state === 'baustelle') b.delivered[g] = (b.delivered[g] || 0) + 1;
    else if (b.type === 'hq') b.out[g] = (b.out[g] || 0) + 1;
    else b.inStock[g] = (b.inStock[g] || 0) + 1;
  }

  assignTransport(u, src, dst, g) {
    src.reservedOut[g] = (src.reservedOut[g] || 0) + 1;
    dst.pending[g] = (dst.pending[g] || 0) + 1;
    let picked = false;
    const abort = (unit) => {
      if (!picked && this.alive(src)) src.reservedOut[g]--;
      if (this.alive(dst)) dst.pending[g]--;
      if (picked && unit.carrying) this.returnGood(unit);
    };
    this.setPlan(u, [
      { type: 'move', x: src.x, y: src.y },
      {
        type: 'do',
        fn: (unit) => {
          if (!this.alive(src) || (src.out[g] || 0) <= 0) return this.abortUnit(unit);
          src.reservedOut[g]--;
          src.out[g]--;
          picked = true;
          unit.carrying = g;
        },
      },
      { type: 'move', x: dst.x, y: dst.y },
      {
        type: 'do',
        fn: (unit) => {
          if (!this.alive(dst) || dst.player !== unit.player) return this.abortUnit(unit);
          dst.pending[g]--;
          this.deliver(dst, g);
          unit.carrying = null;
          unit.abort = null;
          unit.state = 'idle';
          unit.idleTime = 0;
        },
      },
    ], abort);
  }

  // Ware zurück ins Lager bringen (Ziel ist weggefallen).
  returnGood(u) {
    const hq = this.storage(u.player);
    const g = u.carrying;
    if (!this.alive(hq)) {
      u.carrying = null;
      return;
    }
    this.setPlan(u, [
      { type: 'move', x: hq.x, y: hq.y },
      {
        type: 'do',
        fn: (unit) => {
          if (this.alive(hq) && hq.player === unit.player) hq.out[g] = (hq.out[g] || 0) + 1;
          unit.carrying = null;
          unit.state = 'idle';
        },
      },
    ], (unit) => (unit.carrying = null));
  }

  demandsOf(b) {
    const res = [];
    if (b.state === 'baustelle') {
      for (const g in b.def.cost) {
        const miss = b.def.cost[g] - (b.delivered[g] || 0) - (b.pending[g] || 0);
        for (let k = 0; k < miss; k++) res.push({ b, goods: [g], prio: 0 });
      }
    } else if (b.def.in) {
      for (const slot of b.def.in) {
        let have = 0;
        for (const g of slot) have += (b.inStock[g] || 0) + (b.pending[g] || 0);
        for (let k = have; k < EINGANG_ZIEL; k++) res.push({ b, goods: slot, prio: 1 + k - have });
      }
    }
    return res;
  }

  dispatch(p) {
    const idle = [];
    for (const u of this.units.values()) {
      if (u.player === p.id && u.kind === 'traeger' && u.state === 'idle') idle.push(u);
    }
    if (!idle.length) return;
    const mine = [];
    for (const b of this.buildings.values()) if (b.player === p.id) mine.push(b);

    const take = (x, y) => {
      let best = -1, bd = Infinity;
      for (let i = 0; i < idle.length; i++) {
        const d = Math.abs(idle[i].x - x) + Math.abs(idle[i].y - y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return best < 0 ? null : idle.splice(best, 1)[0];
    };

    // Arbeiter für fertige Betriebe.
    for (const b of mine) {
      if (!idle.length) return;
      if (b.state !== 'aktiv' || !b.def.worker || b.worker != null || b.workerComing) continue;
      const u = take(b.x, b.y);
      this.sendWorker(u, b);
    }

    const demands = [];
    for (const b of mine) demands.push(...this.demandsOf(b));
    // Baustellen in Reihenfolge der Platzierung, dann Betriebe.
    demands.sort((a, c) => a.prio - c.prio || a.b.created - c.b.created);
    for (const d of demands) {
      if (!idle.length) return;
      let src = null, sg = null, sd = Infinity;
      for (const s of mine) {
        if (s === d.b || s.state !== 'aktiv') continue;
        for (const g of d.goods) {
          if (this.available(s, g) <= 0) continue;
          const dist = Math.hypot(s.x - d.b.x, s.y - d.b.y);
          if (dist < sd) {
            sd = dist;
            src = s;
            sg = g;
          }
        }
      }
      if (!src) continue;
      this.assignTransport(take(src.x, src.y), src, d.b, sg);
    }

    // Überschuss ins Hauptquartier bringen.
    const hq = p.hq;
    if (!this.alive(hq)) return;
    for (const b of mine) {
      if (!idle.length) return;
      if (b === hq || b.state !== 'aktiv') continue;
      for (const g in b.out) {
        if (this.available(b, g) > 0 && idle.length) {
          this.assignTransport(take(b.x, b.y), b, hq, g);
          break;
        }
      }
    }
  }

  sendWorker(u, b) {
    b.workerComing = true;
    u.kind = 'arbeiter';
    u.job = b.type;
    this.setPlan(u, [
      { type: 'move', x: b.x, y: b.y },
      {
        type: 'do',
        fn: (unit) => {
          b.workerComing = false;
          if (!this.alive(b) || b.player !== unit.player) return this.makeCarrier(unit, Math.floor(unit.x), Math.floor(unit.y));
          b.worker = unit.id;
          b.timer = 1;
          unit.home = b.id;
          unit.visible = false;
          unit.abort = null;
          unit.state = 'drin';
          this.emit('arbeiter_da', { player: b.player, x: b.x, y: b.y, btype: b.type });
        },
      },
    ], (unit) => {
      b.workerComing = false;
      this.makeCarrier(unit, Math.floor(unit.x), Math.floor(unit.y));
    });
  }

  // ---------------------------------------------------------------- Betriebe

  findTile(b, radius, test) {
    const m = this.map;
    let best = -1, bd = Infinity;
    for (let y = b.y - radius; y <= b.y + radius; y++) {
      for (let x = b.x - radius; x <= b.x + radius; x++) {
        if (!m.inside(x, y)) continue;
        const d = Math.hypot(x - b.x, y - b.y);
        if (d > radius || d >= bd) continue;
        const i = m.idx(x, y);
        if (this.reserved.has(i) || !test(i, x, y)) continue;
        bd = d;
        best = i;
      }
    }
    return best;
  }

  countTiles(b, radius, test) {
    const m = this.map;
    let n = 0;
    for (let y = b.y - radius; y <= b.y + radius; y++) {
      for (let x = b.x - radius; x <= b.x + radius; x++) {
        if (m.inside(x, y) && Math.hypot(x - b.x, y - b.y) <= radius && test(m.idx(x, y))) n++;
      }
    }
    return n;
  }

  isFreeGround(i, player) {
    const m = this.map;
    return m.terrain[i] === TERRAIN.GRAS && m.obj[i] === OBJ.NONE && m.building[i] < 0 && m.owner[i] === player;
  }

  // Arbeiter verlässt das Haus, geht zu Kachel i, arbeitet, kommt mit Ware zurück.
  outing(b, worker, i, { action, sfx, onWork, carry }) {
    const m = this.map;
    const tx = i % m.w, ty = (i / m.w) | 0;
    this.reserved.add(i);
    worker.visible = true;
    worker.x = b.x + 0.5;
    worker.y = b.y + 0.5;
    const free = () => this.reserved.delete(i);
    const work = b.def.workTime / FACTIONS[this.players[b.player].faction].bonus.work;
    this.setPlan(worker, [
      { type: 'move', x: tx, y: ty },
      { type: 'wait', t: work, action, sfx },
      {
        type: 'do',
        fn: (u) => {
          free();
          if (onWork(i)) u.carrying = carry || null;
        },
      },
      { type: 'move', x: b.x, y: b.y },
      {
        type: 'do',
        fn: (u) => {
          u.abort = null;
          if (!this.alive(b) || b.player !== u.player) return this.makeCarrier(u, Math.floor(u.x), Math.floor(u.y));
          if (u.carrying) {
            b.out[u.carrying] = (b.out[u.carrying] || 0) + 1;
            this.countProduced(b.player, u.carrying);
          }
          u.carrying = null;
          u.visible = false;
          u.state = 'drin';
          b.timer = b.def.rest || 1;
        },
      },
    ], (u) => {
      free();
      if (!this.alive(b)) this.makeCarrier(u, Math.floor(u.x), Math.floor(u.y));
      else {
        // Weg blockiert: zurück ins Haus und später neu versuchen.
        u.visible = false;
        u.x = b.x + 0.5;
        u.y = b.y + 0.5;
        u.carrying = null;
        u.state = 'drin';
        b.timer = 3;
      }
    }, 'arbeit');
  }

  countProduced(player, g) {
    const p = this.players[player];
    p.produced[g] = (p.produced[g] || 0) + 1;
  }

  complain(b, what) {
    if (this.time - b.lastMsg < 60) return;
    b.lastMsg = this.time;
    this.emit('mangel', { player: b.player, x: b.x, y: b.y, btype: b.type, what });
  }

  updateBuilding(b, dt) {
    const def = b.def;
    if (b.state === 'baustelle') {
      for (const g in def.cost) if ((b.delivered[g] || 0) < def.cost[g]) return;
      b.progress += dt / def.time;
      b.building = true;
      if (Math.floor(b.progress * 8) !== Math.floor((b.progress - dt / def.time) * 8)) {
        this.emit('sfx', { name: 'hammer', x: b.x + 0.5, y: b.y + 0.5, player: b.player });
      }
      if (b.progress >= 1) {
        b.state = 'aktiv';
        b.building = false;
        this.emit('bau_fertig', { player: b.player, x: b.x, y: b.y, btype: b.type });
      }
      return;
    }

    if (def.kind === 'wohnen') {
      b.timer -= dt;
      if (b.timer <= 0 && b.spawned < def.capacity) {
        b.timer = def.spawnEvery;
        b.spawned++;
        this.spawnUnit(b.player, 'traeger', b.x, b.y);
        this.emit('einzug', { player: b.player, x: b.x, y: b.y });
      }
      return;
    }
    if (def.kind === 'militaer' || def.kind === 'lager') return;

    const worker = b.worker != null ? this.units.get(b.worker) : null;
    if (!worker || worker.state !== 'drin') return;

    if (b.busy > 0) {
      b.busy -= dt;
      if (b.busy <= 0) this.finishProduction(b);
      return;
    }
    b.timer -= dt;
    if (b.timer > 0) return;
    b.timer = 1;
    const m = this.map;
    const full = sumOut(b) >= MAX_AUSGANG;

    switch (def.kind) {
      case 'sammeln': {
        if (full) return;
        const i = this.findTile(b, def.radius, (j) => m.obj[j] === def.target);
        if (i < 0) {
          b.timer = 4;
          return this.complain(b, def.target === OBJ.BAUM ? 'baeume' : 'felsen');
        }
        this.outing(b, worker, i, {
          action: def.sfx,
          sfx: def.sfx,
          carry: def.out,
          onWork: (j) => {
            if (m.obj[j] !== def.target) return false;
            if (def.target === OBJ.FELS) {
              m.objAmount[j]--;
              if (m.objAmount[j] <= 0) m.obj[j] = OBJ.NONE;
            } else m.obj[j] = OBJ.NONE;
            return true;
          },
        });
        return;
      }
      case 'pflanzen': {
        const saplings = this.countTiles(b, def.radius, (j) => m.obj[j] === OBJ.SETZLING);
        const i = saplings > 10 ? -1 : this.findTile(b, def.radius, (j, x, y) =>
          this.isFreeGround(j, b.player) && Math.max(Math.abs(x - b.x), Math.abs(y - b.y)) > 1 && !this.nearBuilding(x, y, b));
        if (i < 0) {
          b.timer = 5;
          return;
        }
        this.outing(b, worker, i, {
          action: 'graben',
          sfx: def.sfx,
          onWork: (j) => {
            if (!this.isFreeGround(j, b.player)) return false;
            m.obj[j] = OBJ.SETZLING;
            m.objTime[j] = this.time;
            this.growing.add(j);
            return false;
          },
        });
        return;
      }
      case 'fischen': {
        if (full) return;
        const i = this.findTile(b, def.radius, (j, x, y) => m.terrain[j] !== TERRAIN.WASSER && m.fishingWater(x, y) >= 0);
        if (i < 0) {
          b.timer = 5;
          return this.complain(b, 'fische');
        }
        this.outing(b, worker, i, {
          action: 'angeln',
          sfx: def.sfx,
          carry: def.out,
          onWork: (j) => {
            const wi = m.fishingWater(j % m.w, (j / m.w) | 0);
            if (wi < 0) return false;
            m.fish[wi]--;
            return true;
          },
        });
        return;
      }
      case 'farm': {
        if (full) return;
        const ripe = this.findTile(b, def.radius, (j) => m.obj[j] === OBJ.FELD && this.time - m.objTime[j] >= FELD_WACHSTUM);
        if (ripe >= 0) {
          this.outing(b, worker, ripe, {
            action: 'ernten',
            sfx: 'sense',
            carry: def.out,
            onWork: (j) => {
              if (m.obj[j] !== OBJ.FELD) return false;
              m.obj[j] = OBJ.NONE;
              return true;
            },
          });
          return;
        }
        const fields = this.countTiles(b, def.radius, (j) => m.obj[j] === OBJ.FELD);
        const free = fields >= def.maxFields ? -1 : this.findTile(b, def.radius, (j, x, y) =>
          this.isFreeGround(j, b.player) && !this.nearBuilding(x, y, b));
        if (free >= 0) {
          this.outing(b, worker, free, {
            action: 'graben',
            sfx: def.sfx,
            onWork: (j) => {
              if (!this.isFreeGround(j, b.player)) return false;
              m.obj[j] = OBJ.FELD;
              m.objTime[j] = this.time;
              return false;
            },
          });
        } else b.timer = 2;
        return;
      }
      case 'verarbeiten': {
        if (full) return;
        const use = this.takeInputs(b);
        if (!use) return;
        b.busy = def.workTime / FACTIONS[this.players[b.player].faction].bonus.work;
        this.emit('sfx', { name: def.sfx, x: b.x + 0.5, y: b.y + 0.5, player: b.player });
        return;
      }
      case 'kaserne': {
        if (b.recruits > 0) {
          if (!this.takeInputs(b)) return;
          b.recruits--;
          b.busy = def.workTime;
          this.emit('sfx', { name: def.sfx, x: b.x + 0.5, y: b.y + 0.5, player: b.player });
          return;
        }
        const hasSword = def.in[0].some((g) => (b.inStock[g] || 0) > 0);
        if (hasSword && !b.recruitComing) this.callRecruit(b);
        return;
      }
    }
  }

  // Gebäude nicht direkt zupflastern: Nachbarfelder anderer Gebäude freihalten.
  nearBuilding(x, y, self) {
    const m = this.map;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!m.inside(nx, ny)) continue;
        const id = m.building[m.idx(nx, ny)];
        if (id >= 0 && id !== self.id) return true;
      }
    }
    return false;
  }

  takeInputs(b) {
    const picks = [];
    for (const slot of b.def.in) {
      const g = slot.find((s) => (b.inStock[s] || 0) > 0);
      if (!g) return null;
      picks.push(g);
    }
    for (const g of picks) b.inStock[g]--;
    return picks;
  }

  finishProduction(b) {
    const def = b.def;
    if (def.kind === 'kaserne') {
      const s = this.spawnUnit(b.player, 'soldat', b.x, b.y);
      this.emit('soldat_neu', { player: b.player, x: b.x, y: b.y });
      this.stationSoldier(s);
      return;
    }
    b.out[def.out] = (b.out[def.out] || 0) + 1;
    this.countProduced(b.player, def.out);
    this.emit('produziert', { player: b.player, x: b.x, y: b.y, good: def.out });
  }

  callRecruit(b) {
    let best = null, bd = Infinity;
    for (const u of this.units.values()) {
      if (u.player !== b.player || u.kind !== 'traeger' || u.state !== 'idle') continue;
      const d = Math.hypot(u.x - b.x, u.y - b.y);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    // Ein paar Träger bleiben immer für den Warentransport übrig.
    if (!best || this.stats(b.player).idle <= 4) return;
    b.recruitComing = true;
    this.setPlan(best, [
      { type: 'move', x: b.x, y: b.y },
      {
        type: 'do',
        fn: (u) => {
          b.recruitComing = false;
          if (!this.alive(b) || b.player !== u.player) {
            u.abort = null;
            u.state = 'idle';
            return;
          }
          u.abort = null;
          this.units.delete(u.id);
          b.recruits++;
        },
      },
    ], () => (b.recruitComing = false), 'rekrut');
  }

  // ---------------------------------------------------------------- Militär

  militaryBuildings(player) {
    const res = [];
    for (const b of this.buildings.values()) {
      if (b.player === player && b.def.territory && b.state === 'aktiv') res.push(b);
    }
    return res;
  }

  enterGarrison(u, b) {
    b.garrison.push(u.id);
    u.visible = false;
    u.x = b.x + 0.5;
    u.y = b.y + 0.5;
    u.home = b.id;
    this.setPlan(u, [], null, 'garrison');
    if (b.type !== 'hq' && b.garrison.length === 1) this.territoryDirty = true;
  }

  stationSoldier(u) {
    // Freier Turm zuerst, sonst ins Hauptquartier.
    let target = null, bd = Infinity;
    for (const b of this.militaryBuildings(u.player)) {
      if (b.type === 'hq' || b.garrison.length + b.incoming >= b.def.capacity) continue;
      const d = Math.hypot(b.x - u.x, b.y - u.y);
      if (d < bd) {
        bd = d;
        target = b;
      }
    }
    if (!target) target = this.players[u.player].hq;
    if (!this.alive(target)) return this.removeUnit(u);
    this.marchTo(u, target);
  }

  marchTo(u, b) {
    b.incoming++;
    this.setPlan(u, [
      { type: 'move', x: b.x, y: b.y },
      {
        type: 'do',
        fn: (unit) => {
          unit.abort = null;
          if (this.alive(b)) b.incoming--;
          if (!this.alive(b) || b.player !== unit.player) return this.stationSoldier(unit);
          this.enterGarrison(unit, b);
        },
      },
    ], (unit) => {
      if (this.alive(b)) b.incoming--;
      this.soldierHome(unit);
    }, 'marsch');
  }

  // Unbesetzte Türme holen sich Soldaten aus dem Hauptquartier.
  staffTowers(p) {
    const hq = p.hq;
    if (!this.alive(hq)) return;
    for (const b of this.militaryBuildings(p.id)) {
      if (b.type === 'hq') continue;
      // Neue Türme bekommen einen Soldaten, weitere nur, wenn das HQ genug Reserve hat.
      const want = b.garrison.length + b.incoming === 0 ? 1 : b.def.capacity;
      while (b.garrison.length + b.incoming < want && hq.garrison.length > (want > 1 ? 2 : 0)) {
        const u = this.units.get(hq.garrison.pop());
        if (!u) continue;
        u.visible = true;
        this.marchTo(u, b);
      }
    }
  }

  // Wie viele Soldaten könnten gegen ein Ziel geschickt werden?
  attackersFor(player, target) {
    const list = [];
    for (const b of this.militaryBuildings(player)) {
      if (Math.hypot(b.x - target.x, b.y - target.y) > 30) continue;
      const keep = b.type === 'hq' ? 0 : 1;
      for (let i = keep; i < b.garrison.length; i++) list.push({ b, id: b.garrison[i] });
    }
    return list;
  }

  attack(player, target, max = 99) {
    if (!this.alive(target) || target.player === player || !target.def.territory || target.state !== 'aktiv') return 0;
    const cands = this.attackersFor(player, target)
      .sort((a, c) => Math.hypot(a.b.x - target.x, a.b.y - target.y) - Math.hypot(c.b.x - target.x, c.b.y - target.y))
      .slice(0, max);
    for (const { b, id } of cands) {
      const u = this.units.get(id);
      b.garrison.splice(b.garrison.indexOf(id), 1);
      if (!u) continue;
      u.visible = true;
      u.x = b.x + 0.5;
      u.y = b.y + 0.5;
      if (b.type !== 'hq' && b.garrison.length === 0) this.territoryDirty = true;
      this.setPlan(u, [
        { type: 'move', x: target.x, y: target.y },
        { type: 'do', fn: (unit) => this.fight(unit, target) },
      ], (unit) => this.soldierHome(unit), 'angriff');
    }
    if (cands.length) this.emit('angriff', { player, x: target.x, y: target.y, target: target.player, count: cands.length });
    return cands.length;
  }

  fight(u, target) {
    if (!this.alive(target) || target.player === u.player) return this.stationSoldier(u);
    const defId = target.garrison[0];
    const def = defId != null ? this.units.get(defId) : null;
    if (!def) {
      target.garrison.shift();
      if (target.garrison.length) return this.fight(u, target);
      return this.capture(u, target);
    }
    this.setPlan(u, [
      { type: 'wait', t: 1.4, action: 'kampf', sfx: 'klirren' },
      {
        type: 'do',
        fn: (unit) => {
          if (!this.alive(target) || target.player === unit.player) return this.stationSoldier(unit);
          const defender = this.units.get(target.garrison[0]);
          if (!defender) return this.fight(unit, target);
          const atk = FACTIONS[this.players[unit.player].faction].bonus.attack;
          const dfn = FACTIONS[this.players[target.player].faction].bonus.defense * 1.1;
          if (this.rng() < atk / (atk + dfn)) {
            target.garrison.shift();
            this.units.delete(defender.id);
            this.emit('gefallen', { player: target.player, x: target.x, y: target.y });
            this.fight(unit, target);
          } else {
            this.units.delete(unit.id);
            this.emit('gefallen', { player: unit.player, x: unit.x, y: unit.y });
          }
        },
      },
    ], null, 'kampf');
  }

  capture(u, target) {
    const loser = target.player;
    if (target.type === 'hq') {
      this.defeat(loser, u.player);
      this.stationSoldier(u);
      return;
    }
    target.player = u.player;
    target.incoming = 0;
    this.enterGarrison(u, target);
    this.territoryDirty = true;
    this.emit('erobert', { player: u.player, loser, x: target.x, y: target.y, btype: target.type });
  }

  defeat(loser, winner) {
    const p = this.players[loser];
    p.defeated = true;
    for (const b of [...this.buildings.values()]) if (b.player === loser) this.destroyBuilding(b, 'krieg');
    for (const u of [...this.units.values()]) if (u.player === loser) this.units.delete(u.id);
    this.territoryDirty = true;
    this.emit('besiegt', { player: loser, by: winner });
    const rest = this.players.filter((q) => !q.defeated);
    if (rest.length === 1) {
      this.winner = rest[0].id;
      this.emit('spielende', { winner: this.winner });
    }
  }

  // ---------------------------------------------------------------- Gebiet

  recomputeTerritory() {
    const m = this.map;
    const best = new Float32Array(m.w * m.h).fill(Infinity);
    m.owner.fill(-1);
    for (const b of this.buildings.values()) {
      const r = b.def.territory;
      if (!r || b.state !== 'aktiv' || (b.type !== 'hq' && b.garrison.length === 0)) continue;
      for (let y = b.y - r; y <= b.y + r; y++) {
        for (let x = b.x - r; x <= b.x + r; x++) {
          if (!m.inside(x, y)) continue;
          const d = Math.hypot(x - b.x, y - b.y);
          if (d > r + 0.3) continue;
          const i = m.idx(x, y);
          if (d < best[i]) {
            best[i] = d;
            m.owner[i] = b.player;
          }
        }
      }
    }
    // Fremde Gebäude im eigenen Land brennen ab.
    for (const b of [...this.buildings.values()]) {
      if (b.type === 'hq') continue;
      if (m.owner[m.idx(b.x, b.y)] !== b.player) this.destroyBuilding(b, 'brand');
    }
    this.territoryDirty = false;
  }

  // ---------------------------------------------------------------- Takt

  update(dt) {
    if (this.winner >= 0) return;
    this.time += dt;
    const m = this.map;

    for (const u of [...this.units.values()]) {
      if (!this.units.has(u.id)) continue;
      this.updateUnit(u, dt);
      if (u.kind === 'traeger' && u.state === 'idle' && u.steps.length === 0 && !u.cur) this.idleBehaviour(u);
    }
    for (const b of [...this.buildings.values()]) if (this.alive(b)) this.updateBuilding(b, dt);

    this.timers.dispatch -= dt;
    if (this.timers.dispatch <= 0) {
      this.timers.dispatch = 0.3;
      for (const p of this.players) if (!p.defeated) this.dispatch(p);
    }

    this.timers.slow -= dt;
    if (this.timers.slow <= 0) {
      this.timers.slow = 1;
      for (const i of this.growing) {
        if (m.obj[i] !== OBJ.SETZLING) this.growing.delete(i);
        else if (this.time - m.objTime[i] >= BAUM_WACHSTUM) {
          m.obj[i] = OBJ.BAUM;
          this.growing.delete(i);
        }
      }
      for (let k = 0; k < 30; k++) {
        const i = this.rng.int(m.w * m.h);
        if (m.terrain[i] === TERRAIN.WASSER && m.fish[i] < 4) m.fish[i]++;
      }
      for (const p of this.players) if (!p.defeated) this.staffTowers(p);
    }
    if (this.territoryDirty) this.recomputeTerritory();
  }

  idleBehaviour(u) {
    const hq = this.storage(u.player);
    if (!this.alive(hq)) return;
    if (u.idleTime < 2 + (u.phase % 3)) return;
    u.idleTime = 0;
    // Zurück zum HQ schlendern und dort ein wenig herumstehen.
    const r = Math.hypot(u.x - hq.x - 0.5, u.y - hq.y - 0.5) > 4 ? 1 : 2;
    for (let tries = 0; tries < 6; tries++) {
      const x = hq.x + this.rng.int(2 * r + 1) - r;
      const y = hq.y + 1 + this.rng.int(2 * r + 1) - r;
      if (this.map.walkable(x, y)) {
        u.steps = [{ type: 'move', x, y }];
        u.cur = null;
        u.path = null;
        return;
      }
    }
  }

  // ---------------------------------------------------------------- Abfragen

  stats(player) {
    let traeger = 0, idle = 0, arbeiter = 0, soldaten = 0;
    for (const u of this.units.values()) {
      if (u.player !== player) continue;
      if (u.kind === 'traeger') {
        traeger++;
        if (u.state === 'idle') idle++;
      } else if (u.kind === 'arbeiter') arbeiter++;
      else soldaten++;
    }
    return { traeger, idle, arbeiter, soldaten };
  }

  buildingAt(x, y) {
    if (!this.map.inside(x, y)) return null;
    const id = this.map.building[this.map.idx(x, y)];
    return id >= 0 ? this.buildings.get(id) : null;
  }

  statusText(b) {
    const def = b.def;
    if (b.state === 'baustelle') {
      for (const g in def.cost) if ((b.delivered[g] || 0) < def.cost[g]) return 'Wartet auf Baumaterial';
      return `Wird gebaut (${Math.floor(b.progress * 100)} %)`;
    }
    if (def.kind === 'militaer') return b.garrison.length ? `Besetzt mit ${b.garrison.length}/${def.capacity} Soldaten` : 'Wartet auf Soldaten';
    if (def.kind === 'lager') return `${b.garrison.length} Soldaten in Reserve`;
    if (def.kind === 'wohnen') return `${b.spawned}/${def.capacity} Träger eingezogen`;
    if (!def.worker) return 'In Betrieb';
    if (b.worker == null) return b.workerComing ? 'Arbeiter ist unterwegs' : 'Wartet auf einen Arbeiter';
    if (sumOut(b) >= MAX_AUSGANG) return 'Lager vor der Tür ist voll';
    if (b.busy > 0) return 'Arbeitet';
    if (def.in && !def.in.every((s) => s.some((g) => (b.inStock[g] || 0) > 0))) return 'Wartet auf Rohstoffe';
    return 'In Betrieb';
  }
}

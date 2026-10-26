// Einfache Computergegner: arbeitet eine Bauliste ab, dehnt sich mit Türmen aus und greift später an.
import { BUILDINGS, OBJ, TERRAIN } from './config.js';

const BAULISTE = [
  ['holzfaeller', 2], ['saegewerk', 1], ['steinmetz', 1], ['foerster', 1], ['wachturm', 1],
  ['wohnhaus', 1], ['fischer', 1], ['bauernhof', 1], ['muehle', 1], ['baeckerei', 1],
  ['wachturm', 2], ['holzfaeller', 3], ['kohlemine', 1], ['erzmine', 1], ['schmelze', 1],
  ['waffenschmied', 1], ['kaserne', 1], ['wohnhaus', 2], ['foerster', 2], ['wachturm', 4],
  ['steinmetz', 2], ['bauernhof', 2], ['kohlemine', 2], ['fischer', 2], ['wohnhaus', 3],
  ['brauerei', 1], ['tempel', 1], ['wachturm', 6], ['burg', 1], ['wachturm', 9],
];

export class AI {
  constructor(game, player, { firstAttack = 540 } = {}) {
    this.g = game;
    this.p = player;
    this.timer = 2 + player;
    this.attackAt = firstAttack;
  }

  update(dt) {
    const g = this.g;
    const me = g.players[this.p];
    if (me.defeated || g.winner >= 0) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 3;

    const counts = {};
    let sites = 0;
    for (const b of g.buildings.values()) {
      if (b.player !== this.p) continue;
      counts[b.type] = (counts[b.type] || 0) + 1;
      if (b.state === 'baustelle') sites++;
    }
    if (sites < 2 && me.stock.bretter + me.stock.stein > 3) {
      for (const [type, n] of BAULISTE) {
        if ((counts[type] || 0) >= n) continue;
        // Türme und Burg nur, wenn Soldaten bereitstehen.
        if (BUILDINGS[type].kind === 'militaer' && me.hq.garrison.length < 2) continue;
        const site = this.findSite(type);
        if (site && g.placeBuilding(this.p, type, site.x, site.y)) break;
      }
    }

    if (g.time >= this.attackAt) {
      this.attackAt = g.time + 45;
      this.tryAttack();
    }
  }

  findSite(type) {
    const g = this.g, m = g.map, def = BUILDINGS[type];
    const hq = g.players[this.p].hq;
    const foe = this.enemyHq();
    let best = null, bestScore = -Infinity;
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (m.owner[m.idx(x, y)] !== this.p || !g.canPlace(this.p, type, x, y)) continue;
        const dist = Math.hypot(x - hq.x, y - hq.y);
        let score = -dist;
        if (def.kind === 'sammeln') {
          const n = this.countNear(x, y, def.radius, (i) => m.obj[i] === def.target);
          if (n < 3) continue;
          score = n * 2 - dist;
        } else if (def.kind === 'fischen') {
          const n = this.countNear(x, y, def.radius, (i) => m.terrain[i] === TERRAIN.WASSER);
          if (n < 4) continue;
          score = n - dist;
        } else if (def.kind === 'pflanzen' || def.kind === 'farm') {
          const n = this.countNear(x, y, def.radius, (i) => m.terrain[i] === TERRAIN.GRAS && m.obj[i] === OBJ.NONE);
          if (n < 6) continue;
          score = n - dist * 1.5;
        } else if (def.kind === 'militaer') {
          // Weit draußen, bevorzugt Richtung Gegner, und möglichst viel neues Land.
          const toFoe = foe ? Math.hypot(x - foe.x, y - foe.y) : 0;
          score = dist * 0.5 - toFoe * 0.8 + this.countNear(x, y, def.territory, (i) => m.owner[i] === -1) * 0.3;
        }
        score += Math.random() * 0.5;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    return best;
  }

  countNear(cx, cy, r, test) {
    const m = this.g.map;
    let n = 0;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (m.inside(x, y) && test(m.idx(x, y))) n++;
      }
    }
    return n;
  }

  enemyHq() {
    const foes = this.g.players.filter((q) => q.id !== this.p && !q.defeated);
    return foes.length ? foes[0].hq : null;
  }

  tryAttack() {
    const g = this.g;
    const own = g.militaryBuildings(this.p);
    let target = null, bd = Infinity;
    for (const b of g.buildings.values()) {
      if (b.player === this.p || !b.def.territory || b.state !== 'aktiv') continue;
      for (const o of own) {
        const d = Math.hypot(b.x - o.x, b.y - o.y);
        if (d < bd) {
          bd = d;
          target = b;
        }
      }
    }
    if (!target) return;
    // Vor dem Angriff ein paar Verteidiger auf die eigene Seite zaubern.
    if (g.players[this.p].mana >= 12 && target.garrison.length) g.castSpell(this.p, 'bekehrung', target.x, target.y);
    const avail = g.attackersFor(this.p, target).length;
    const defenders = target.garrison.length;
    if (avail >= Math.max(4, defenders + 3)) g.attack(this.p, target, avail - 1);
  }
}

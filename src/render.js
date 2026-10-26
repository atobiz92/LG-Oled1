// Canvas-Grafik. Alles wird prozedural gezeichnet – keine Bilddateien nötig.
import { TILE, TERRAIN, OBJ, BUILDINGS, FACTIONS, GOODS, FELD_WACHSTUM, BAUM_WACHSTUM } from './config.js';
import { hash2 } from './rng.js';

const TERRAIN_COLORS = {
  [TERRAIN.WASSER]: [40, 104, 168],
  [TERRAIN.SAND]: [222, 203, 141],
  [TERRAIN.GRAS]: [104, 158, 62],
  [TERRAIN.BERG]: [128, 112, 98],
};
const SKIN = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#ffdbac'];

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.effects = []; // { kind, x, y, t0, dur, text, color }
    this.selected = null;
    this.buildMode = null;
    this.hover = null;
    this.viewer = 0;
    this.terrainCanvas = this.prerenderTerrain();
  }

  // ------------------------------------------------------------ Gelände

  prerenderTerrain() {
    const m = this.game.map;
    const small = document.createElement('canvas');
    small.width = m.w;
    small.height = m.h;
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(m.w, m.h);
    for (let i = 0; i < m.w * m.h; i++) {
      const x = i % m.w, y = (i / m.w) | 0;
      const [r, g, b] = TERRAIN_COLORS[m.terrain[i]];
      const v = 0.9 + hash2(x, y, 11) * 0.2;
      img.data[i * 4] = r * v;
      img.data[i * 4 + 1] = g * v;
      img.data[i * 4 + 2] = b * v;
      img.data[i * 4 + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);

    const big = document.createElement('canvas');
    big.width = m.w * TILE;
    big.height = m.h * TILE;
    const ctx = big.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, big.width, big.height);

    // Details: Grashalme, Sandkörner, Felsgrate.
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const t = m.terrain[m.idx(x, y)];
        const px = x * TILE, py = y * TILE;
        for (let k = 0; k < 6; k++) {
          const hx = px + hash2(x, y, 100 + k) * TILE, hy = py + hash2(x, y, 200 + k) * TILE;
          if (t === TERRAIN.GRAS) {
            ctx.strokeStyle = k % 2 ? 'rgba(60,110,30,0.5)' : 'rgba(150,200,90,0.45)';
            ctx.beginPath();
            ctx.moveTo(hx, hy);
            ctx.lineTo(hx + 1, hy - 3);
            ctx.stroke();
          } else if (t === TERRAIN.SAND) {
            ctx.fillStyle = 'rgba(160,130,80,0.35)';
            ctx.fillRect(hx, hy, 1.5, 1.5);
          }
        }
        if (t === TERRAIN.BERG && hash2(x, y, 5) < 0.55) {
          const cx = px + TILE / 2 + (hash2(x, y, 6) - 0.5) * 10, by = py + TILE * 0.8;
          const hgt = 12 + hash2(x, y, 7) * 12;
          ctx.fillStyle = '#7a6a5c';
          ctx.beginPath();
          ctx.moveTo(cx - 13, by);
          ctx.lineTo(cx, by - hgt);
          ctx.lineTo(cx + 13, by);
          ctx.fill();
          ctx.fillStyle = '#5c4f44';
          ctx.beginPath();
          ctx.moveTo(cx, by - hgt);
          ctx.lineTo(cx + 13, by);
          ctx.lineTo(cx + 2, by);
          ctx.fill();
          if (hgt > 18) {
            ctx.fillStyle = '#f2f2f2';
            ctx.beginPath();
            ctx.moveTo(cx, by - hgt);
            ctx.lineTo(cx - 4, by - hgt + 6);
            ctx.lineTo(cx + 4, by - hgt + 6);
            ctx.fill();
          }
        }
      }
    }
    return big;
  }

  // ------------------------------------------------------------ Kamera

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    this.canvas.width = Math.floor(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.floor(this.canvas.clientHeight * dpr);
    this.clampCam();
  }

  viewW() {
    return this.canvas.width / this.dpr / this.cam.zoom;
  }

  viewH() {
    return this.canvas.height / this.dpr / this.cam.zoom;
  }

  centerOn(tx, ty) {
    this.cam.x = tx * TILE - this.viewW() / 2;
    this.cam.y = ty * TILE - this.viewH() / 2;
    this.clampCam();
  }

  clampCam() {
    const m = this.game.map;
    const ww = m.w * TILE, wh = m.h * TILE;
    this.cam.x = Math.max(-100, Math.min(ww - this.viewW() + 100, this.cam.x));
    this.cam.y = Math.max(-100, Math.min(wh - this.viewH() + 100, this.cam.y));
  }

  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.cam.zoom = Math.max(0.45, Math.min(2.5, this.cam.zoom * factor));
    this.cam.x = before.x - sx / this.cam.zoom;
    this.cam.y = before.y - sy / this.cam.zoom;
    this.clampCam();
  }

  screenToWorld(sx, sy) {
    return { x: this.cam.x + sx / this.cam.zoom, y: this.cam.y + sy / this.cam.zoom };
  }

  screenToTile(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) };
  }

  onScreen(tx, ty, margin = 2) {
    const x0 = this.cam.x / TILE - margin, y0 = this.cam.y / TILE - margin;
    return tx >= x0 && ty >= y0 && tx <= x0 + this.viewW() / TILE + 2 * margin && ty <= y0 + this.viewH() / TILE + 2 * margin;
  }

  // ------------------------------------------------------------ Effekte

  addEffect(e) {
    this.effects.push({ t0: performance.now() / 1000, dur: 2, ...e });
    if (this.effects.length > 60) this.effects.shift();
  }

  bubble(x, y, text, color = '#fff') {
    this.effects = this.effects.filter((e) => e.kind !== 'bubble' || Math.hypot(e.x - x, e.y - y) > 2);
    this.addEffect({ kind: 'bubble', x, y, text, color, dur: Math.min(9, 2.5 + text.length / 14) });
  }

  // ------------------------------------------------------------ Zeichnen

  draw() {
    const { ctx, game, cam } = this;
    const m = game.map;
    const t = performance.now() / 1000;
    const z = cam.zoom * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1d4f7d';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z);
    ctx.imageSmoothingEnabled = true;

    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), y0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
    const x1 = Math.min(m.w - 1, Math.ceil((cam.x + this.viewW()) / TILE) + 1);
    const y1 = Math.min(m.h - 1, Math.ceil((cam.y + this.viewH()) / TILE) + 1);

    const sw = (x1 - x0 + 1) * TILE, sh = (y1 - y0 + 1) * TILE;
    ctx.drawImage(this.terrainCanvas, x0 * TILE, y0 * TILE, sw, sh, x0 * TILE, y0 * TILE, sw, sh);

    this.drawWater(x0, y0, x1, y1, t);
    this.drawTerritory(x0, y0, x1, y1);
    if (this.buildMode) this.drawPlacement(x0, y0, x1, y1);
    if (this.selected) this.drawSelection(t);

    // Alles nach y sortiert, damit Vordergrund vor Hintergrund liegt.
    const items = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const o = m.obj[m.idx(x, y)];
        if (o) items.push({ y: y + 0.6, k: 0, x, ty: y, o });
      }
    }
    for (const b of game.buildings.values()) {
      if (b.x >= x0 - 1 && b.x <= x1 + 1 && b.y >= y0 - 1 && b.y <= y1 + 2) items.push({ y: b.y + 0.7, k: 1, b });
    }
    for (const u of game.units.values()) {
      if (u.visible && u.x >= x0 - 1 && u.x <= x1 + 2 && u.y >= y0 - 1 && u.y <= y1 + 2) items.push({ y: u.y, k: 2, u });
    }
    items.sort((a, c) => a.y - c.y);
    for (const it of items) {
      if (it.k === 0) this.drawObject(it.x, it.ty, it.o, t);
      else if (it.k === 1) this.drawBuilding(it.b, t);
      else this.drawUnit(it.u, t);
    }

    if (this.buildMode && this.hover) this.drawGhost(t);
    this.drawEffects(t);
  }

  drawWater(x0, y0, x1, y1, t) {
    const { ctx, game } = this;
    const m = game.map;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (m.terrain[m.idx(x, y)] !== TERRAIN.WASSER) continue;
        const ph = hash2(x, y, 3) * 6.28;
        const k = (Math.sin(t * 1.3 + ph) + 1) / 2;
        if (k < 0.55) continue;
        const px = x * TILE + hash2(x, y, 4) * 20 + 4, py = y * TILE + hash2(x, y, 9) * 24 + 4;
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px + 4, py - 3 * k, px + 8, py);
      }
    }
    ctx.stroke();
  }

  drawTerritory(x0, y0, x1, y1) {
    const { ctx, game } = this;
    const m = game.map;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const o = m.owner[m.idx(x, y)];
        if (o < 0) continue;
        const color = game.players[o].color;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.07;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        ctx.globalAlpha = 1;
        // Grenzsteine an Kanten zu fremdem/neutralem Land.
        const edges = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of edges) {
          const nx = x + dx, ny = y + dy;
          if (m.inside(nx, ny) && m.owner[m.idx(nx, ny)] === o) continue;
          for (let k = 0; k < 2; k++) {
            const f = 0.25 + k * 0.5;
            const px = x * TILE + (dx === 0 ? f * TILE : dx > 0 ? TILE - 3 : 3);
            const py = y * TILE + (dy === 0 ? f * TILE : dy > 0 ? TILE - 3 : 3);
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath();
            ctx.arc(px + 0.8, py + 0.8, 2.6, 0, 6.28);
            ctx.fill();
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(px, py, 2.4, 0, 6.28);
            ctx.fill();
          }
        }
      }
    }
  }

  drawPlacement(x0, y0, x1, y1) {
    const { ctx, game } = this;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!game.canPlace(this.viewer, this.buildMode, x, y)) continue;
        ctx.beginPath();
        ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 3, 0, 6.28);
        ctx.fill();
      }
    }
  }

  drawGhost(t) {
    const { ctx, game } = this;
    const { x, y } = this.hover;
    const ok = game.canPlace(this.viewer, this.buildMode, x, y);
    ctx.globalAlpha = 0.65;
    this.drawBuildingShape({ type: this.buildMode, def: BUILDINGS[this.buildMode], player: this.viewer, x, y, state: 'aktiv', garrison: [], busy: 0 }, t);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? '#7CFC00' : '#ff4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
    const def = BUILDINGS[this.buildMode];
    const r = def.radius || def.territory;
    if (r) this.radiusCircle(x, y, r, ok ? 'rgba(255,255,255,0.5)' : 'rgba(255,80,80,0.5)');
  }

  radiusCircle(x, y, r, color) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, r * TILE, 0, 6.28);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawSelection(t) {
    const { ctx, game } = this;
    const b = this.selected;
    if (!game.alive(b)) {
      this.selected = null;
      return;
    }
    const cx = b.x * TILE + TILE / 2, cy = b.y * TILE + TILE * 0.8;
    ctx.strokeStyle = `rgba(255,255,255,${0.6 + Math.sin(t * 5) * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 20, 8, 0, 0, 6.28);
    ctx.stroke();
    if (b.def.radius && b.player === this.viewer) this.radiusCircle(b.x, b.y, b.def.radius, 'rgba(255,255,255,0.45)');
  }

  // ------------------------------------------------------------ Objekte

  drawObject(x, y, o, t) {
    const { ctx, game } = this;
    const m = game.map;
    const i = m.idx(x, y);
    const cx = x * TILE + TILE / 2 + (hash2(x, y, 21) - 0.5) * 8, by = y * TILE + TILE * 0.85;
    if (o === OBJ.BAUM || o === OBJ.SETZLING) {
      let s = 1;
      if (o === OBJ.SETZLING) s = 0.3 + 0.5 * Math.min(1, (game.time - m.objTime[i]) / BAUM_WACHSTUM);
      const sway = Math.sin(t * 1.5 + x * 0.7 + y) * 1.2 * s;
      const kind = hash2(x, y, 22);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(cx + 4, by, 11 * s, 4 * s, 0, 0, 6.28);
      ctx.fill();
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(cx - 2 * s, by - 12 * s, 4 * s, 12 * s);
      if (kind < 0.5) {
        // Laubbaum
        const g = ['#2e7d32', '#388e3c', '#43a047'];
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = g[k];
          ctx.beginPath();
          ctx.arc(cx + sway + (k - 1) * 5 * s, by - (17 + (k === 1 ? 6 : 0)) * s, 8 * s, 0, 6.28);
          ctx.fill();
        }
      } else {
        // Nadelbaum
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = k % 2 ? '#1b5e20' : '#2e6b30';
          const w = (11 - k * 3) * s, top = by - (14 + k * 7) * s;
          ctx.beginPath();
          ctx.moveTo(cx - w + sway * (k / 2), top + 9 * s);
          ctx.lineTo(cx + sway * (k / 2 + 0.5), top - 4 * s);
          ctx.lineTo(cx + w + sway * (k / 2), top + 9 * s);
          ctx.fill();
        }
      }
    } else if (o === OBJ.FELS) {
      const n = m.objAmount[i];
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(cx + 3, by, 12, 4, 0, 0, 6.28);
      ctx.fill();
      for (let k = 0; k < Math.min(4, Math.ceil(n / 2) + 1); k++) {
        const ox = (hash2(x, y, 30 + k) - 0.5) * 14, sz = 5 + hash2(x, y, 40 + k) * 4 + n * 0.6;
        ctx.fillStyle = k % 2 ? '#8e8e8e' : '#a7a7a7';
        ctx.beginPath();
        ctx.moveTo(cx + ox - sz, by);
        ctx.lineTo(cx + ox - sz * 0.6, by - sz * 1.1);
        ctx.lineTo(cx + ox + sz * 0.4, by - sz * 1.3);
        ctx.lineTo(cx + ox + sz, by);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.moveTo(cx + ox - sz * 0.6, by - sz * 1.1);
        ctx.lineTo(cx + ox + sz * 0.4, by - sz * 1.3);
        ctx.lineTo(cx + ox, by - sz * 0.6);
        ctx.fill();
      }
    } else if (o === OBJ.FELD) {
      const g = Math.min(1, (game.time - m.objTime[i]) / FELD_WACHSTUM);
      const px = x * TILE + 2, py = y * TILE + 2;
      ctx.fillStyle = '#7a5532';
      ctx.fillRect(px, py, TILE - 4, TILE - 4);
      const col = g >= 1 ? '#e8c95a' : `rgb(${Math.round(90 + 140 * g)},${Math.round(160 + 40 * g)},${Math.round(60 + 20 * g)})`;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      for (let r = 0; r < 5; r++) {
        const ry = py + 4 + r * 5.5;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const sx = px + 3 + k * 4.5;
          const sway = Math.sin(t * 2 + k + r) * g;
          ctx.moveTo(sx, ry + 2);
          ctx.lineTo(sx + sway, ry + 2 - 2 - 5 * g);
        }
        ctx.stroke();
      }
    }
  }

  // ------------------------------------------------------------ Gebäude

  drawBuilding(b, t) {
    const { ctx } = this;
    if (b.state === 'baustelle') return this.drawSite(b, t);
    this.drawBuildingShape(b, t);
    const def = b.def;
    // Rauch bei laufender Produktion.
    if (b.busy > 0) {
      const cx = b.x * TILE + TILE / 2 + 8, top = b.y * TILE - 6;
      for (let k = 0; k < 3; k++) {
        const ph = (t * 0.6 + k / 3) % 1;
        ctx.fillStyle = `rgba(220,220,220,${0.55 * (1 - ph)})`;
        ctx.beginPath();
        ctx.arc(cx + Math.sin(ph * 6 + k) * 3, top - ph * 22, 3 + ph * 5, 0, 6.28);
        ctx.fill();
      }
    }
    if (def.kind === 'militaer' || def.kind === 'lager') {
      const n = b.garrison.length;
      const cx = b.x * TILE + TILE / 2, cy = b.y * TILE + TILE + 4;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(cx - 10, cy - 6, 20, 11);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`⚔${n}`, cx, cy);
    }
  }

  drawBuildingShape(b, t) {
    const { ctx, game } = this;
    const p = game.players[b.player];
    const fx = FACTIONS[p.faction];
    const cx = b.x * TILE + TILE / 2, by = b.y * TILE + TILE * 0.85;
    const def = b.def;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx + 5, by, def.kind === 'lager' ? 30 : 20, 7, 0, 0, 6.28);
    ctx.fill();

    if (b.type === 'hq') {
      this.drawTower(cx - 17, by, 12, 40, fx, p.color);
      this.drawTower(cx + 17, by, 12, 40, fx, p.color);
      this.drawHouse(cx, by, 30, 22, fx);
      this.drawFlag(cx, by - 52, p.color, t, 22);
    } else if (def.kind === 'militaer') {
      const big = b.type === 'burg';
      if (big) {
        this.drawHouse(cx, by, 30, 16, fx);
        this.drawTower(cx - 13, by, 11, 34, fx, p.color);
        this.drawTower(cx + 13, by, 11, 34, fx, p.color);
      } else this.drawTower(cx, by, 14, 36, fx, p.color);
      this.drawFlag(cx + (big ? 13 : 0), by - (big ? 46 : 48), p.color, t, 18);
    } else if (def.terrain === TERRAIN.BERG) {
      // Mine: Stolleneingang mit Holzrahmen.
      ctx.fillStyle = '#3b2a1a';
      ctx.beginPath();
      ctx.arc(cx, by - 6, 11, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(cx - 11, by - 6, 22, 6);
      ctx.strokeStyle = '#8b5a2b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 11, by);
      ctx.lineTo(cx - 11, by - 14);
      ctx.lineTo(cx + 11, by - 14);
      ctx.lineTo(cx + 11, by);
      ctx.stroke();
      this.drawFlag(cx + 14, by - 22, p.color, t, 12);
    } else {
      const w = b.type === 'wohnhaus' ? 22 : 26;
      this.drawHouse(cx, by, w, 16, fx);
      if (b.type === 'muehle') this.drawMill(cx, by - 26, b.busy > 0 ? t * 3 : 0.4);
      this.drawFlag(cx + w / 2 + 3, by - 20, p.color, t, 12);
    }
    if (def.icon && b.type !== 'hq') {
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(cx - 15, by - 4, 8, 0, 6.28);
      ctx.fill();
      ctx.fillText(def.icon, cx - 15, by - 3);
    }
  }

  drawHouse(cx, by, w, h, fx) {
    const { ctx } = this;
    const x = cx - w / 2, top = by - h;
    ctx.fillStyle = fx.wall;
    ctx.fillRect(x, top, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x + w * 0.6, top, w * 0.4, h);
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(cx - 3, by - 9, 6, 9);
    ctx.fillStyle = '#9fd3ff';
    ctx.fillRect(x + 3, top + 4, 4, 4);
    ctx.fillStyle = fx.roof;
    ctx.beginPath();
    if (fx.style === 'giebel') {
      ctx.moveTo(x - 4, top + 1);
      ctx.lineTo(cx, top - h * 0.6);
      ctx.lineTo(x + w + 4, top + 1);
    } else if (fx.style === 'steil') {
      ctx.moveTo(x - 3, top + 3);
      ctx.lineTo(cx, top - h * 1.1);
      ctx.lineTo(x + w + 3, top + 3);
    } else if (fx.style === 'flach') {
      ctx.rect(x - 2, top - 4, w + 4, 5);
      ctx.rect(x + 3, top - 7, w - 6, 3);
    } else {
      ctx.ellipse(cx, top + 1, w / 2 + 3, h * 0.65, 0, Math.PI, 0);
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    if (fx.style === 'giebel' || fx.style === 'steil') {
      ctx.moveTo(cx, top - h * (fx.style === 'steil' ? 1.1 : 0.6));
      ctx.lineTo(x + w + 4, top + 1);
      ctx.lineTo(cx, top + 1);
    } else if (fx.style === 'kuppel') {
      ctx.ellipse(cx, top + 1, w / 2 + 3, h * 0.65, 0, -Math.PI / 2, 0);
      ctx.lineTo(cx, top + 1);
    }
    ctx.fill();
  }

  drawTower(cx, by, w, h, fx, color) {
    const { ctx } = this;
    const x = cx - w / 2, top = by - h;
    ctx.fillStyle = shade('#b8b0a0', fx.style === 'flach' ? 1.15 : 1);
    if (fx.style === 'steil') ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(x, top, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(x + w * 0.6, top, w * 0.4, h);
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(cx - 1.5, top + 8, 3, 6);
    ctx.fillStyle = color;
    ctx.fillRect(x, top + h * 0.45, w, 3);
    ctx.fillStyle = fx.roof;
    ctx.beginPath();
    if (fx.style === 'flach') {
      for (let k = 0; k < 3; k++) ctx.rect(x + k * (w / 3), top - 4, w / 5, 4);
    } else if (fx.style === 'kuppel') {
      ctx.ellipse(cx, top, w / 2 + 2, w * 0.7, 0, Math.PI, 0);
    } else {
      ctx.moveTo(x - 3, top);
      ctx.lineTo(cx, top - (fx.style === 'steil' ? 18 : 12));
      ctx.lineTo(x + w + 3, top);
    }
    ctx.fill();
  }

  drawFlag(x, top, color, t, h) {
    const { ctx } = this;
    ctx.strokeStyle = '#3b3b3b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, top + h);
    ctx.lineTo(x, top);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, top);
    for (let k = 0; k <= 4; k++) ctx.lineTo(x + k * 2.5, top + Math.sin(t * 6 + k) * 1.5);
    for (let k = 4; k >= 0; k--) ctx.lineTo(x + k * 2.5, top + 6 + Math.sin(t * 6 + k) * 1.5);
    ctx.fill();
  }

  drawMill(cx, cy, angle) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = '#f5f0e0';
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillRect(1, -2, 15, 4);
      ctx.strokeRect(1, -2, 15, 4);
    }
    ctx.restore();
  }

  drawSite(b, t) {
    const { ctx } = this;
    const cx = b.x * TILE + TILE / 2, by = b.y * TILE + TILE * 0.85;
    ctx.fillStyle = '#9b7b55';
    ctx.beginPath();
    ctx.ellipse(cx, by - 2, 16, 6, 0, 0, 6.28);
    ctx.fill();
    if (b.progress > 0) {
      ctx.save();
      ctx.beginPath();
      const h = 60 * b.progress;
      ctx.rect(cx - 40, by - h, 80, h + 4);
      ctx.clip();
      this.drawBuildingShape({ ...b, state: 'aktiv', busy: 0 }, t);
      ctx.restore();
    }
    ctx.strokeStyle = '#c49a6c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const dx of [-12, 12]) {
      ctx.moveTo(cx + dx, by);
      ctx.lineTo(cx + dx, by - 26);
    }
    ctx.moveTo(cx - 14, by - 13);
    ctx.lineTo(cx + 14, by - 13);
    ctx.moveTo(cx - 14, by - 24);
    ctx.lineTo(cx + 14, by - 24);
    ctx.stroke();
    // Gelieferte Baustoffe als kleine Stapel.
    let k = 0;
    for (const g in b.delivered) {
      for (let n = 0; n < b.delivered[g] && k < 12; n++, k++) {
        ctx.fillStyle = GOODS[g].color;
        ctx.fillRect(cx - 16 + (k % 6) * 5, by + 2 - Math.floor(k / 6) * 3, 4, 3);
      }
    }
    if (b.building) {
      // Kleiner Bauarbeiter mit Hammer.
      const swing = Math.sin(t * 12);
      this.drawFigure(cx + 16, by + 2, this.game.players[b.player], { kind: 'arbeiter', phase: b.id }, t, false, swing);
    }
  }

  // ------------------------------------------------------------ Figuren

  drawUnit(u, t) {
    const p = this.game.players[u.player];
    const px = u.x * TILE, py = u.y * TILE + 6;
    let swing = null;
    if (u.action) swing = Math.sin(t * (u.action === 'kampf' ? 16 : 9) + u.phase);
    this.drawFigure(px, py, p, u, t, u.moving, swing);
    if (u.carrying) {
      const { ctx } = this;
      const bob = u.moving ? Math.abs(Math.sin(t * 10 + u.phase)) * 1.5 : 0;
      ctx.fillStyle = GOODS[u.carrying].color;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.fillRect(px - 4, py - 24 - bob, 8, 6);
      ctx.strokeRect(px - 4, py - 24 - bob, 8, 6);
    }
    if (u.action === 'angeln') {
      const { ctx } = this;
      ctx.strokeStyle = '#5d4037';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 3, py - 12);
      ctx.quadraticCurveTo(px + 14, py - 22, px + 20 * (u.dir || 1), py - 2);
      ctx.stroke();
    }
  }

  drawFigure(px, py, p, u, t, moving, swing) {
    const { ctx } = this;
    const fx = FACTIONS[p.faction];
    const phase = u.phase || 0;
    const walk = moving ? Math.sin(t * 12 + phase) : 0;
    const bob = moving ? Math.abs(walk) * 1.5 : 0;
    const skin = SKIN[Math.floor(phase * 7) % SKIN.length];
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(px, py, 5, 2, 0, 0, 6.28);
    ctx.fill();
    // Beine
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px - 1.5, py - 6 - bob);
    ctx.lineTo(px - 1.5 + walk * 2.5, py);
    ctx.moveTo(px + 1.5, py - 6 - bob);
    ctx.lineTo(px + 1.5 - walk * 2.5, py);
    ctx.stroke();
    // Körper
    const body = u.kind === 'soldat' ? shade(p.color, 0.75) : u.kind === 'arbeiter' ? shade(p.color, 1.15) : p.color;
    ctx.fillStyle = body;
    if (fx.women) {
      ctx.beginPath();
      ctx.moveTo(px - 3, py - 14 - bob);
      ctx.lineTo(px + 3, py - 14 - bob);
      ctx.lineTo(px + 5, py - 5 - bob);
      ctx.lineTo(px - 5, py - 5 - bob);
      ctx.fill();
    } else ctx.fillRect(px - 3.5, py - 14 - bob, 7, 9);
    // Kopf
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(px, py - 17 - bob, 3.2, 0, 6.28);
    ctx.fill();
    if (fx.women) {
      // Zopf
      ctx.strokeStyle = ['#3b2314', '#b5651d', '#1a1a1a', '#d4a017'][Math.floor(phase * 3) % 4];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px - 1, py - 20 - bob);
      ctx.quadraticCurveTo(px - 6 * (u.dir || 1), py - 18 - bob, px - 5 * (u.dir || 1) - walk, py - 12 - bob);
      ctx.stroke();
    }
    if (u.kind === 'soldat') {
      ctx.fillStyle = fx.women ? '#c0a060' : '#9e9e9e';
      ctx.beginPath();
      ctx.arc(px, py - 18 - bob, 3.4, Math.PI, 0);
      ctx.fill();
      if (p.faction === 'wikinger') {
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px - 3, py - 19 - bob);
        ctx.lineTo(px - 5, py - 23 - bob);
        ctx.moveTo(px + 3, py - 19 - bob);
        ctx.lineTo(px + 5, py - 23 - bob);
        ctx.stroke();
      }
      // Waffe
      const a = swing != null ? swing * 0.9 : 0;
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(px + 4, py - 8 - bob);
      ctx.lineTo(px + 4 + Math.sin(a) * 10, py - 8 - bob - Math.cos(a) * 12);
      ctx.stroke();
    } else if (u.kind === 'arbeiter') {
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(px - 4, py - 21 - bob, 8, 2);
      ctx.fillRect(px - 2.5, py - 23 - bob, 5, 2);
      if (swing != null) {
        ctx.strokeStyle = '#6d4c41';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px + 3, py - 11);
        const a = -0.6 + swing;
        ctx.lineTo(px + 3 + Math.cos(a) * 9, py - 11 + Math.sin(a) * 9);
        ctx.stroke();
      }
    }
  }

  // ------------------------------------------------------------ Effekte

  drawEffects(t) {
    const { ctx } = this;
    this.effects = this.effects.filter((e) => t - e.t0 < e.dur);
    for (const e of this.effects) {
      const k = (t - e.t0) / e.dur;
      const px = e.x * TILE + TILE / 2, py = e.y * TILE;
      if (e.kind === 'feuer') {
        for (let n = 0; n < 6; n++) {
          const ph = (t * 1.5 + n / 6) % 1;
          ctx.fillStyle = `rgba(${255},${Math.round(200 * (1 - ph))},0,${(1 - ph) * (1 - k)})`;
          ctx.beginPath();
          ctx.arc(px + Math.sin(n * 2 + t * 4) * 8, py + 20 - ph * 30, 6 * (1 - ph) + 2, 0, 6.28);
          ctx.fill();
        }
      } else if (e.kind === 'text') {
        ctx.globalAlpha = 1 - k;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(e.text, px + 1, py - 10 - k * 20 + 1);
        ctx.fillStyle = e.color || '#fff';
        ctx.fillText(e.text, px, py - 10 - k * 20);
        ctx.globalAlpha = 1;
      } else if (e.kind === 'bubble') {
        ctx.font = '11px sans-serif';
        const lines = wrap(ctx, e.text, 180);
        const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12, h = lines.length * 13 + 8;
        const bx = px - w / 2, byy = py - 40 - h;
        ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        roundRect(ctx, bx, byy, w, h, 6);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px - 5, byy + h);
        ctx.lineTo(px, byy + h + 8);
        ctx.lineTo(px + 5, byy + h);
        ctx.fill();
        ctx.fillStyle = '#222';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach((l, n) => ctx.fillText(l, bx + 6, byy + 5 + n * 13));
        ctx.globalAlpha = 1;
      }
    }
  }

  // ------------------------------------------------------------ Minikarte

  drawMinimap(mini) {
    const g = this.game, m = g.map;
    const ctx = mini.getContext('2d');
    if (!this.miniImg) this.miniImg = ctx.createImageData(m.w, m.h);
    const d = this.miniImg.data;
    for (let i = 0; i < m.w * m.h; i++) {
      let [r, gg, b] = TERRAIN_COLORS[m.terrain[i]];
      if (m.obj[i] === OBJ.BAUM) [r, gg, b] = [40, 100, 40];
      const o = m.owner[i];
      if (o >= 0) {
        const c = parseInt(g.players[o].color.slice(1), 16);
        r = r * 0.55 + (c >> 16) * 0.45;
        gg = gg * 0.55 + ((c >> 8) & 255) * 0.45;
        b = b * 0.55 + (c & 255) * 0.45;
      }
      d[i * 4] = r;
      d[i * 4 + 1] = gg;
      d[i * 4 + 2] = b;
      d[i * 4 + 3] = 255;
    }
    for (const bb of g.buildings.values()) {
      const i = m.idx(bb.x, bb.y) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
    }
    if (!this.miniSmall) {
      this.miniSmall = document.createElement('canvas');
      this.miniSmall.width = m.w;
      this.miniSmall.height = m.h;
    }
    this.miniSmall.getContext('2d').putImageData(this.miniImg, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.miniSmall, 0, 0, mini.width, mini.height);
    const sx = mini.width / (m.w * TILE), sy = mini.height / (m.h * TILE);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.cam.x * sx, this.cam.y * sy, this.viewW() * sx, this.viewH() * sy);
  }
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

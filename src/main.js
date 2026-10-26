// Einstieg im Browser: Startbildschirm, Spielschleife, Eingabe, Bedienfeld.
import { BUILDINGS, FACTIONS, GOODS, TILE } from './config.js';
import { Game } from './game.js';
import { AI } from './ai.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { Voice } from './voice.js';

const $ = (s) => document.querySelector(s);
const sound = new Sound();
const voice = new Voice();

let game = null, ai = null, renderer = null;
let speed = 1, chosen = 'amazonen';
const keys = new Set();
const timers = { ui: 0, mini: 0, spott: 70, lager: 0 };

// ------------------------------------------------------------ Startbildschirm

const fxOf = (key) => ({ ...FACTIONS[key], key });

function buildStartScreen() {
  const box = $('#factions');
  const sel = $('#gegner');
  for (const [key, f] of Object.entries(FACTIONS)) {
    const card = document.createElement('div');
    card.className = 'faction' + (key === chosen ? ' on' : '');
    card.dataset.key = key;
    card.innerHTML = `
      <h3><span class="swatch" style="background:${f.roof}"></span>${f.name}</h3>
      <p>${f.motto}</p>
      <p class="bonus">${f.bonusText}</p>
      <button type="button">🔈 Probehören</button>`;
    card.addEventListener('click', () => {
      chosen = key;
      box.querySelectorAll('.faction').forEach((c) => c.classList.toggle('on', c.dataset.key === key));
    });
    card.querySelector('button').addEventListener('click', (e) => {
      e.stopPropagation();
      sound.unlock();
      voice.say('start', fxOf(key), { priority: true });
    });
    box.appendChild(card);
    const o = document.createElement('option');
    o.value = key;
    o.textContent = f.name;
    sel.appendChild(o);
  }
  $('#seed').value = 1 + Math.floor(Math.random() * 9999);
  $('#los').addEventListener('click', () => {
    let opp = $('#gegner').value;
    if (opp === 'zufall') {
      const others = Object.keys(FACTIONS).filter((k) => k !== chosen);
      opp = others[Math.floor(Math.random() * others.length)];
    }
    startGame(chosen, opp, Number($('#seed').value) || 1);
  });
  $('#nochmal').addEventListener('click', () => location.reload());
}

function startGame(mine, opp, seed) {
  sound.unlock();
  $('#start').hidden = true;
  $('#spiel').hidden = false;
  game = new Game({ seed, factions: [mine, opp], ai: [false, true] });
  ai = new AI(game, 1);
  renderer = new Renderer($('#view'), game);
  window.siedelei = { game, renderer, sound, voice }; // zum Ausprobieren in der Browser-Konsole
  renderer.viewer = 0;
  renderer.resize();
  const hq = game.players[0].hq;
  renderer.centerOn(hq.x + 0.5, hq.y + 0.5);
  voice.onSubtitle = subtitle;
  $('#volk').textContent = `${FACTIONS[mine].name} gegen ${FACTIONS[opp].name}`;
  buildPanel();
  sound.startMusic(FACTIONS[mine]);
  voice.say('start', fxOf(mine), { priority: true, x: hq.x, y: hq.y });
  last = performance.now();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------ Schleife

let last = 0, acc = 0;
const STEP = 0.1;

function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  pan(dt);
  if (game.winner < 0) {
    acc += dt * speed;
    let n = 0;
    while (acc >= STEP && n++ < 40) {
      ai.update(STEP);
      game.update(STEP);
      acc -= STEP;
    }
  }
  for (const e of game.events) handleEvent(e);
  game.events.length = 0;
  periodic(dt);
  renderer.draw();
  requestAnimationFrame(frame);
}

function pan(dt) {
  const v = 700 * dt / renderer.cam.zoom;
  if (keys.has('a') || keys.has('arrowleft')) renderer.cam.x -= v;
  if (keys.has('d') || keys.has('arrowright')) renderer.cam.x += v;
  if (keys.has('w') || keys.has('arrowup')) renderer.cam.y -= v;
  if (keys.has('s') || keys.has('arrowdown')) renderer.cam.y += v;
  if (keys.size) renderer.clampCam();
}

function periodic(dt) {
  timers.ui -= dt;
  if (timers.ui <= 0) {
    timers.ui = 0.25;
    updateTopbar();
    updatePanel();
    updateInfo();
  }
  timers.mini -= dt;
  if (timers.mini <= 0) {
    timers.mini = 0.5;
    renderer.drawMinimap($('#mini'));
  }
  if (game.winner >= 0 || speed === 0) return;
  timers.spott -= dt * speed;
  if (timers.spott <= 0) {
    timers.spott = 100 + Math.random() * 80;
    const foe = game.players[1];
    if (!foe.defeated) voice.say('gegner_spott', fxOf(foe.faction), { cooldown: 60, x: foe.hq.x, y: foe.hq.y });
  }
  timers.lager -= dt * speed;
  if (timers.lager <= 0) {
    timers.lager = 5;
    const p = game.players[0];
    const waiting = [...game.buildings.values()].some((b) => b.player === 0 && b.state === 'baustelle' && (b.def.cost.bretter || 0) > (b.delivered.bretter || 0) + (b.pending.bretter || 0));
    if (waiting && p.stock.bretter === 0) voice.say('lager_leer', fxOf(p.faction), { cooldown: 90 });
  }
}

// ------------------------------------------------------------ Ereignisse

function onScreen(e) {
  return e.x != null && renderer.onScreen(e.x, e.y, 1);
}

function handleEvent(e) {
  const me = game.players[0];
  const fx = fxOf(me.faction);
  const mine = e.player === 0;
  switch (e.type) {
    case 'sfx':
      if (onScreen(e)) sound.play(e.name, 0.8);
      break;
    case 'bau_platziert':
      if (mine) {
        sound.play('plopp');
        voice.say('bau_platziert', fx, { cooldown: 25, x: e.x, y: e.y });
      }
      break;
    case 'bau_fertig':
      if (mine) {
        sound.play('glocke', 0.7);
        renderer.addEffect({ kind: 'text', x: e.x, y: e.y, text: `${BUILDINGS[e.btype].name} fertig!`, color: '#aef' });
        voice.say('bau_fertig', fx, { cooldown: 20, x: e.x, y: e.y });
      }
      break;
    case 'arbeiter_da':
      if (mine) voice.say('arbeiter_da', fx, { cooldown: 45, x: e.x, y: e.y });
      break;
    case 'mangel':
      if (mine) voice.say(`mangel_${e.what}`, fx, { cooldown: 50, x: e.x, y: e.y });
      break;
    case 'einzug':
      if (mine) {
        if (onScreen(e)) sound.play('einzug', 0.6);
        voice.say('einzug', fx, { cooldown: 90, x: e.x, y: e.y });
      }
      break;
    case 'soldat_neu':
      if (mine) voice.say('soldat_neu', fx, { cooldown: 30, x: e.x, y: e.y });
      break;
    case 'produziert':
      if (mine && onScreen(e)) renderer.addEffect({ kind: 'text', x: e.x, y: e.y, text: `+1 ${GOODS[e.good].icon}`, dur: 1.4 });
      break;
    case 'angriff':
      if (mine) {
        sound.play('horn');
        voice.say('angriff', fx, { priority: true, x: e.x, y: e.y });
      } else if (e.target === 0) {
        sound.play('horn');
        voice.say('wir_werden_angegriffen', fx, { cooldown: 30, priority: true, x: e.x, y: e.y });
      }
      break;
    case 'gefallen':
      if (onScreen(e)) sound.play('tod', 0.6);
      break;
    case 'erobert':
      if (mine) {
        sound.play('fanfare', 0.6);
        voice.say('erobert', fx, { priority: true, x: e.x, y: e.y });
      } else if (e.loser === 0) voice.say('verloren', fx, { priority: true, x: e.x, y: e.y });
      break;
    case 'gebaeude_weg':
      if (e.reason !== 'abriss') {
        renderer.addEffect({ kind: 'feuer', x: e.x, y: e.y, dur: 4 });
        if (onScreen(e)) sound.play('feuer');
        if (mine && e.reason === 'brand') voice.say('brand', fx, { cooldown: 30, x: e.x, y: e.y });
      }
      break;
    case 'spielende': {
      const won = e.winner === 0;
      sound.play(won ? 'fanfare' : 'trauer');
      voice.say(won ? 'sieg' : 'niederlage', fx, { priority: true });
      sound.stopMusic();
      $('#ende-titel').textContent = won ? 'Sieg!' : 'Niederlage!';
      const min = Math.floor(game.time / 60);
      $('#ende-text').textContent = won
        ? `Das Hauptquartier der ${game.players[1].fx.name} ist gefallen. Nach ${min} Minuten gehört das Land dir.`
        : `Die ${game.players[1].fx.name} haben dein Hauptquartier erobert. Nach ${min} Minuten ist Schluss.`;
      setTimeout(() => ($('#ende').hidden = false), 1500);
      break;
    }
  }
}

function subtitle(text, faction, x, y) {
  const box = $('#untertitel');
  const line = document.createElement('div');
  line.className = 'zeile-ut';
  const enemy = game && faction.key !== game.players[0].faction;
  const who = enemy ? `${faction.name} (Gegner)` : faction.name;
  line.innerHTML = `<b>${who}:</b> `;
  line.append(text);
  box.appendChild(line);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => line.remove(), Math.min(10000, 3500 + text.length * 55));
  if (renderer && x != null && renderer.onScreen(x, y, 0)) renderer.bubble(x, y, text, game.players[enemy ? 1 : 0].color);
}

// ------------------------------------------------------------ Bedienfeld

function costText(cost) {
  return Object.entries(cost).map(([g, n]) => `${GOODS[g].icon}${n}`).join(' ');
}

function buildPanel() {
  const box = $('#tab-bauen');
  box.innerHTML = '';
  const groups = {};
  for (const [type, def] of Object.entries(BUILDINGS)) {
    if (def.hidden) continue;
    (groups[def.group] ||= []).push([type, def]);
  }
  for (const [name, list] of Object.entries(groups)) {
    const h = document.createElement('div');
    h.className = 'gruppe';
    h.textContent = name;
    box.appendChild(h);
    for (const [type, def] of list) {
      const b = document.createElement('button');
      b.className = 'bau';
      b.dataset.type = type;
      b.title = def.desc;
      b.innerHTML = `<span class="ico">${def.icon}</span><span class="name">${def.name}</span><span class="kosten">${costText(def.cost)}</span>`;
      b.addEventListener('click', () => {
        sound.play('klick');
        setBuildMode(renderer.buildMode === type ? null : type);
      });
      box.appendChild(b);
    }
  }
  document.querySelectorAll('.tabs button').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === t));
      $('#tab-bauen').hidden = t.dataset.tab !== 'bauen';
      $('#tab-lager').hidden = t.dataset.tab !== 'lager';
    }));
}

function setBuildMode(type) {
  renderer.buildMode = type;
  if (type) renderer.selected = null;
  document.querySelectorAll('.bau').forEach((b) => b.classList.toggle('on', b.dataset.type === type));
}

function updateTopbar() {
  const s = game.stats(0);
  $('#leute').textContent = `👥 ${s.traeger} Träger (${s.idle} frei) · 🔨 ${s.arbeiter} · ⚔️ ${s.soldaten}`;
  const t = Math.floor(game.time);
  $('#uhr').textContent = `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function updatePanel() {
  const p = game.players[0];
  document.querySelectorAll('.bau').forEach((b) => {
    const cost = BUILDINGS[b.dataset.type].cost;
    b.classList.toggle('zuteuer', Object.entries(cost).some(([g, n]) => (p.stock[g] || 0) < n));
  });
  const lager = $('#tab-lager');
  if (lager.hidden) return;
  lager.innerHTML = Object.entries(GOODS)
    .map(([g, d]) => `<div class="ware"><span>${d.icon} ${d.name}</span><b>${p.stock[g] || 0}</b></div>`)
    .join('');
}

function updateInfo() {
  const box = $('#info');
  const b = renderer.selected;
  if (!b || !game.alive(b)) {
    box.hidden = true;
    renderer.selected = null;
    return;
  }
  box.hidden = false;
  const def = b.def;
  const owner = game.players[b.player];
  const key = `${b.id}:${b.player}:${b.state}:${game.statusText(b)}:${JSON.stringify(b.inStock)}:${JSON.stringify(b.out)}:${b.garrison.length}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  const goods = (o) => Object.entries(o).filter(([, n]) => n > 0).map(([g, n]) => `${GOODS[g].icon}${n}`).join(' ') || '–';
  let html = `<h3>${def.icon} ${def.name}</h3>
    <div class="zeile">Besitzer: <b style="color:${owner.color}">${owner.fx.name}</b></div>
    <div class="zeile">${game.statusText(b)}</div>`;
  if (b.state === 'baustelle') html += `<div class="zeile">Geliefert: ${goods(b.delivered)} von ${costText(def.cost)}</div>`;
  else if (b.type !== 'hq') {
    if (def.in) html += `<div class="zeile">Rohstoffe: ${goods(b.inStock)}</div>`;
    if (def.out) html += `<div class="zeile">Fertig: ${goods(b.out)}</div>`;
  }
  html += `<div class="zeile"><i>${def.desc}</i></div><div class="knoepfe">`;
  if (b.player === 0 && b.type !== 'hq') html += `<button data-act="abriss" class="gefahr">Abreißen</button>`;
  if (b.player !== 0 && def.territory && b.state === 'aktiv') {
    const n = game.attackersFor(0, b).length;
    html += `<button data-act="angriff" class="gefahr" ${n ? '' : 'disabled'}>⚔️ Angreifen (${n} verfügbar)</button>`;
  }
  html += `<button data-act="zu">Schließen</button></div>`;
  box.innerHTML = html;
  box.querySelectorAll('button').forEach((btn) =>
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'abriss') {
        game.destroyBuilding(b, 'abriss');
        sound.play('feuer');
      } else if (act === 'angriff') game.attack(0, b);
      renderer.selected = null;
      box.dataset.key = '';
      updateInfo();
    }));
}

// ------------------------------------------------------------ Eingabe

function setupInput() {
  const cv = $('#view');
  const pointers = new Map();
  let drag = null, pinch = null;

  cv.addEventListener('pointerdown', (e) => {
    sound.unlock();
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      drag = null;
    } else drag = { x: e.clientX, y: e.clientY, cx: renderer.cam.x, cy: renderer.cam.y, moved: false, button: e.button };
  });
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    renderer.hover = renderer.screenToTile(e.clientX - r.left, e.clientY - r.top);
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      renderer.zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinch.d);
      pinch.d = d;
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) {
      renderer.cam.x = drag.cx - dx / renderer.cam.zoom;
      renderer.cam.y = drag.cy - dy / renderer.cam.zoom;
      renderer.clampCam();
    }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      drag = null;
      return;
    }
    if (drag && !drag.moved && drag.button === 0) {
      const r = cv.getBoundingClientRect();
      click(e.clientX - r.left, e.clientY - r.top);
    }
    drag = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    drag = null;
    pinch = null;
  });
  cv.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    setBuildMode(null);
    renderer.selected = null;
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    renderer.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (!game || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === 'escape') {
      setBuildMode(null);
      renderer.selected = null;
    } else if (k === ' ') {
      e.preventDefault();
      setSpeed(speed === 0 ? 1 : 0);
    } else if (k === '1') setSpeed(1);
    else if (k === '2') setSpeed(2);
    else if (k === '3') setSpeed(4);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('resize', () => renderer?.resize());

  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
  const toggle = (id, fn) => {
    const b = $(id);
    b.addEventListener('click', () => {
      b.classList.toggle('on');
      fn(b.classList.contains('on'));
    });
  };
  toggle('#t-musik', (on) => sound.setEnabled('musik', on));
  toggle('#t-sprache', (on) => voice.setEnabled(on));
  toggle('#t-sfx', (on) => sound.setEnabled('sfx', on));
  $('#t-panel').addEventListener('click', () => $('#panel').classList.toggle('zu'));

  $('#mini').addEventListener('pointerdown', (e) => {
    const r = e.target.getBoundingClientRect();
    const m = game.map;
    renderer.centerOn(((e.clientX - r.left) / r.width) * m.w, ((e.clientY - r.top) / r.height) * m.h);
  });
}

function setSpeed(s) {
  speed = s;
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === s));
}

function click(sx, sy) {
  const t = renderer.screenToTile(sx, sy);
  if (renderer.buildMode) {
    const b = game.placeBuilding(0, renderer.buildMode, t.x, t.y);
    if (!b) sound.play('klick', 0.4);
    return;
  }
  // Gebäude ragen nach oben, deshalb auch das Feld darunter prüfen.
  const b = game.buildingAt(t.x, t.y) || game.buildingAt(t.x, t.y + 1);
  if (b) {
    renderer.selected = b;
    sound.play('klick');
    return;
  }
  const w = renderer.screenToWorld(sx, sy);
  let best = null, bd = 0.7;
  for (const u of game.units.values()) {
    if (!u.visible) continue;
    const d = Math.hypot(u.x - w.x / TILE, u.y - 0.35 - w.y / TILE);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  renderer.selected = null;
  if (best) {
    const fx = fxOf(game.players[best.player].faction);
    const ev = best.kind === 'soldat' ? 'klick_soldat' : best.kind === 'arbeiter' ? 'klick_arbeiter' : 'klick_traeger';
    voice.say(ev, fx, { priority: true, x: best.x - 0.5, y: best.y - 0.5 });
  }
}

buildStartScreen();
setupInput();

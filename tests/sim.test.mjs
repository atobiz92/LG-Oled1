// Headless-Simulation: zwei KI-Völker spielen gegeneinander. Prüft, dass die Wirtschaft läuft.
// Aufruf: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { AI } from '../src/ai.js';
import { findPath } from '../src/path.js';
import { GameMap } from '../src/map.js';
import { TERRAIN } from '../src/config.js';

function run(game, ais, seconds, dt = 0.1) {
  for (let t = 0; t < seconds; t += dt) {
    for (const ai of ais) ai.update(dt);
    game.update(dt);
    game.events.length = 0;
  }
}

test('Wegfindung umgeht Wasser', () => {
  const m = new GameMap(10, 10);
  m.terrain.fill(TERRAIN.GRAS);
  for (let y = 0; y < 9; y++) m.terrain[m.idx(5, y)] = TERRAIN.WASSER;
  const p = findPath(m, 1, 1, 8, 1);
  assert.ok(p, 'Weg gefunden');
  assert.deepEqual(p.at(-1), [8, 1]);
  assert.ok(p.some(([x, y]) => x === 5 && y === 9), 'läuft unten herum');
  for (let x = 0; x < 10; x++) m.terrain[m.idx(5, 9)] = TERRAIN.WASSER;
  assert.equal(findPath(m, 1, 1, 8, 1), null);
});

test('Spielstart: Hauptquartiere, Träger und Land', () => {
  const g = new Game({ seed: 3, factions: ['roemer', 'amazonen'], ai: [true, true] });
  assert.equal(g.players.length, 2);
  for (const p of g.players) {
    assert.ok(p.hq);
    assert.equal(g.map.owner[g.map.idx(p.hq.x, p.hq.y)], p.id);
    assert.ok(g.stats(p.id).traeger >= 10);
  }
});

for (const seed of [1, 2, 7]) {
  test(`KI gegen KI, 12 Spielminuten (Seed ${seed})`, () => {
    const g = new Game({ seed, factions: ['wikinger', 'amazonen'], ai: [true, true] });
    const ais = g.players.map((p) => new AI(g, p.id, { firstAttack: 99999 }));
    run(g, ais, 720);
    for (const p of g.players) {
      const built = [...g.buildings.values()].filter((b) => b.player === p.id && b.state === 'aktiv');
      const types = new Set(built.map((b) => b.type));
      assert.ok(built.length >= 8, `Spieler ${p.id}: nur ${built.length} fertige Gebäude`);
      assert.ok(types.has('saegewerk') && types.has('holzfaeller'), `Spieler ${p.id}: Holzwirtschaft fehlt`);
      assert.ok((p.produced.holz || 0) > 5, `Spieler ${p.id}: kaum Holz (${p.produced.holz})`);
      assert.ok((p.produced.bretter || 0) > 3, `Spieler ${p.id}: kaum Bretter (${p.produced.bretter})`);
      for (const [g2, n] of Object.entries(p.stock)) assert.ok(n >= 0, `negativer Bestand ${g2}`);
      for (const b of g.buildings.values()) {
        for (const [g2, n] of Object.entries(b.pending)) assert.ok(n >= 0, `negative Reservierung ${g2}`);
      }
    }
  });
}

test('Krieg: Angreifer erobern Turm oder fallen, nichts stürzt ab', () => {
  const g = new Game({ seed: 5, factions: ['roemer', 'aegypter'], ai: [true, true] });
  const ais = g.players.map((p) => new AI(g, p.id, { firstAttack: 300 }));
  run(g, ais, 1500);
  const s = g.players.map((p) => g.stats(p.id));
  assert.ok(s.every((x) => x.traeger >= 0));
  console.log('Nach 25 Min:', JSON.stringify(s), 'Sieger:', g.winner,
    'Produziert:', g.players.map((p) => JSON.stringify(p.produced)).join(' | '));
});

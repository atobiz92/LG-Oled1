// Jedes Ereignis, das das Spiel sprechen lässt, braucht für jedes Volk mindestens einen Spruch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LINES } from '../src/voice.js';
import { FACTIONS } from '../src/config.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const used = new Set([...main.matchAll(/voice\.say\(\s*['`]([a-z_]+)/g)].map((m) => m[1]).filter((e) => !e.endsWith('_')));
for (const what of ['baeume', 'felsen', 'fische']) used.add(`mangel_${what}`);
for (const kind of ['traeger', 'arbeiter', 'soldat']) used.add(`klick_${kind}`);

test('alle verwendeten Ereignisse haben Sprüche für jedes Volk', () => {
  assert.ok(used.size > 10);
  for (const ev of used) {
    assert.ok(LINES[ev], `Keine Sprüche für ${ev}`);
    for (const f of Object.keys(FACTIONS)) {
      const n = (LINES[ev][f]?.length || 0) + (LINES[ev].alle?.length || 0);
      assert.ok(n > 0, `${ev}: nichts für ${f}`);
    }
  }
});

test('Sprüche sind nicht leer und nicht doppelt', () => {
  const seen = new Set();
  for (const sets of Object.values(LINES)) {
    for (const lines of Object.values(sets)) {
      for (const l of lines) {
        assert.ok(l.trim().length > 5);
        assert.ok(!seen.has(l), `doppelt: ${l}`);
        seen.add(l);
      }
    }
  }
});

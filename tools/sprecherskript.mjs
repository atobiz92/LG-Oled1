// Erzeugt docs/VERTONUNG.md – das Sprecherskript für eine echte Studio-Vertonung.
// Aufruf: node tools/sprecherskript.mjs
import { writeFileSync } from 'node:fs';
import { LINES } from '../src/voice.js';
import { FACTIONS } from '../src/config.js';

const ANLASS = {
  start: 'Spielbeginn',
  bau_platziert: 'Spieler setzt eine Baustelle',
  bau_fertig: 'Gebäude fertiggestellt',
  arbeiter_da: 'Arbeiter tritt Dienst an',
  mangel_baeume: 'Holzfäller findet keine Bäume',
  mangel_felsen: 'Steinmetz findet keine Felsen',
  mangel_fische: 'Fischer findet keine Fische',
  lager_leer: 'Keine Bretter mehr im Lager',
  einzug: 'Neuer Träger zieht ins Wohnhaus',
  soldat_neu: 'Kaserne bildet Soldat aus',
  angriff: 'Spieler befiehlt Angriff',
  wir_werden_angegriffen: 'Gegner greift an',
  erobert: 'Turm erobert',
  verloren: 'Eigener Turm verloren',
  brand: 'Gebäude brennt ab',
  sieg: 'Spiel gewonnen',
  niederlage: 'Spiel verloren',
  klick_traeger: 'Spieler klickt Träger an',
  klick_arbeiter: 'Spieler klickt Arbeiter an',
  klick_soldat: 'Spieler klickt Soldat an',
  gegner_spott: 'Gegner stichelt (ab und zu)',
};

const SPRECHER = {
  alle: 'Volksstimme (alle Völker, Sprecher passend zum gewählten Volk)',
  ...Object.fromEntries(Object.entries(FACTIONS).map(([k, f]) => [k, `${f.name} – ${f.women ? 'weiblich' : 'männlich'}`])),
};

let md = `# Sprecherskript „Die Siedelei“

> Automatisch erzeugt aus \`src/voice.js\` mit \`node tools/sprecherskript.mjs\`. Nicht von Hand bearbeiten,
> sondern die Sprüche in \`src/voice.js\` ändern und das Skript neu laufen lassen.

Im Spiel werden die Sätze über die Sprachausgabe des Browsers gesprochen. Für eine echte Vertonung
nimmt man jede Zeile als eigene Datei auf. Der Dateiname steht in der Spalte **Datei**.

## Regieanweisungen

| Volk | Stimme | Tonfall |
|---|---|---|
| Römer | männlich, mittlere Lage | bürokratisch-stolz, leicht genervt |
| Wikinger | männlich, tief und laut | polternd, begeistert, etwas zu laut |
| Ägypter | männlich, klar | trocken, sarkastisch, majestätisch übertrieben |
| Amazonen | weiblich, kraftvoll | selbstbewusst, schlagfertig, frech gegenüber den Männervölkern |

Aufnahmeformat: 44,1 kHz, 16 Bit, mono, OGG oder WAV. Zwischen 0,3 s Stille vorne und hinten.

`;

let total = 0;
for (const [event, sets] of Object.entries(LINES)) {
  md += `## ${ANLASS[event] || event} (\`${event}\`)\n\n| Datei | Sprecher | Text |\n|---|---|---|\n`;
  for (const [who, lines] of Object.entries(sets)) {
    lines.forEach((line, i) => {
      const file = `${who}_${event}_${String(i + 1).padStart(2, '0')}.ogg`;
      md += `| \`${file}\` | ${SPRECHER[who] || who} | ${line.replace(/\|/g, '\\|')} |\n`;
      total++;
    });
  }
  md += '\n';
}
md += `---\nInsgesamt **${total} Sätze**.\n`;

writeFileSync(new URL('../docs/VERTONUNG.md', import.meta.url), md);
console.log(`docs/VERTONUNG.md geschrieben (${total} Sätze).`);

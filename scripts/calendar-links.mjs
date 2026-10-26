// Writes the calendar links into a build, read from the Mac's Keychain. The links are secrets:
// they never go into git, config or logs, and this script prints only names and ok/missing.
//
//   node scripts/calendar-links.mjs <build>/js/calendar-links.js
//
// config.local.js names each calendar and its Keychain entry (service name):
//   calendar: { sources: [{ name: 'Privat', keychain: 'ordiscale-launcher-kalender-privat' }] }
// Store a link once with:  security add-generic-password -a "$USER" -s <entry> -w
// (the -w without a value makes macOS ask for it, so it never lands in the shell history).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const out = process.argv[2];
if (!out) {
    console.error('Usage: node scripts/calendar-links.mjs <build>/js/calendar-links.js');
    process.exit(1);
}

const sandbox = { window: {} };
try {
    vm.runInNewContext(readFileSync(resolve(import.meta.dirname, '..', 'src/js/config.local.js'), 'utf8'), sandbox);
} catch {
    // No local config: no calendars.
}
const sources = (sandbox.window.LAUNCHER_LOCAL?.calendar?.sources) || [];

const links = {};
for (const s of sources) {
    if (!s.name || !s.keychain) continue;
    let url = '';
    try {
        url = execFileSync('security', ['find-generic-password', '-s', s.keychain, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        // Not in the Keychain (yet).
    }
    if (/^(https|webcal):\/\//i.test(url)) {
        links[s.name] = url;
        console.log(`Kalender ${s.name}: ok`);
    } else {
        console.log(`Kalender ${s.name}: kein gültiger Link im Schlüsselbund-Eintrag "${s.keychain}"`);
    }
}

writeFileSync(out, '/* Generated at install time from the Keychain. Not in git. */\n' +
    'window.LAUNCHER_CALENDAR_LINKS = ' + JSON.stringify(links) + ';\n');

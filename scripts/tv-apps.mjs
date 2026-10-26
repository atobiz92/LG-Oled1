// Reads the apps installed on the TV from the PC and writes them to src/js/tv-apps.js (gitignored),
// so the launcher knows them even where the TV refuses it the list (js/apps.js, fallback 'pc').
//
//   node scripts/tv-apps.mjs [TV-IP]
//
// Same interface as LG's phone app (LG Connect Apps, ws://<TV>:3000). The first time, the TV asks
// whether "Ordiscale Launcher (PC)" may connect: answer Yes on the remote. The key the TV hands out
// is kept in the user's home folder (~/.ordiscale-launcher/tv-key.json), never in the repo.
// The TV's address: the argument, TV_IP, or the ares device "tv" (TV_DEVICE).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const outFile = join(root, 'src', 'js', 'tv-apps.js');
const keyDir = join(homedir(), '.ordiscale-launcher');
const keyFile = join(keyDir, 'tv-key.json');
const device = process.env.TV_DEVICE || 'tv';

function tvAddress() {
    const given = process.argv[2] || process.env.TV_IP;
    if (given) return given;
    // "tv   prisoner@192.168.1.20:9922   ssh   tv" in the device list of the webOS CLI
    const r = spawnSync('ares-setup-device --list', { encoding: 'utf8', shell: true });
    const line = (r.stdout || '').split(/\r?\n/).find((l) => l.trim().split(/\s+/)[0] === device);
    const m = line && /@([\d.]+):/.exec(line);
    if (!m) {
        console.error('TV-Adresse unbekannt: node scripts/tv-apps.mjs <TV-IP>');
        process.exit(2);
    }
    return m[1];
}

function loadKey() {
    try { return JSON.parse(readFileSync(keyFile, 'utf8')).key || null; } catch { return null; }
}

function saveKey(key) {
    mkdirSync(keyDir, { recursive: true });
    writeFileSync(keyFile, JSON.stringify({ key }), { mode: 0o600 });
}

function listApps(ip) {
    return new Promise((resolvePromise, reject) => {
        if (typeof WebSocket !== 'function') {
            reject(new Error('Node 22 oder neuer nötig (WebSocket)'));
            return;
        }
        const ws = new WebSocket(`ws://${ip}:3000`);
        const timer = setTimeout(() => { ws.close(); reject(new Error('Keine Antwort vom TV (LG Connect Apps an?)')); }, 90000);
        const done = (fn, v) => { clearTimeout(timer); ws.close(); fn(v); };
        ws.onerror = () => done(reject, new Error(`TV unter ${ip}:3000 nicht erreichbar (LG Connect Apps an?)`));
        ws.onopen = () => {
            const payload = {
                forcePairing: false,
                pairingType: 'PROMPT',
                manifest: { manifestVersion: 1, appVersion: '1.0', permissions: ['READ_INSTALLED_APPS'] }
            };
            const key = loadKey();
            if (key) payload['client-key'] = key;
            ws.send(JSON.stringify({ type: 'register', id: 'reg', payload }));
        };
        ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'error') {
                done(reject, new Error('Vom TV abgelehnt: ' + msg.error));
                return;
            }
            if (msg.id === 'reg' && msg.payload && msg.payload.pairingType === 'PROMPT' && msg.type === 'response') {
                console.log('Bitte am TV mit der Fernbedienung „Ja“ wählen …');
                return;
            }
            if (msg.type === 'registered') {
                if (msg.payload['client-key']) saveKey(msg.payload['client-key']);
                ws.send(JSON.stringify({ type: 'request', id: 'apps', uri: 'ssap://com.webos.applicationManager/listLaunchPoints' }));
                return;
            }
            if (msg.id === 'apps') done(resolvePromise, msg.payload.launchPoints || []);
        };
    });
}

const ip = tvAddress();
console.log(`Lese die Apps vom TV ${ip} …`);
try {
    const points = await listApps(ip);
    const apps = points.map((p) => ({
        id: p.id,
        name: p.title || p.id,
        system: !!p.systemApp,
        show: p.visible !== false,
        icon: p.largeIcon || p.icon || ''
    }));
    writeFileSync(outFile,
        '/* Written by scripts/tv-apps.mjs from the apps installed on the TV. Not in git. */\n' +
        'window.TV_APPS = ' + JSON.stringify({ read: new Date().toISOString(), apps }, null, 1) + ';\n');
    console.log(`${apps.length} Apps nach src/js/tv-apps.js geschrieben.`);
} catch (err) {
    console.error(err.message);
    // Keep an older list if there is one; the build goes on either way.
    if (!existsSync(outFile)) writeFileSync(outFile, '/* No list read from the TV yet (scripts/tv-apps.mjs). */\nwindow.TV_APPS = null;\n');
    process.exitCode = 1;
}

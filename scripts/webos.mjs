// Builds and installs the launcher on an LG webOS TV with the webOS CLI (ares-*).
//
//   node scripts/webos.mjs package   src/ → build/com.tobias.launcher_<version>_all.ipk
//   node scripts/webos.mjs install   build it and install it on the TV
//   node scripts/webos.mjs launch    start it on the TV
//
// The TV is the ares device named "tv" (ares-setup-device), or the one in TV_DEVICE.
// Works on Windows, macOS and Linux; the CLI must be on PATH (npm install -g @webos-tools/cli).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const src = join(root, 'src');
const out = join(root, 'build');
const stage = join(out, 'stage');
const app = JSON.parse(readFileSync(join(src, 'appinfo.json'), 'utf8'));
const ipk = join(out, `${app.id}_${app.version}_all.ipk`);
const device = process.env.TV_DEVICE || 'tv';

// Same exclusions as the UI kit's build.sh: mark sources (coloured copies are in img/tiles),
// icon sources (inlined by icons.js) and the private easter-egg pictures.
const SKIP = [/^img\/marks(\/|$)/, /^img\/icons\/.*\.svg$/, /^img\/easter-egg\/.*\.(jpg|png)$/,
    /(^|\/)\./, /(^|\/)Thumbs\.db$/];

function run(cmd, args) {
    // Through the shell so that Windows finds ares-*.cmd; one command string (paths are quoted below),
    // since Node 24 warns about separate arguments with shell: true (DEP0190).
    const r = spawnSync([cmd].concat(args).join(' '), { stdio: 'inherit', shell: true });
    if (r.status !== 0) process.exit(r.status || 1);
}

function quote(p) {
    return '"' + p + '"';
}

function pack() {
    // index.html always loads config.local.js; it is gitignored, so a fresh clone has none.
    const local = join(src, 'js', 'config.local.js');
    if (!existsSync(local)) writeFileSync(local, '/* No local overrides. See config.local.example.js. */\n');
    run('node', [quote(join(root, 'scripts', 'build-marks.mjs'))]);

    rmSync(stage, { recursive: true, force: true });
    mkdirSync(stage, { recursive: true });
    cpSync(src, stage, {
        recursive: true,
        filter: (from) => {
            const rel = relative(src, from);
            return !rel || !SKIP.some((re) => re.test(rel.split(sep).join('/')));
        }
    });
    // --no-minify: the code goes onto the TV exactly as reviewed.
    run('ares-package', ['--no-minify', '-o', quote(out), quote(stage)]);
    rmSync(stage, { recursive: true, force: true });
    console.log('Built ' + relative(root, ipk));
}

// Always from a fresh build, so an old .ipk of the same version never ends up on the TV.
function install() {
    pack();
    run('ares-install', ['--device', device, quote(ipk)]);
}

function launch() {
    run('ares-launch', ['--device', device, app.id]);
}

const steps = { package: pack, install, launch };
const step = steps[process.argv[2]];
if (!step) {
    console.error('Usage: node scripts/webos.mjs package | install | launch');
    process.exit(2);
}
step();

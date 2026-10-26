/* Home, All apps and Lab screens; app list loading, launching and HDMI inputs. */
(function () {
    'use strict';

    var CACHE_KEY = 'arn0.apps.v1';
    var REFRESH_AFTER_MS = 5 * 60 * 1000;
    var GRID_COLS = 5;

    var cfg = window.LAUNCHER_CONFIG;
    var log = DevLog.log;
    var $ = UI.$;
    var el = UI.el;
    var KEY = UI.KEY;

    var state = {
        apps: [],              // launchable apps from the TV (or the cache)
        appsSig: null,
        lastFetch: 0,
        showEverything: false, // All apps: bypass the consumer filter
        tvMode: false,         // HDMI shown inside the launcher
        appsShown: false,      // first render with apps done (focus moves off the gear then)
        moving: null,          // id of the app being moved on Home (held OK → Bewegen)
        moveOrder: null,       // the whole Home order while moving, saved on OK
        hdmi: {},              // last known { port: connected }
        tv: null               // does the TV report a TV source (tuner)? null until the first read
    };

    // Virtual app: the "Fernsehen" tile switches the TV to its tuner instead of launching an app.
    var TUNER_ID = 'tv-tuner';
    // Virtual app: the "Home Assistant" tile opens the view "Zuhause" (js/ha-view.js). Unlike the
    // tuner it is an ordinary app tile: in the grid, or a favourite, and it can be moved.
    var HA_ID = 'home-assistant';

    // ---------- Tiles

    // Pre-coloured by scripts/build-marks.mjs
    function markEl(brand) {
        var m = new Image();
        m.className = 'mark';
        m.src = 'img/tiles/' + brand.key + '.svg';
        if (brand.pad) {
            m.style.top = brand.pad[0] + '%';
            m.style.height = (100 - 2 * brand.pad[0]) + '%';
            m.style.left = brand.pad[1] + '%';
            m.style.width = (100 - 2 * brand.pad[1]) + '%';
        }
        return m;
    }

    function initials(label) {
        var words = label.replace(/[^\w\s+]/g, ' ').trim().split(/\s+/);
        return (words[0] ? words[0][0] : '?') + (words[1] ? words[1][0] : '');
    }

    function hue(text) {
        var h = 0;
        for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
        return h;
    }

    /*
     * The TV's own icon for apps without a bundled logo, full-bleed like Netflix's black field with
     * the N: centred, whole, never blurred, its own edges continued to the tile's (composeIcon).
     * Where the TV lets the page read the icon, an analysis also finds a transparent margin (cut
     * away, so the plate reaches the tile) and a free-standing logo without plate (kept whole on the
     * brand colour or a neutral dark). Worked out once per icon: in memory for this session, the
     * colour and visible area also in localStorage, so a restart needs no analysis.
     */
    var ICON_STORE_KEY = 'arn0.iconbg.v1';
    var ICON_STORE_MAX = 200;
    var ICON_SAMPLE = 64;           // analysis canvas, px per side
    var NEUTRAL_TILE = '#1c1c1e';
    var iconMemo = {};              // path -> { color, box, readable } for this session
    var iconStore = null;           // path -> { c: '#rrggbb' | '', b: [x0, y0, x1, y1] in 0..1 }

    function readIconStore() {
        if (iconStore) return iconStore;
        try {
            iconStore = JSON.parse(localStorage.getItem(ICON_STORE_KEY)) || {};
        } catch (e) {
            iconStore = {};
        }
        return iconStore;
    }

    function saveIconStore(path, entry) {
        var store = readIconStore();
        store[path] = entry;
        var keys = Object.keys(store);
        if (keys.length > ICON_STORE_MAX) delete store[keys[0]];
        try {
            localStorage.setItem(ICON_STORE_KEY, JSON.stringify(store));
        } catch (e) {
            // Without the store the colour is only worked out again next start.
        }
    }

    function hex(n) { return (n < 16 ? '0' : '') + n.toString(16); }

    // Throws on a canvas the engine considers tainted (an icon it will not let a page read).
    function analyseIcon(img) {
        var n = ICON_SAMPLE;
        var c = document.createElement('canvas');
        c.width = n;
        c.height = n;
        var g = c.getContext('2d');
        g.drawImage(img, 0, 0, n, n);
        var d = g.getImageData(0, 0, n, n).data;
        var x0 = n, y0 = n, x1 = -1, y1 = -1;
        for (var y = 0; y < n; y++) {
            for (var x = 0; x < n; x++) {
                if (d[(y * n + x) * 4 + 3] < 128) continue;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        if (x1 < 0) return { c: '', b: [0, 0, 1, 1] };
        // One pixel inside the visible area, past the anti-aliased edge.
        var ix0 = Math.min(x0 + 1, x1), iy0 = Math.min(y0 + 1, y1);
        var ix1 = Math.max(x1 - 1, ix0), iy1 = Math.max(y1 - 1, iy0);
        var bins = {};
        var total = 0, solid = 0;
        function sample(px, py) {
            var i = (py * n + px) * 4;
            total++;
            if (d[i + 3] < 200) return;
            solid++;
            var key = (d[i] >> 4) + '.' + (d[i + 1] >> 4) + '.' + (d[i + 2] >> 4);
            var bin = bins[key] || (bins[key] = { n: 0, r: 0, g: 0, b: 0 });
            bin.n++;
            bin.r += d[i];
            bin.g += d[i + 1];
            bin.b += d[i + 2];
        }
        for (var sx = ix0; sx <= ix1; sx++) {
            sample(sx, iy0);
            if (iy1 !== iy0) sample(sx, iy1);
        }
        for (var sy = iy0 + 1; sy < iy1; sy++) {
            sample(ix0, sy);
            if (ix1 !== ix0) sample(ix1, sy);
        }
        var box = [x0 / n, y0 / n, (x1 + 1) / n, (y1 + 1) / n];
        // Mostly transparent along the edge: no plate of its own to extend.
        if (solid < total * 0.5) return { c: '', b: box };
        var best = null;
        Object.keys(bins).forEach(function (k) { if (!best || bins[k].n > best.n) best = bins[k]; });
        return {
            c: '#' + hex(Math.round(best.r / best.n)) + hex(Math.round(best.g / best.n)) + hex(Math.round(best.b / best.n)),
            b: box
        };
    }

    // What the analysis says about an icon: its plate colour and visible area, or nothing when the
    // TV does not let the page read the icon (a tainted canvas). Then the icon counts as a full plate.
    function iconLook(img, path) {
        if (iconMemo[path]) return iconMemo[path];
        var look = { color: '', box: null, readable: false };
        try {
            var info = readIconStore()[path];
            if (!info) {
                info = analyseIcon(img);
                saveIconStore(path, info);
            }
            look = { color: info.c, box: info.b, readable: true };
        } catch (e) {
            // Not readable: drawing it still works, which is all the edge extension below needs.
        }
        iconMemo[path] = look;
        return look;
    }

    /*
     * Full-bleed icon without reading a single pixel: on a canvas the size of the tile the icon sits
     * centred and whole, and its own outermost columns (or rows) are stretched out to the tile's edges.
     * A plain plate continues as that colour, a gradient continues as itself, so there is no seam and
     * no square on the tile, and it works even where the TV will not let the page read its icons.
     * The columns sit a few percent inside the icon (past an anti-aliased edge); a band from the
     * middle 70% is drawn first, so the transparent round corners of a squircle icon show the plate's
     * colour instead of a notch. Drawn at 1.25x for the focus zoom.
     */
    var ICON_INSET = 0.03;
    var ICON_BAND = 0.15;           // the band skips this much at both ends (round corners)
    var ICON_OVERLAP = 0.12;        // the extension reaches this far under the icon (its corners)
    var ICON_SCALE = 1.25;

    function composeIcon(tile, img, look) {
        var w = tile.offsetWidth, h = tile.offsetHeight;
        // Not laid out yet (Home hidden): a wide canvas; object-fit: cover trims only extension.
        if (!w || !h) { w = 400; h = 200; }
        var cw = Math.round(w * ICON_SCALE), ch = Math.round(h * ICON_SCALE);
        var iw = img.naturalWidth, ih = img.naturalHeight;
        var b = look.box || [0, 0, 1, 1];
        var sx = b[0] * iw, sy = b[1] * ih, sw = (b[2] - b[0]) * iw, sh = (b[3] - b[1]) * ih;
        var k = Math.min(cw / sw, ch / sh);
        var dw = sw * k, dh = sh * k, dx = (cw - dw) / 2, dy = (ch - dh) / 2;
        var c = document.createElement('canvas');
        c.className = 'icon-art icon-canvas';
        c.width = cw;
        c.height = ch;
        var g = c.getContext('2d');
        if (dx > 0.5) {
            var ov = dw * ICON_OVERLAP;
            var left = sx + sw * ICON_INSET, right = sx + sw * (1 - ICON_INSET) - 1;
            g.drawImage(img, left, sy + sh * ICON_BAND, 1, sh * (1 - 2 * ICON_BAND), 0, 0, dx + ov, ch);
            g.drawImage(img, right, sy + sh * ICON_BAND, 1, sh * (1 - 2 * ICON_BAND), dx + dw - ov, 0, cw - dx - dw + ov, ch);
            g.drawImage(img, left, sy, 1, sh, 0, dy, dx + ov, dh);
            g.drawImage(img, right, sy, 1, sh, dx + dw - ov, dy, cw - dx - dw + ov, dh);
        }
        if (dy > 0.5) {
            var ovy = dh * ICON_OVERLAP;
            var top = sy + sh * ICON_INSET, bottom = sy + sh * (1 - ICON_INSET) - 1;
            g.drawImage(img, sx + sw * ICON_BAND, top, sw * (1 - 2 * ICON_BAND), 1, 0, 0, cw, dy + ovy);
            g.drawImage(img, sx + sw * ICON_BAND, bottom, sw * (1 - 2 * ICON_BAND), 1, 0, dy + dh - ovy, cw, ch - dy - dh + ovy);
            g.drawImage(img, sx, top, sw, 1, dx, 0, dw, dy + ovy);
            g.drawImage(img, sx, bottom, sw, 1, dx, dy + dh - ovy, dw, ch - dy - dh + ovy);
        }
        g.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
        return c;
    }

    // Installed apps report a native path; it may or may not be readable from a web app.
    // base: the tile's colour behind it (brand colour, else neutral): what a free-standing logo
    // (no plate of its own, known only when the icon is readable) sits on.
    function tryIcon(tile, fallback, path, base) {
        var img = new Image();
        img.className = 'icon-art';
        img.onload = function () {
            var look = iconLook(img, path);
            fallback.style.display = 'none';
            tile.style.background = look.color || base;
            if (look.readable && !look.color) {
                tile.appendChild(img);          // free-standing logo: whole, on the brand colour
                return;
            }
            try {
                tile.appendChild(composeIcon(tile, img, look));
            } catch (e) {
                tile.appendChild(img);
            }
        };
        img.src = path.charAt(0) === '/' ? 'file://' + path : path;
    }

    function tileFace(item) {
        var tile = el('div', 'tile');
        if (item.brand) {
            tile.style.background = item.brand.bg;
            if (item.brand.text) {
                var word = el('div', 'wordmark' + (item.brand.long ? ' long' : ''), item.brand.text);
                word.style.color = item.brand.fg;
                tile.appendChild(word);
                // No free mark for this brand: the TV's own app icon replaces the word when readable.
                if (item.iconPath) tryIcon(tile, word, item.iconPath, item.brand.bg);
            } else {
                tile.appendChild(markEl(item.brand));
            }
        } else {
            // Unknown app: a calm two-tone tile in a colour from its name, initials until its icon loads.
            var h = hue(item.label);
            tile.style.background = 'linear-gradient(160deg, hsl(' + h + ',38%,32%), hsl(' + h + ',42%,16%))';
            var mono = el('div', 'mono', initials(item.label).toUpperCase());
            tile.appendChild(mono);
            if (item.iconPath) tryIcon(tile, mono, item.iconPath, NEUTRAL_TILE);
        }
        return tile;
    }

    function appTile(item) {
        var wrap = el('div', 'app');
        wrap.appendChild(tileFace(item));
        wrap.appendChild(el('div', 'label', item.label));
        wrap._item = item;
        return wrap;
    }

    // Small tile used in Settings lists.
    function miniTile(item) {
        var wrap = el('div', 'mini');
        wrap.appendChild(tileFace(item));
        return wrap;
    }

    function inputTile(input) {
        var brand = findBrand(input.brand || '') || { bg: '#2a2f3a', fg: '#fff', mark: null };
        var wrap = el('div', 'input');
        var tile = el('div', 'tile');
        tile.style.background = brand.bg;
        if (brand.mark) tile.appendChild(markEl(brand));
        var meta = el('div', 'meta');
        meta.appendChild(el('div', 'name', input.label));
        var port = el('div', 'port');
        var dot = el('span', 'dot');
        port.appendChild(dot);
        port.appendChild(document.createTextNode('HDMI ' + input.hdmi));
        meta.appendChild(port);
        tile.appendChild(meta);
        wrap.appendChild(tile);
        wrap._item = { kind: 'input', hdmi: input.hdmi, label: input.label, method: input.method };
        wrap._dot = dot;
        return wrap;
    }

    // Console tile for Settings lists: brand colours and logo only.
    function miniInputTile(input) {
        var brand = findBrand(input.brand || '');
        return miniTile({ label: input.label, brand: brand && { key: brand.key, bg: brand.bg, fg: brand.fg, mark: brand.mark } });
    }

    // "Fernsehen" in the Konsolen row, drawn like an HDMI tile (no connection dot).
    function tunerTile() {
        var brand = findBrand('tvtuner');
        var wrap = el('div', 'input');
        var tile = el('div', 'tile');
        tile.style.background = brand.bg;
        tile.appendChild(markEl(brand));
        var meta = el('div', 'meta');
        meta.appendChild(el('div', 'name', 'Fernsehen'));
        meta.appendChild(el('div', 'port', 'Kabel, Satellit, Antenne'));
        tile.appendChild(meta);
        wrap.appendChild(tile);
        wrap._item = { kind: 'tuner', label: 'Fernsehen' };
        wrap._dot = null;
        return wrap;
    }

    // ---------- Home content

    // Consoles: edited list from Settings, else config.js.
    function inputs() {
        return Prefs.get().inputs || cfg.inputs || [];
    }

    // Only what is plugged in right now: one tile per HDMI port the TV reports as connected, with
    // the name and logo from Settings → Konsolen when the port has an entry there, otherwise
    // "Neues Gerät". Nothing connected, no Konsolen row. The TV gives web apps the port and whether
    // something is connected, not the device's name.
    function homeInputs() {
        var byPort = {};
        inputs().forEach(function (i) { byPort[i.hdmi] = i; });
        return Object.keys(state.hdmi)
            .filter(function (port) { return state.hdmi[port] === true; })
            .sort()
            .map(function (port) { return byPort[port] || { hdmi: Number(port), label: 'Neues Gerät' }; })
            .filter(function (input) { return !input.hidden; });
    }

    function connectedPorts() {
        return Object.keys(state.hdmi).filter(function (p) { return state.hdmi[p] === true; }).sort().join();
    }

    function setInputs(list) {
        Prefs.get().inputs = list;
        Prefs.save();
        renderHome();
    }

    // The tile exists only when the TV reports a TV source and Settings → Konsolen & HDMI allows it.
    function tunerSupported() {
        return state.tv === true;
    }

    function tunerAvailable() {
        return tunerSupported() && Prefs.get().tuner.enabled !== false;
    }

    function tunerItem() {
        return { kind: 'app', id: TUNER_ID, label: 'Fernsehen', brand: findBrand('tvtuner'), iconPath: '', virtual: true };
    }

    // Only with an address and a sign-in (or one Home Assistant refused, so the view can say so):
    // without them the view could show nothing but the gap.
    function haAvailable() {
        return !!(window.HA && (HA.configured() || (HA.hasUrl() && HA.loginExpired())));
    }

    function haItem() {
        return { kind: 'app', id: HA_ID, label: 'Home Assistant', brand: findBrand('homeassistant'), iconPath: '', virtual: true };
    }

    // Every app not in the Home list, alphabetically: the installed ones plus the virtual Home Assistant.
    function otherApps() {
        var list = Apps.allSorted(state.apps, false);
        if (!haAvailable()) return list;
        return list.concat([haItem()]).sort(function (x, y) { return x.label.localeCompare(y.label); });
    }

    // Entries shown on Home: edited list from Settings, else config.js.
    function homeEntries() {
        return Prefs.get().home || cfg.apps || [];
    }

    function homeItems() {
        var virtual = {};
        if (tunerAvailable()) virtual[TUNER_ID] = tunerItem();
        if (haAvailable()) virtual[HA_ID] = haItem();
        return Apps.curated(state.apps, { apps: homeEntries(), virtual: virtual });
    }

    // Puts an app (or the tuner) first in the Home list, moving it if it is already there.
    function placeFirst(item) {
        var items = homeItems();
        var at = indexOfApp(items, item.id);
        if (at >= 0) item = items.splice(at, 1)[0];
        items.unshift(item);
        setHomeItems(items);
    }

    function setHomeItems(items) {
        // The tuner is a favourite or the first Konsolen tile, never part of the grid: behind the
        // favourites it drops out of the list again.
        items = items.filter(function (i, n) { return i.id !== TUNER_ID || n < FAVORITES; });
        Prefs.get().home = items.map(function (i) {
            var entry = { id: i.id, label: i.label };
            if (i.brand) entry.brand = i.brand.key;
            return entry;
        });
        Prefs.save();
        renderHome();
    }

    var FAVORITES = 5;   // favourites row: five 300px tiles fill the 1680px row exactly

    // What has focus on Home, by identity rather than by row and column, so a re-render that adds
    // or removes a row (a console plugged in, a fresh app list) keeps the same tile selected.
    function focusedKey() {
        var el = document.querySelector('#home .focused');
        var it = el && el._item;
        if (!it) return null;
        return it.kind === 'app' ? 'app:' + it.id : it.kind === 'input' ? 'input:' + it.hdmi : it.kind;
    }

    function tileKey(t) {
        var it = t._item;
        return it.kind === 'app' ? 'app:' + it.id : it.kind === 'input' ? 'input:' + it.hdmi : it.kind;
    }

    function renderHome() {
        var keep = UI.isVisible('home') ? focusedKey() : null;
        var row = $('apps-row');
        row.innerHTML = '';
        var items = state.moveOrder || homeItems();
        // Behind the favourites the tuner is not a grid tile but the first one of the Konsolen row.
        // While moving it stays in the order, so the indexes match what is on screen until OK.
        var tunerAt = indexOfApp(items, TUNER_ID);
        var tunerInHome = tunerAt >= 0 && (tunerAt < FAVORITES || !!state.moving);
        if (tunerAt >= 0 && !tunerInHome) {
            items = items.slice();
            items.splice(tunerAt, 1);
        }
        if (!items.length) items = Apps.allSorted(state.apps, false).slice(0, FAVORITES);
        // As on Apple TV: the first five are the favourites row, which fits the screen without
        // scrolling sideways; the rest of the Home list follows in the grid in its own order, then
        // every other installed app alphabetically (the Red key's page stays for system apps).
        items.slice(0, FAVORITES).forEach(function (item) { row.appendChild(appTile(item)); });

        var listed = {};
        items.forEach(function (item) { listed[item.id] = true; });
        var grid = $('home-grid');
        grid.innerHTML = '';
        items.slice(FAVORITES).forEach(function (item) { grid.appendChild(appTile(item)); });
        otherApps().forEach(function (item) {
            if (!listed[item.id]) grid.appendChild(appTile(item));
        });
        $('grid-section').classList.toggle('hidden', !grid.children.length);

        if (state.moving) {
            UI.children(row).concat(UI.children(grid)).forEach(function (t) {
                t.classList.toggle('moving', t._item.id === state.moving);
            });
        }

        var row2 = $('inputs-row');
        row2.innerHTML = '';
        var lead = tunerAvailable() && !tunerInHome;
        if (lead) row2.appendChild(tunerTile());
        homeInputs().forEach(function (input) { row2.appendChild(inputTile(input)); });
        $('inputs-title').textContent = lead ? 'Fernsehen & Konsolen' : 'Konsolen';
        $('inputs-section').classList.toggle('hidden', !row2.children.length);
        applyInputStatus();
        // On a first start without a cached app list, Home opens with only the gear to focus; the
        // first real list then puts focus on the first favourite instead of leaving it up there.
        // A list rendered before Home is shown counts as that first list (startRow does the rest).
        var first = !state.appsShown && row.firstChild;
        if (row.firstChild) state.appsShown = true;
        if (!UI.isVisible('home')) return;
        // Home with tiles on screen: the launcher's own start time ends here (js/launchtimes.js).
        if (row.firstChild) LaunchTimes.launcherReady();
        if (first) {
            UI.focusOn(row.firstChild);
            return;
        }
        var tiles = [$('agenda'), $('gear')].concat(UI.children(row), UI.children(row2), UI.children(grid));
        var again = keep && tiles.find(function (t) { return t._item && tileKey(t) === keep; });
        if (again) UI.focusOn(again);
        else UI.refresh();
    }

    // ---------- Scrolling: Home moves as a whole once focus leaves the first row. The top shelf,
    // clock and gear fade and the wallpaper dims, as on Apple TV. One transform on one layer.

    var HOME_GRID_COLS = 5;   // must match .home-grid in tvos.css
    var SCROLL_MARGIN = 120;  // where a scrolled-to row sits below the top edge

    function offsetIn(el, ancestor) {
        var y = 0;
        while (el && el !== ancestor) {
            y += el.offsetTop;
            el = el.offsetParent;
        }
        return y;
    }

    function scrollHome(target) {
        var scroller = $('home-scroll');
        var section = target.parentNode;
        // The gear sits outside the scroller: the walk then ends at the document, which has no classList.
        while (section && section.classList && section !== scroller && !section.classList.contains('shelf')) {
            section = section.parentNode;
        }
        var pos = 0;
        // Favourites and consoles share the first screen; only the grid below scrolls into view.
        if (section && section.classList && section.id === 'grid-section') {
            // Rows of the grid scroll one by one; the other shelves bring their heading along.
            var anchor = section.id === 'grid-section' ? target : section;
            // Never past the end: the last rows stay at the bottom instead of above empty space.
            var end = Math.max(0, scroller.offsetHeight - 1080);
            pos = Math.min(end, Math.max(0, offsetIn(anchor, scroller) - SCROLL_MARGIN));
        }
        if (pos === scroller._pos) return;
        scroller._pos = pos;
        scroller.style.transform = pos ? 'translateY(' + (-pos) + 'px)' : '';
        $('home').classList.toggle('scrolled', pos > 0);
    }

    // ---------- Focus glow (icon style "Ordiscale", Settings → Darstellung → Symbolstil)
    /*
     * A faint turquoise glow behind the selected tile, the agenda included. One element for all of
     * Home (#home-glow): its glow is a blurred box-shadow, painted once (measured free on the Q70B),
     * and it follows the focus by transform and fades by opacity, both composited. The alternative, a
     * glow layer on every tile, would repaint each tile's layer at every focus change and keep thirty
     * large shadow layers in memory. Its size changes only between kinds of tile (one repaint then).
     * Behind the shelves and the agenda in the DOM, so the tile itself stays on top.
     */
    var glow = { on: false, w: 0, h: 0 };

    // Position inside `ancestor` from offsets (the preview scales #stage, so no client rects).
    // A row track scrolled sideways (ui.js ensureVisible) is shifted by its own transform.
    function posIn(node, ancestor) {
        var x = 0, y = 0;
        while (node && node !== ancestor) {
            x += node.offsetLeft - (node.classList.contains('row-track') ? node._pos || 0 : 0);
            y += node.offsetTop;
            node = node.offsetParent;
        }
        return { x: x, y: y };
    }

    function glowTo(target) {
        var g = $('home-glow');
        var box = target === $('agenda') ? target : target.querySelector('.tile');
        if (!box || !document.documentElement.classList.contains('icons-ordiscale')) {
            if (glow.on) g.classList.remove('on');
            glow.on = false;
            return;
        }
        var p;
        if (box === target) p = { x: box.offsetLeft, y: box.offsetTop };
        else {
            p = posIn(box, $('home-scroll'));
            p.y -= $('home-scroll')._pos || 0;
        }
        if (box.offsetWidth !== glow.w || box.offsetHeight !== glow.h) {
            glow.w = box.offsetWidth;
            glow.h = box.offsetHeight;
            g.style.width = glow.w + 'px';
            g.style.height = glow.h + 'px';
        }
        // Coming from nothing (the gear, another view) it appears in place instead of sliding in.
        if (!glow.on) g.style.transition = 'opacity 0.2s';
        g.style.transform = 'translate(' + p.x + 'px, ' + p.y + 'px)';
        if (!glow.on) {
            g.offsetWidth;   // apply the jump before the transition comes back
            g.style.transition = '';
        }
        g.classList.add('on');
        glow.on = true;
    }

    // ---------- Agenda, top left: warning, waste collection, next appointments and the next holiday
    // (js/alerts.js, js/calendar.js, js/holidays.js)
    // Two columns (when, what) so the rows line up; the holiday underneath. Three appointments
    // at most, two at the largest text size, and each highlighted line (an official weather warning,
    // the bin for tomorrow) takes the room of about one of them, so it always stays above the favourites.
    // The agenda can be focused from the favourites with Up; OK opens the week view.

    var CALENDAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/>' +
        '<path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
    // Settings → Darstellung → Startseite oben. top: the agenda's top edge in tvos.css/style.css.
    var AGENDA_LAYOUTS = {
        standard: { top: 52, max: 3, maxLarger: 2 },    // clock right, appointments left
        column: { top: 220, max: 2, maxLarger: 1 }      // clock and appointments in one column
    };
    var SHELF_TOP = 376;   // just above the favourites shelf (it starts 400px down)

    /*
     * How many appointments fit above the favourites next to the highlighted lines. A model of the
     * heights in style.css (px at text size 1, scaled with --ts): an appointment is a 30px line at
     * line-height 1.3 plus the 4px row gap, the holiday a 22px line plus its 12px margin, the warning
     * with its credit line a little more. Checked against the rendered agenda in both layouts at all
     * text sizes with a warning, with waste collection and with both.
     *
     * Returns what to draw: { events, holiday, waste }. Short of room, the holiday line goes before
     * an appointment; with no appointment left the waste line goes too; an official warning always stays.
     */
    function agendaPlan(layout, max, s, warning, waste, holiday) {
        var room = SHELF_TOP - layout.top;
        function used(n, withWaste, withHoliday) {
            var alerts = (warning ? 53.75 * s + 22 : 0) + (withWaste ? 34 * s + 20 : 0) + (warning && withWaste ? 12 : 0);
            var below = (n ? n * (39 * s + 4) - 4 : 0) + (withHoliday ? 28.6 * s + 12 : 0);
            // The 18px under the highlighted lines only counts when something follows them.
            return alerts + (alerts && below ? 18 : 0) + below;
        }
        // Appointments come before the holiday line: one more appointment beats the holiday.
        for (var n = max; n > 0; n--) {
            if (used(n, waste, holiday) <= room) return { events: n, holiday: holiday, waste: waste };
            if (holiday && used(n, waste, false) <= room) return { events: n, holiday: false, waste: waste };
        }
        if (used(0, waste, holiday) <= room) return { events: 0, holiday: holiday, waste: waste };
        if (used(0, waste, false) <= room) return { events: 0, holiday: false, waste: waste };
        return { events: 0, holiday: false, waste: false };
    }

    var agendaKey = null;
    function renderAgenda(now) {
        var a = Prefs.get().appearance;
        var layout = AGENDA_LAYOUTS[a.homeLayout] || AGENDA_LAYOUTS.standard;
        var max = a.textSize === 'larger' ? layout.maxLarger : layout.max;
        var alerts = window.Alerts ? Alerts.state(now) : { count: 0, key: '' };
        var holiday = window.Holidays ? Holidays.label(Holidays.next(now)) : '';
        var plan = agendaPlan(layout, max, Appearance.scale(), !!alerts.warning, !!alerts.waste, !!holiday);
        var slots = plan.events;
        if (!plan.holiday) holiday = '';
        if (!plan.waste && alerts.waste) {
            alerts = { warning: alerts.warning, waste: null, count: alerts.warning ? 1 : 0, key: alerts.key + '|no-waste' };
        }
        // A waste appointment that has its own line is left out of the list below it.
        var items = window.Calendar
            ? Calendar.next(now, slots, alerts.waste && alerts.waste.items)
                .map(function (it) { return Calendar.parts(it, now); })
            : [];
        var key = JSON.stringify([items, holiday, alerts.key]);
        if (key === agendaKey) return;
        agendaKey = key;

        var events = $('events');
        events.innerHTML = '';
        items.forEach(function (p) {
            events.appendChild(el('span', 'when', p.when));
            events.appendChild(el('span', 'what', p.what));
        });
        $('holiday').classList.toggle('hidden', !holiday);
        $('holiday').innerHTML = holiday ? CALENDAR_ICON + '<span></span>' : '';
        if (holiday) $('holiday').lastChild.textContent = holiday;
        if (window.Alerts) Alerts.fill($('alerts'), alerts);
        var agenda = $('agenda');
        agenda.classList.toggle('has-events', items.length > 0);
        agenda.classList.toggle('has-alerts', alerts.count > 0);
        agenda.classList.toggle('alerts-only', alerts.count > 0 && !items.length && !holiday);
        var hide = !items.length && !holiday && !alerts.count;
        agenda.classList.toggle('hidden', hide);
        // Focus was on it: it is no longer in the top row, so move it to the gear instead of leaving a ring on nothing.
        if (hide && agenda.classList.contains('focused')) UI.refresh();
    }

    // ---------- Weather next to the clock (off until config.local.js has coordinates)

    var wxKey = null;
    function renderWeather() {
        var w = window.Weather && Weather.current();
        var key = w ? w.temp + w.icon : '';
        if (key === wxKey) return;
        wxKey = key;
        $('wx').classList.toggle('hidden', !w);
        $('wx').innerHTML = w ? w.icon + '<span>' + w.temp + '</span>' : '';
    }

    // ---------- Held OK: Apple TV-style menu and moving apps
    // Favourites (first five) and the grid form one five-column order, so Up/Down move an app a
    // whole row and it can cross between favourites and grid. OK keeps the order, Back cancels.

    // Everything Home shows, in Home's order: the edited list, then the rest alphabetically.
    function fullOrder() {
        var items = homeItems();
        var listed = {};
        items.forEach(function (i) { listed[i.id] = true; });
        return items.concat(otherApps().filter(function (i) { return !listed[i.id]; }));
    }

    function moveInOrder(order, from, to) {
        var item = order.splice(from, 1)[0];
        order.splice(to, 0, item);
    }

    function indexOfApp(order, id) {
        for (var i = 0; i < order.length; i++) if (order[i].id === id) return i;
        return -1;
    }

    function focusApp(id) {
        var tiles = UI.children($('apps-row')).concat(UI.children($('home-grid')));
        var tile = tiles.find(function (t) { return t._item.id === id; });
        // The tuner may have just moved from the favourites to the Konsolen row.
        if (!tile && id === TUNER_ID) tile = UI.children($('inputs-row')).find(function (t) { return t._item.kind === 'tuner'; });
        if (tile) UI.focusOn(tile);
    }

    function placeApp(id, to) {
        var order = fullOrder();
        // Out of the favourites the tuner leaves the list for its Konsolen tile, however short the list.
        if (id === TUNER_ID && to >= FAVORITES) {
            var at = indexOfApp(order, id);
            if (at >= 0) order.splice(at, 1);
            setHomeItems(order);
            focusApp(id);
            return;
        }
        // The tuner in the Konsolen row is not in the list yet: it joins at the end, then moves.
        if (id === TUNER_ID && indexOfApp(order, id) < 0) order.push(tunerItem());
        moveInOrder(order, indexOfApp(order, id), to);
        setHomeItems(order);
        focusApp(id);
    }

    function homeMenu(item) {
        if (item.kind === 'input') {
            UI.menu(item.label, [{ label: 'Name und Logo ändern', run: function () { UI.show('consoles'); } }]);
            return;
        }
        if (item.kind === 'tuner') {
            UI.menu(item.label, [{ label: 'Zu Favoriten hinzufügen', run: function () { placeApp(TUNER_ID, FAVORITES - 1); } }]);
            return;
        }
        if (item.kind !== 'app') return;
        var favourite = indexOfApp(fullOrder(), item.id) < FAVORITES;
        UI.menu(item.label, [
            { label: 'Bewegen', run: function () { startMove(item.id); } },
            favourite
                ? { label: 'Aus Favoriten entfernen', run: function () { placeApp(item.id, FAVORITES); } }
                : { label: 'Zu Favoriten hinzufügen', run: function () { placeApp(item.id, FAVORITES - 1); } }
        ]);
    }

    function startMove(id) {
        state.moveOrder = fullOrder();
        state.moving = id;
        renderHome();
        focusApp(id);
        UI.toast('Mit den Pfeiltasten bewegen, OK zum Ablegen');
    }

    function endMove(save) {
        var order = state.moveOrder;
        var id = state.moving;
        state.moving = null;
        state.moveOrder = null;
        if (save) setHomeItems(order);
        else renderHome();
        focusApp(id);
    }

    // Keys while an app is being moved; everything else is swallowed until OK or Back.
    function moveKey(k) {
        if (!state.moving) return false;
        var steps = {};
        steps[KEY.LEFT] = -1;
        steps[KEY.RIGHT] = 1;
        steps[KEY.UP] = -HOME_GRID_COLS;
        steps[KEY.DOWN] = HOME_GRID_COLS;
        if (steps[k]) {
            var order = state.moveOrder;
            var from = indexOfApp(order, state.moving);
            var to = Math.max(0, Math.min(order.length - 1, from + steps[k]));
            if (to !== from) {
                moveInOrder(order, from, to);
                renderHome();
                focusApp(state.moving);
            }
        } else if (k === KEY.ENTER) {
            endMove(true);
            UI.swallowPress();   // a held OK must not go on to open the app menu
        } else if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) {
            endMove(false);
            UI.swallowPress();   // nor a held Back on to Samsung's Home
        }
        return true;
    }

    // ---------- Back held for two seconds on Home: Samsung's own home screen
    // The Home key belongs to the TV and never reaches us, so this is the way back to Samsung's
    // menus from here. Same rule as held OK in ui.js: once the TV has sent a Back keyup the hold
    // time decides; before that, only auto-repeats count, so a short Back never opens it.

    var BACK_HOLD_MS = 2000;
    var BACK_MIN_REPEATS = 4;
    var backHold = null;      // { repeats, start, timer }
    var backKeyupSeen = false;

    function isBack(k) {
        return k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE;
    }

    function backHoldKey(k) {
        if (!isBack(k)) return false;
        // Until the keyup, every further keydown is the held key repeating (see startHold in ui.js).
        if (backHold) {
            backHold.repeats++;
            return true;
        }
        backHold = { repeats: 0, start: Date.now() };
        backHold.timer = setTimeout(function () {
            if (!backHold) return;
            // Without a keyup yet, a real two-second hold has produced many auto-repeats; two or
            // three quick presses have not, so they never count as holding.
            if (backKeyupSeen || backHold.repeats >= BACK_MIN_REPEATS) {
                backHold = null;   // done; without a keyup nothing else would ever clear it
                Settings.openSamsungHome();
            } else {
                // Undecided: no keyup seen yet and no repeats. Wait for the keyup to tell the length;
                // if it never comes, the next Back starts afresh after the same time again.
                var h = backHold;
                setTimeout(function () { if (backHold === h) backHold = null; }, BACK_HOLD_MS);
            }
        }, BACK_HOLD_MS);
        return true;
    }

    document.addEventListener('keyup', function (e) {
        if (!isBack(e.keyCode)) return;
        backKeyupSeen = true;
        var h = backHold;
        backHold = null;
        if (!h) return;
        clearTimeout(h.timer);
        // A first hold without repeats is only measurable here, at release.
        if (Date.now() - h.start >= BACK_HOLD_MS) Settings.openSamsungHome();
    });

    function applyInputStatus() {
        UI.children($('inputs-row')).forEach(function (tile) {
            if (!tile._dot) return;   // the tuner tile has no connection dot
            tile._dot.classList.toggle('on', state.hdmi[tile._item.hdmi] === true);
        });
    }

    function refreshInputStatus() {
        return Inputs.status().then(function (status) {
            var before = connectedPorts() + '|' + state.tv;
            state.hdmi = status.hdmi;
            state.tv = status.tv;
            // A device plugged in or out changes which automatic tiles exist, not just their dots.
            if (connectedPorts() + '|' + state.tv !== before) renderHome();
            else applyInputStatus();
        }).catch(function (err) {
            log('Input status unavailable: ' + DevLog.errorText(err));
        });
    }

    function renderAll() {
        var grid = $('all-grid');
        grid.innerHTML = '';
        UI.resetScroll(grid);
        var items = Apps.allSorted(state.apps, state.showEverything);
        items.forEach(function (item) { grid.appendChild(appTile(item)); });
        $('all-count').textContent = items.length + ' Apps';
    }

    function renderLab() {
        var actions = [
            { label: 'Send installed app list to log', run: labDumpApps },
            { label: 'Read inputs', run: labReadInputs },
            { label: 'Open Samsung TV viewer only', run: function () { runLogged('Open TV viewer', Inputs.openViewer()); } }
        ];
        if (window.Sound) actions = actions.concat(Sound.actions());
        actions.push({ label: 'Launch times: log the last ' + TIMES_LAB, run: labLaunchTimes });
        if (window.Weather) actions = actions.concat(Weather.actions());
        if (window.RenderProbe) actions = actions.concat(RenderProbe.actions());
        if (window.PlatformProbe) actions = actions.concat(PlatformProbe.actions());
        inputs().forEach(function (input) {
            var item = { kind: 'input', hdmi: input.hdmi, label: input.label };
            var name = input.label + ' (HDMI ' + input.hdmi + ')';
            actions.push({ label: name + ': switch + viewer', run: function () { openInput(item, 'switch+viewer'); } });
            actions.push({ label: name + ': switch only', run: function () { openInput(item, 'switch'); } });
            actions.push({ label: name + ': inside launcher', run: function () { openInput(item, 'inapp'); } });
        });
        var list = $('lab-list');
        list.innerHTML = '';
        actions.forEach(function (a) {
            var li = el('li', '', a.label);
            li._item = { kind: 'lab', run: a.run };
            list.appendChild(li);
        });
        DevLog.onLine(function () {
            $('lab-log').textContent = DevLog.lines().slice(-26).join('\n');
        });
    }

    // ---------- Actions

    function runLogged(what, promise) {
        log(what + '…');
        return promise.then(function (v) {
            log(what + ': ok');
            return v;
        }, function (err) {
            log(what + ': FAILED ' + DevLog.errorText(err));
            throw err;
        });
    }

    // ---------- Launch timing
    // From OK until the TV hides the launcher, i.e. the system part of a start (the app's own
    // splash screen comes after and is not visible to us). Kept per app so cold starts and
    // resumes can be compared in the Lab and in Settings → Erweitert → Startzeiten der Apps
    // (storage and statistics: js/launchtimes.js).

    var TIMES_LAB = 40;     // how many of the stored starts the Lab logs
    var launchStarted = null;

    function recordLaunchTime() {
        if (!launchStarted) return;
        var entry = { id: launchStarted.id, label: launchStarted.label, ms: Date.now() - launchStarted.at, at: Date.now() };
        launchStarted = null;
        if (LaunchTimes.recordApp(entry)) log('Launch time ' + entry.label + ': ' + entry.ms + ' ms');
    }

    function labLaunchTimes() {
        var list = LaunchTimes.apps().slice(0, TIMES_LAB);
        if (!list.length) log('Launch times: none yet. Open apps from Home, then come back here.');
        list.forEach(function (t) {
            log(new Date(t.at).toLocaleString('de-DE') + '  ' + t.label + '  ' + t.ms + ' ms');
        });
    }

    function launchApp(item) {
        // Not an installed app: no launch time to measure.
        if (item.virtual) {
            if (item.id === HA_ID) HAView.open();
            else openTuner();
            return;
        }
        launchStarted = { id: item.id, label: item.label, at: Date.now() };
        runLogged('Launch ' + item.id, Apps.launch(item.id)).catch(function (err) {
            launchStarted = null;
            UI.toast(item.label + ' ließ sich nicht öffnen: ' + DevLog.errorText(err));
        });
    }

    function switchSource(label, what, method, promise) {
        UI.toast('Wechsle zu ' + label + ' …');
        runLogged('Input ' + what + ' via ' + method, promise).then(function (result) {
            log('Current source now: ' + Inputs.describeSource(Inputs.current()));
            if (result === 'inapp') enterTvMode();
        }).catch(function (err) {
            UI.toast('Wechsel zu ' + label + ' fehlgeschlagen: ' + DevLog.errorText(err));
        });
    }

    function openInput(item, method) {
        method = method || item.method || cfg.inputMethod;
        switchSource(item.label, 'HDMI ' + item.hdmi, method, Inputs.open(item.hdmi, method));
    }

    // Like an HDMI tile: set the TV source, then (by default) open Samsung's TV viewer.
    function openTuner() {
        var method = cfg.inputMethod;
        switchSource('Fernsehen', 'TV', method, Inputs.openTuner(method));
    }

    function enterTvMode() {
        state.tvMode = true;
        document.documentElement.classList.add('tv-mode');
    }

    function exitTvMode() {
        state.tvMode = false;
        document.documentElement.classList.remove('tv-mode');
        Inputs.hide().catch(function (err) { log('Hide input failed: ' + DevLog.errorText(err)); });
    }

    function labDumpApps() {
        runLogged('App list', Apps.getInstalledApps()).then(function (apps) {
            log('apps: ' + apps.length + ' total, ' + apps.filter(function (a) { return a.show; }).length + ' with show=true',
                apps.map(Apps.describe));
            UI.toast('Sent ' + apps.length + ' apps to the log');
        }).catch(function () {});
    }

    function labReadInputs() {
        runLogged('Inputs', Inputs.sources()).then(function (info) {
            var fmt = function (list) { return (list || []).map(Inputs.describeSource).join(', ') || 'none'; };
            log('connected: ' + fmt(info.connected));
            log('disconnected: ' + fmt(info.disconnected));
            log('current: ' + Inputs.describeSource(Inputs.current()));
        }).catch(function () {});
    }

    function nextWallpaper() {
        var w = Wallpaper.next();
        if (w) UI.toast(w.title + (w.credit ? ' · ' + w.credit : ''));
    }

    // Colour keys are hidden shortcuts; everything is also reachable from Settings.
    function colourKey(k, view) {
        if (k === KEY.RED || k === KEY.R) {
            UI.show(view === 'all' ? 'home' : 'all');
        } else if (k === KEY.GREEN || k === KEY.G) {
            if (view === 'home') nextWallpaper();
        } else if (k === KEY.BLUE || k === KEY.B) {
            UI.show(view === 'lab' ? 'home' : 'lab');
        } else if (k === KEY.YELLOW || k === KEY.Y) {
            if (view === 'all') {
                state.showEverything = !state.showEverything;
                UI.show('all', { back: true });
            } else if (view === 'home' && window.RunnerGame) {
                RunnerGame.open();
            } else return false;
        } else {
            return false;
        }
        return true;
    }

    // ---------- Clock, data, lifecycle

    function updateClock() {
        var d = new Date();
        var t = Appearance.time(d);
        $('time-main').textContent = t.time;
        $('time-suffix').textContent = t.suffix;
        $('date').textContent = Appearance.date(d);
        // Once a minute inside: dims Home at night (js/appearance.js)
        Appearance.tickNight(d);
        renderAgenda(d);
        Week.tick();
        if (window.Calendar) Calendar.refresh();   // throttled inside: at most every 15 minutes
        // Throttled inside: official weather warnings, at most every 15 minutes (js/warnings.js)
        if (window.Warnings) Warnings.refresh();
        Network.render($('net'));
        renderWeather();
        // Throttled inside Weather: this asks at most once an hour.
        if (window.Weather) Weather.refresh();
        // With the clock, every 10 s: a console plugged in while Home is open appears without a restart.
        if (UI.isVisible('home') && !state.tvMode) refreshInputStatus();
    }

    // The TV takes ~4 s to list its ~450 apps, so Home is drawn from the last list we saw
    // and only redrawn if a fresh list differs.
    function readCache() {
        try {
            return JSON.parse(localStorage.getItem(CACHE_KEY));
        } catch (e) {
            return null;
        }
    }

    function writeCache(apps) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(apps));
        } catch (e) {
            // Without the cache we only lose the fast start.
        }
    }

    var listeners = [];
    /*
     * Hidden game code: Left and Right alternating three times.
     *
     * Two properties matter on a remote. It is matched against the tail of the last few keys,
     * not with a position counter, because a held key repeats and one extra press would
     * otherwise reset progress so the code could never complete. And it alternates rather than
     * repeating a key, because both auto-repeat and sweeping along a row produce runs of the
     * same key — a code made of runs fires by accident during ordinary browsing.
     */
    var gameCode = [KEY.LEFT, KEY.RIGHT, KEY.LEFT, KEY.RIGHT, KEY.LEFT, KEY.RIGHT];
    var recentKeys = [];

    function gameCodeEntered(k) {
        recentKeys.push(k);
        if (recentKeys.length > gameCode.length) recentKeys.shift();
        if (recentKeys.length < gameCode.length) return false;
        for (var i = 0; i < gameCode.length; i++) {
            if (recentKeys[i] !== gameCode[i]) return false;
        }
        recentKeys.length = 0;
        return true;
    }

    function setApps(apps) {
        var sig = apps.map(function (a) { return a.id + '|' + a.name + '|' + a.show; }).join(',');
        if (sig === state.appsSig) return;
        state.appsSig = sig;
        state.apps = apps;
        renderHome();
        if (UI.isVisible('all')) UI.show('all', { back: true });
        listeners.forEach(function (fn) { fn(); });
    }

    function loadApps() {
        state.lastFetch = Date.now();
        return Apps.getInstalledApps().then(function (apps) {
            var list = Apps.launchable(apps).map(function (a) {
                return { id: a.id, name: a.name, show: a.show, iconPath: a.iconPath || '' };
            });
            writeCache(list);
            setApps(list);
        }).catch(function (err) {
            UI.toast('Apps ließen sich nicht laden: ' + DevLog.errorText(err));
            log('App list failed: ' + DevLog.errorText(err));
        });
    }

    function registerKeys() {
        try {
            tizen.tvinputdevice.registerKeyBatch(['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue']);
        } catch (e) {
            log('Colour keys unavailable: ' + DevLog.errorText(e));
        }
    }

    function registerViews() {
        UI.register('home', {
            el: $('home'),
            startRow: 1,
            // No hint bar: Home scrolls underneath it, and Apple TV shows none either.
            hints: [],
            rows: function () {
                // Top row: the agenda (left, only while it shows something) and the gear (right).
                var top = $('agenda').classList.contains('hidden') ? [$('gear')] : [$('agenda'), $('gear')];
                return [top, UI.children($('apps-row')), UI.children($('inputs-row'))]
                    .concat(UI.chunk(UI.children($('home-grid')), HOME_GRID_COLS));
            },
            onFocus: function (target) {
                scrollHome(target);
                glowTo(target);
            },
            activate: function (item) {
                if (item.kind === 'app') launchApp(item);
                else if (item.kind === 'input') openInput(item);
                else if (item.kind === 'tuner') openTuner();
                else if (item.kind === 'agenda') Week.open();
                else if (item.kind === 'settings') UI.show('settings');
            },
            onLongPress: homeMenu,
            // Moving an app takes every key; otherwise Back held opens Samsung's home screen.
            onKey: function (k) { return moveKey(k) || backHoldKey(k); },
            keepRepeats: true,      // backHoldKey counts Back repeats (moveKey ends its own press)
            // Home is the root: Back does nothing.
            onBack: function () { return true; }
        });
        $('gear')._item = { kind: 'settings' };
        $('agenda')._item = { kind: 'agenda' };

        UI.register('all', {
            el: $('all'),
            rows: function () { return UI.chunk(UI.children($('all-grid')), GRID_COLS); },
            onShow: renderAll,
            activate: launchApp,
            hints: [['OK', 'Öffnen'], ['Zurück', 'Home']]
        });

        UI.register('lab', {
            el: $('lab'),
            rows: function () { return UI.children($('lab-list')).map(function (li) { return [li]; }); },
            activate: function (item) { item.run(); },
            hints: [['OK', 'Run'], ['Back', 'Home']]
        });
    }

    // After the first-run assistant: Home with the first favourite selected.
    function focusFirstFavourite() {
        UI.show('home');
        var first = $('apps-row').firstChild;
        if (first) UI.focusOn(first);
    }

    function init() {
        registerKeys();
        registerViews();
        UI.setColourKey(colourKey);
        UI.setKeyHook(function (k) {
            if (state.tvMode) {
                if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) exitTvMode();
                return true;
            }
            if (!UI.isVisible('home')) { recentKeys.length = 0; return false; }
            if (gameCodeEntered(k)) {
                if (window.RunnerGame) RunnerGame.open(true);
                return true;
            }
            return false;
        });
        Appearance.apply();
        updateClock();
        setInterval(updateClock, 10000);
        Network.watch(function () { Network.render($('net')); });
        if (window.Weather) Weather.onUpdate(renderWeather);
        if (window.Calendar) Calendar.onUpdate(function () { renderAgenda(new Date()); });
        if (window.Warnings) Warnings.onUpdate(function () { renderAgenda(new Date()); });
        renderLab();
        var cached = readCache();
        if (cached && cached.length) setApps(cached);
        else renderHome();
        UI.show('home');
        // A cached app list renders before Home is shown; this is where that first paint counts.
        if ($('apps-row').firstChild) LaunchTimes.launcherReady();
        Wallpaper.start();

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                recordLaunchTime();
                if (state.tvMode) exitTvMode();
                return;
            }
            updateClock();
            refreshInputStatus();
            if (UI.isVisible('home')) Wallpaper.homeShown();
            if (Date.now() - state.lastFetch > REFRESH_AFTER_MS) setTimeout(loadApps, 1500);
        });
        // With a cache, let the first frames and key presses through before the slow app list.
        setTimeout(loadApps, cached ? 2000 : 0);
        refreshInputStatus();
        log('Launcher started');
    }

    window.Home = {
        init: init,
        apps: function () { return state.apps; },
        homeItems: homeItems,
        otherApps: otherApps,
        setHomeItems: setHomeItems,
        inputs: inputs,
        homeInputs: homeInputs,
        setInputs: setInputs,
        hdmiStatus: function () { return state.hdmi; },
        // An HDMI input shown inside the launcher: no screen saver over it.
        tvMode: function () { return state.tvMode; },
        refreshInputStatus: refreshInputStatus,
        render: renderHome,
        tunerSupported: tunerSupported,
        tunerItem: tunerItem,
        placeFirst: placeFirst,
        focusFirstFavourite: focusFirstFavourite,
        renderLab: renderLab,
        updateClock: updateClock,
        reloadApps: loadApps,
        miniTile: miniTile,
        miniInputTile: miniInputTile,
        // A full-size tile for the Home preview in Settings → Darstellung (not focusable).
        previewTile: function (item) {
            var t = appTile(item);
            t._item = null;
            return t;
        },
        onAppsChanged: function (fn) { listeners.push(fn); }
    };
})();

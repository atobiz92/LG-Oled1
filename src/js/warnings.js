/*
 * Official weather warnings from the Deutscher Wetterdienst (DWD), for the weather place.
 *
 * Source: DWD geoserver (maps.dwd.de): open, no account, CORS open. Terms: GeoNutV; the source
 * "Deutscher Wetterdienst" must be named where a warning is shown (js/alerts.js does that).
 *
 * Two requests, and little leaves the TV:
 *   1. Once per place: which warning cell (Landkreis) the weather place lies in. This is the only
 *      request that carries the coordinates (two decimals, ~1 km, the same as for Open-Meteo). The
 *      cell and the coordinates it was found for are cached in localStorage; a new place asks again.
 *   2. Every 15 minutes: the warnings of that cell. Only the cell id goes out.
 * Nothing from the answers is logged. Moderate, Severe and Extreme warnings count; Minor ones
 * ("Wetterwarnung" for light frost and the like) would be noise on a living-room screen.
 *
 * Failure is silence, as with the weather: the last good answer is shown for at most an hour,
 * after that nothing.
 */
(function () {
    'use strict';

    var CELL_KEY = 'arn0.warncell.v1';
    var DATA_KEY = 'arn0.warnings.v1';
    var BASE = 'https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application%2Fjson';
    var FRESH_MS = 15 * 60 * 1000;      // ask again after this
    var USABLE_MS = 60 * 60 * 1000;     // the last good answer shows for this long, then nothing
    var RETRY_MS = 10 * 60 * 1000;      // quiet period after a failed attempt
    var TIMEOUT_MS = 10000;
    var SOON_MS = 6 * 60 * 60 * 1000;   // an upcoming warning shows from this long before its start
    var HOUR_MS = 60 * 60 * 1000;

    var RANK = { Moderate: 1, Severe: 2, Extreme: 3 };

    var cell = null;            // { latitude, longitude, id } ; id '' = no cell there (outside Germany)
    var data = null;            // { at, id, items: [{ event, severity, onset, expires }] }
    var fetching = false;
    var lastFailure = 0;
    var simulated = false;      // test data from simulate(): no requests, no expiry
    var listeners = [];

    // ---------- Storage

    function read(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch (e) {
            return null;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            // Only the instant first paint after a restart is lost.
        }
    }

    function load() {
        cell = read(CELL_KEY);
        data = read(DATA_KEY);
    }

    // ---------- Settings

    function prefs() {
        return Prefs.get().warnings;
    }

    function place() {
        return window.Weather ? Weather.coords() : null;
    }

    // Only an explicit yes on this TV counts (Settings → Wetter); see the default in prefs.js.
    function enabled() {
        return prefs().enabled === true;
    }

    function active() {
        return enabled() && !!place();
    }

    function setEnabled(on) {
        prefs().enabled = !!on;
        Prefs.save();
        notify();
        if (on) refresh(true);
    }

    // Settings → Wetter: "An", "Aus" or "Wetterort fehlt".
    function summary() {
        if (!place()) return 'Wetterort fehlt';
        return enabled() ? 'An' : 'Aus';
    }

    function notify() {
        listeners.forEach(function (fn) { fn(); });
    }

    // ---------- Requests

    function get(url) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.timeout = TIMEOUT_MS;
            xhr.onload = function () {
                try {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(JSON.parse(xhr.responseText));
                        return;
                    }
                } catch (e) {
                    // Unusable answer, handled as a failure below.
                }
                reject(new Error('HTTP ' + xhr.status));
            };
            xhr.onerror = function () { reject(new Error('request failed')); };
            xhr.ontimeout = function () { reject(new Error('request timed out')); };
            xhr.send();
        });
    }

    function sameCell(p) {
        return !!cell && cell.latitude === p.latitude && cell.longitude === p.longitude;
    }

    // Warning cell for the place: a box of 0.001 degrees at the weather coordinates (lat, lon order).
    function findCell(p) {
        var box = [p.latitude, p.longitude, p.latitude + 0.001, p.longitude + 0.001].join(',');
        var url = BASE + '&typeName=dwd:Warngebiete_Kreise&propertyName=WARNCELLID,NAME' +
            '&bbox=' + box + ',urn:ogc:def:crs:EPSG::4326';
        return get(url).then(function (json) {
            var f = json && json.features && json.features[0];
            var id = f && f.properties && f.properties.WARNCELLID;
            cell = { latitude: p.latitude, longitude: p.longitude, id: id ? String(id) : '' };
            write(CELL_KEY, cell);
            return cell;
        });
    }

    function findWarnings(id) {
        var url = BASE + '&typeName=dwd:Warnungen_Landkreise' +
            '&propertyName=EVENT,SEVERITY,HEADLINE,ONSET,EXPIRES,MSGTYPE' +
            '&CQL_FILTER=' + encodeURIComponent('GC_WARNCELLID=' + id);
        return get(url).then(function (json) {
            var items = [];
            ((json && json.features) || []).forEach(function (f) {
                var pr = f.properties || {};
                if (!RANK[pr.SEVERITY] || /^cancel$/i.test(pr.MSGTYPE || '')) return;
                var onset = Date.parse(pr.ONSET);
                var expires = pr.EXPIRES ? Date.parse(pr.EXPIRES) : null;
                if (isNaN(onset) || (pr.EXPIRES && isNaN(expires))) return;
                var event = eventName(pr);
                if (event) items.push({ event: event, severity: pr.SEVERITY, onset: onset, expires: expires });
            });
            return items;
        });
    }

    // EVENT ("ORKANARTIGE BÖEN"); if missing, what follows "vor" in the headline.
    function eventName(pr) {
        var text = pr.EVENT || '';
        if (!text) {
            var m = /\bvor\s+(.+)$/i.exec(pr.HEADLINE || '');
            text = m ? m[1] : '';
        }
        return text;
    }

    function failed(why) {
        fetching = false;
        lastFailure = Date.now();
        // Fixed text only: no answer content, no place.
        DevLog.log('Warnings: ' + why);
    }

    function refresh(force) {
        if (simulated || fetching || !active()) return;
        var p = place();
        var now = Date.now();
        var known = sameCell(p);
        var have = data && cell && data.id === cell.id && known;
        if (!force) {
            if (now - lastFailure < RETRY_MS) return;
            if (have && now - data.at < FRESH_MS) return;
        }
        if (!known) {
            // A new place: what is cached belongs to the old one.
            data = null;
            cell = null;
        }
        fetching = true;
        var start = known ? Promise.resolve(cell) : findCell(p);
        start.then(function (c) {
            if (!c.id) {
                // No warning cell here: nothing to show, nothing more to ask until the place changes.
                data = { at: Date.now(), id: '', items: [] };
                write(DATA_KEY, data);
                return null;
            }
            return findWarnings(c.id).then(function (items) {
                data = { at: Date.now(), id: c.id, items: items };
                write(DATA_KEY, data);
            });
        }).then(function () {
            fetching = false;
            lastFailure = 0;
            notify();
        }, function (err) {
            failed(err.message);
        });
    }

    // ---------- What to show

    // "ORKANARTIGE BÖEN" → "Orkanartige Böen"; small words stay small ("Starkregen und Hagel").
    var SMALL = { und: 1, mit: 1, vor: 1, bis: 1, oder: 1, in: 1, im: 1, von: 1, ab: 1 };

    function title(text) {
        return text.toLowerCase().split(/(\s+)/).map(function (w, i) {
            if (i > 0 && SMALL[w]) return w;
            return w.charAt(0).toUpperCase() + w.slice(1);
        }).join('');
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    // "22 Uhr", "22:30 Uhr"; the day is named when it is not today: "morgen 06 Uhr", "Mo 06 Uhr".
    function clock(ms, now) {
        var d = new Date(ms);
        var time = (d.getMinutes() ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : pad(d.getHours())) + ' Uhr';
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        var diff = Math.round((day - today) / 86400000);
        if (diff <= 0) return time;
        if (diff === 1) return 'morgen ' + time;
        return d.toLocaleDateString('de-DE', { weekday: 'short' }).replace(/\.$/, '') + ' ' + time;
    }

    /*
     * The one warning to show now, or null: { level, text, more }. A warning counts while it is in
     * force, or when it starts within six hours ("ab 18 Uhr"). The same event listed twice (updates,
     * several time windows) is one; the highest level goes first, one in force before one to come.
     * `more` is how many other events there are.
     */
    function current(nowDate) {
        var now = nowDate || new Date();
        var t = now.getTime();
        if (!enabled() || (!simulated && !active())) return null;
        if (!data || (!simulated && t - data.at > USABLE_MS)) return null;
        if (!simulated && (!cell || cell.id !== data.id || !sameCell(place()))) return null;

        var byEvent = {};
        data.items.forEach(function (it) {
            var started = it.onset <= t;
            var running = started && (it.expires === null || it.expires > t);
            var soon = !started && it.onset - t <= SOON_MS;
            if (!running && !soon) return;
            var key = it.event.toLowerCase();
            var c = { it: it, running: running, rank: RANK[it.severity] || 0 };
            var old = byEvent[key];
            if (!old || better(c, old)) byEvent[key] = c;
        });
        var list = Object.keys(byEvent).map(function (k) { return byEvent[k]; });
        if (!list.length) return null;
        list.sort(function (a, b) { return better(a, b) ? -1 : better(b, a) ? 1 : 0; });
        var top = list[0];
        var level = top.rank >= 2 ? 'severe' : 'moderate';
        var when = top.running
            ? (top.it.expires === null ? '' : ' bis ' + clock(top.it.expires, now))
            : ' ab ' + clock(top.it.onset, now);
        return {
            level: level,
            text: (level === 'severe' ? 'Unwetterwarnung' : 'Wetterwarnung') + ' · ' + title(top.it.event) + when,
            more: list.length - 1
        };
    }

    // Higher level first, then one in force before one to come, then the later end.
    function better(a, b) {
        if (a.rank !== b.rank) return a.rank > b.rank;
        if (a.running !== b.running) return a.running;
        return (a.it.expires || Infinity) > (b.it.expires || Infinity);
    }

    /*
     * Test data for the preview and the Lab: simulate([{ event, severity, onset, expires }]) shows
     * those warnings (times as ms) instead of asking the DWD; simulate(null) goes back to the real
     * thing. Nothing is stored.
     */
    function simulate(items) {
        simulated = !!items;
        data = items ? { at: Date.now(), id: 'test', items: items } : null;
        notify();
        if (!items) refresh(true);
    }

    function start() {
        load();
        refresh();
        // A new weather place (Settings → Wetter) asks for its own cell at once, not on the next tick.
        if (window.Weather) Weather.onUpdate(function () { refresh(); });
    }

    window.Warnings = {
        start: start,
        refresh: refresh,
        current: current,
        enabled: enabled,
        setEnabled: setEnabled,
        summary: summary,
        simulate: simulate,
        onUpdate: function (fn) { listeners.push(fn); }
    };
})();

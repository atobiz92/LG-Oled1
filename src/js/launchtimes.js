/*
 * Measured start times: apps (OK until the TV hides the launcher, recorded by home.js) and the
 * launcher itself (start of loading until Home shows its tiles for the first time). Both live in
 * localStorage; Settings → Erweitert → Startzeiten der Apps shows the medians, the Lab logs the raw
 * app list. Measure first, then change: every load-time optimisation is judged against these.
 *
 * Storage formats (kept compatible, older entries stay readable):
 *   arn0.launchtimes.v1   [{ id, label, ms, at }]  apps, newest first (written since the first version)
 *   arn0.launcherstart.v1 [{ ms, at }]             launcher starts, newest first, last 20
 */
(function () {
    'use strict';

    var APPS_KEY = 'arn0.launchtimes.v1';
    var APPS_MAX = 100;          // enough for several starts per app; a few KB
    var LAUNCHER_KEY = 'arn0.launcherstart.v1';
    var LAUNCHER_MAX = 20;
    // Over a minute means the TV went to standby (or the page was hidden), not a real start time.
    var IMPLAUSIBLE_MS = 60000;

    function read(key) {
        try {
            var list = JSON.parse(localStorage.getItem(key));
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function write(key, list) {
        try {
            localStorage.setItem(key, JSON.stringify(list));
        } catch (e) {
            // Only the history is lost.
        }
    }

    function numeric(list) {
        return list.filter(function (t) { return t && typeof t.ms === 'number' && isFinite(t.ms) && t.ms >= 0; });
    }

    function median(values) {
        var s = values.slice().sort(function (a, b) { return a - b; });
        var mid = Math.floor(s.length / 2);
        return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }

    // 1834 → "1,8" (German decimal comma, one decimal)
    function seconds(ms) {
        return (Math.round(ms / 100) / 10).toFixed(1).replace('.', ',');
    }

    // ---------- Apps

    function apps() {
        return numeric(read(APPS_KEY));
    }

    function recordApp(entry) {
        if (entry.ms > IMPLAUSIBLE_MS) return false;
        write(APPS_KEY, [entry].concat(read(APPS_KEY)).slice(0, APPS_MAX));
        return true;
    }

    // ---------- Launcher

    var launcherDone = false;

    // After the frame that first shows the tiles has been painted, not merely queued. A page that is
    // not being rendered (hidden pane, standby) never gets that frame: after a grace period the time
    // the tiles were in the DOM is taken instead, so the value is not lost, only a few ms short.
    function afterPaint(fn) {
        var done = false;
        function once(painted) {
            if (done) return;
            done = true;
            fn(painted);
        }
        if (window.requestAnimationFrame) requestAnimationFrame(function () { requestAnimationFrame(function () { once(true); }); });
        setTimeout(function () { once(false); }, 1500);
    }

    // performance.now() counts from the start of navigation; the Date fallback uses the same origin.
    function sinceStart() {
        if (window.performance && typeof performance.now === 'function') return performance.now();
        if (window.performance && performance.timing && performance.timing.navigationStart) {
            return Date.now() - performance.timing.navigationStart;
        }
        return null;
    }

    // Called by home.js whenever Home is visible with tiles; only the first call per page load counts.
    function launcherReady() {
        if (launcherDone) return;
        launcherDone = true;
        // Started in the background (preloaded, standby): the time until someone sees it is no start time.
        if (document.hidden) return;
        var inDom = sinceStart();
        afterPaint(function (painted) {
            var t = painted ? sinceStart() : inDom;
            if (t === null || t > IMPLAUSIBLE_MS) return;
            var ms = Math.round(t);
            DevLog.log('Launcher start: ' + ms + ' ms' + (painted ? '' : ' (until tiles in the DOM, no frame painted)'));
            write(LAUNCHER_KEY, [{ ms: ms, at: Date.now() }].concat(read(LAUNCHER_KEY)).slice(0, LAUNCHER_MAX));
        });
    }

    // ---------- Summary for Settings

    // { apps: [{ id, label, median, count }] slowest first, launcher: { median, count } | null }
    function stats() {
        var byApp = {};
        var order = [];
        // Newest first: the first label seen is the current name of the app.
        apps().forEach(function (t) {
            if (!byApp[t.id]) {
                byApp[t.id] = { id: t.id, label: t.label || t.id, values: [] };
                order.push(t.id);
            }
            byApp[t.id].values.push(t.ms);
        });
        var list = order.map(function (id) {
            var a = byApp[id];
            return { id: id, label: a.label, median: median(a.values), count: a.values.length };
        });
        list.sort(function (a, b) { return b.median - a.median; });
        var starts = numeric(read(LAUNCHER_KEY)).map(function (t) { return t.ms; });
        return {
            apps: list,
            launcher: starts.length ? { median: median(starts), count: starts.length } : null
        };
    }

    function clear() {
        try {
            localStorage.removeItem(APPS_KEY);
            localStorage.removeItem(LAUNCHER_KEY);
        } catch (e) {
            // Nothing stored, nothing to clear.
        }
    }

    window.LaunchTimes = {
        apps: apps,
        recordApp: recordApp,
        launcherReady: launcherReady,
        stats: stats,
        clear: clear,
        seconds: seconds
    };
})();

/*
 * Platform layer for LG webOS (target: OLED55B8PLA, 2018, webOS 4.x, web engine Chromium 53).
 *
 * Everything the launcher needs from the TV goes through here: Luna service calls, the app's own
 * id, the remote's key codes. apps.js, inputs.js and network.js build on it; in the browser preview
 * js/webos-mock.js stands in for the TV (window.PalmServiceBridge).
 *
 * Loaded first, so it also fills the few gaps of Chromium 53 the UI code relies on (only what is
 * used: String.prototype.padStart). See docs/abweichungen.md.
 */
(function () {
    'use strict';

    // ---------- Gaps of Chromium 53 (padStart arrived in Chrome 57)
    if (!String.prototype.padStart) {
        String.prototype.padStart = function (length, fill) {
            var s = String(this);
            fill = fill === undefined ? ' ' : String(fill);
            if (s.length >= length || !fill) return s;
            var pad = '';
            while (pad.length < length - s.length) pad += fill;
            return pad.slice(0, length - s.length) + s;
        };
    }

    // The id in appinfo.json. Never change it: the TV would treat it as a new app and every setting
    // stored in localStorage would be gone.
    var APP_ID = 'com.tobias.launcher';

    // Remote keys on webOS. Arrows, OK and the colour keys use the same codes as on Tizen; Back is 461
    // (appinfo.json sets disableBackHistoryAPI, so Back arrives as a key instead of history.back()).
    var KEYS = { BACK: 461, RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406 };

    // Bridges are kept until they answer; a bridge that is collected early never calls back.
    var pending = [];

    function bridgeCtor() {
        // Not typeof === 'function': a host constructor may report 'object'.
        return window.PalmServiceBridge || null;
    }

    /*
     * One Luna call. Resolves with the response when returnValue is not false, rejects with an Error
     * that carries errorCode/errorText otherwise. ms: give up after this long (default 8 s).
     */
    function call(uri, params, ms) {
        return new Promise(function (resolve, reject) {
            var Bridge = bridgeCtor();
            if (!Bridge) {
                reject(new Error('Kein webOS-Dienst verfügbar'));
                return;
            }
            var bridge = new Bridge();
            var done = false;
            var timer = setTimeout(function () {
                finish();
                reject(new Error(uri.split('/').pop() + ': keine Antwort vom TV'));
            }, ms || 8000);
            function finish() {
                done = true;
                clearTimeout(timer);
                var i = pending.indexOf(bridge);
                if (i >= 0) pending.splice(i, 1);
                try { bridge.cancel(); } catch (e) { /* already closed */ }
            }
            pending.push(bridge);
            bridge.onservicecallback = function (raw) {
                if (done) return;
                finish();
                var res;
                try {
                    res = JSON.parse(raw);
                } catch (e) {
                    reject(new Error('Ungültige Antwort vom TV'));
                    return;
                }
                if (res && res.returnValue === false) {
                    var err = new Error(res.errorText || ('Fehler ' + res.errorCode));
                    err.errorCode = res.errorCode;
                    reject(err);
                    return;
                }
                resolve(res || {});
            };
            bridge.call(uri, JSON.stringify(params || {}));
        });
    }

    /*
     * A subscription (subscribe: true): fn(response) for the first answer and every change.
     * Returns a function that ends it. Errors go to fn as well, as { returnValue: false, … }.
     */
    function subscribe(uri, params, fn) {
        var Bridge = bridgeCtor();
        if (!Bridge) return function () {};
        var bridge = new Bridge();
        pending.push(bridge);
        bridge.onservicecallback = function (raw) {
            try {
                fn(JSON.parse(raw));
            } catch (e) {
                fn({ returnValue: false, errorText: 'Ungültige Antwort vom TV' });
            }
        };
        var p = {};
        Object.keys(params || {}).forEach(function (k) { p[k] = params[k]; });
        p.subscribe = true;
        bridge.call(uri, JSON.stringify(p));
        return function () {
            var i = pending.indexOf(bridge);
            if (i >= 0) pending.splice(i, 1);
            try { bridge.cancel(); } catch (e) { /* already closed */ }
        };
    }

    /*
     * Fallback for the "when | what" lists without CSS Grid (css/webos.css): the "when" column of the
     * grid is as wide as its widest entry (auto). Measured here after every change of these lists and
     * set as --when-w; --when-drop moves the smaller "when" text onto the baseline of "what".
     * Only with `no-grid` on <html>; does nothing where Grid works.
     */
    var LISTS = '.events, .pv-agenda, .ss-agenda';

    function marker() {
        var m = document.createElement('span');
        m.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        return m;
    }

    function fitList(box) {
        var whens = box.querySelectorAll('.when');
        if (!whens.length || !box.offsetWidth) return;
        box.style.setProperty('--when-w', 'auto');
        box.style.setProperty('--when-drop', '0px');
        var widest = 0;
        for (var i = 0; i < whens.length; i++) widest = Math.max(widest, whens[i].offsetWidth);
        var what = box.querySelector('.what');
        var drop = 0;
        if (what) {
            var a = whens[0].appendChild(marker());
            var b = what.appendChild(marker());
            drop = Math.max(0, Math.round(b.offsetTop - a.offsetTop));
            whens[0].removeChild(a);
            what.removeChild(b);
        }
        box.style.setProperty('--when-w', Math.ceil(widest) + 'px');
        box.style.setProperty('--when-drop', drop + 'px');
    }

    function watchLists() {
        var root = document.documentElement;
        if (!root.classList.contains('no-grid') || !window.MutationObserver) return;
        var queued = false;
        var observer = null;
        function run() {
            queued = false;
            var boxes = document.querySelectorAll(LISTS);
            for (var i = 0; i < boxes.length; i++) fitList(boxes[i]);
            // The measuring markers are added and removed above: drop those records, or every
            // measurement would schedule the next one.
            observer.takeRecords();
        }
        function queue() {
            if (queued) return;
            queued = true;
            requestAnimationFrame(run);
        }
        observer = new MutationObserver(queue);
        observer.observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['class']
        });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { queue(); });
        queue();
    }

    if (document.body) watchLists();
    else document.addEventListener('DOMContentLoaded', watchLists);

    window.Platform = {
        name: 'webos',
        APP_ID: APP_ID,
        KEYS: KEYS,
        // True on the TV (and in the preview, where webos-mock.js provides the bridge).
        available: function () { return !!bridgeCtor(); },
        call: call,
        subscribe: subscribe
    };
})();

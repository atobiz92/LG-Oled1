/*
 * Second way to the TV's app list, app start and inputs: LG's own remote-control interface (SSAP),
 * the one LG's phone app and Home Assistant use, here over ws://127.0.0.1:3000 on the TV itself.
 *
 * Why: webOS refuses applicationManager/listLaunchPoints to apps that are not LG's or a partner's
 * ("Denied method call"), so a developer-mode app cannot read the installed apps through Luna.
 * Through SSAP it can, after the TV has asked once whether "Ordiscale Launcher" may connect
 * (the TV's own prompt, answered on the remote). The key the TV hands out stays in this TV's
 * localStorage, never in logs or exports. Needs "LG Connect Apps" on (Einstellungen → Verbindung).
 *
 * Asked only for what the launcher needs: the installed apps, starting apps, the input list.
 * Declined: not asked again for a day (STORE.declined), so a "No" does not come back at every start.
 */
(function () {
    'use strict';

    var URL = 'ws://127.0.0.1:3000';
    var STORE = 'arn0.ssap.v1';
    var DAY = 24 * 60 * 60 * 1000;
    var PROMPT_MS = 60000;      // time to answer the TV's prompt
    var OPEN_MS = 4000;

    var PERMISSIONS = ['READ_INSTALLED_APPS', 'LAUNCH', 'READ_INPUT_DEVICE_LIST'];

    var ws = null;
    var ready = null;           // Promise of a registered connection
    var seq = 0;
    var waiting = {};           // id → { resolve, reject, timer }

    function load() {
        try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; }
    }

    function save(s) {
        try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* storage full or blocked */ }
    }

    function fail(err) {
        Object.keys(waiting).forEach(function (id) {
            clearTimeout(waiting[id].timer);
            waiting[id].reject(err);
        });
        waiting = {};
        ready = null;
        if (ws) {
            try { ws.close(); } catch (e) { /* already closed */ }
            ws = null;
        }
    }

    function send(type, uri, payload, ms) {
        return new Promise(function (resolve, reject) {
            if (!ws || ws.readyState !== 1) {
                reject(new Error('Verbindung zum TV getrennt'));
                return;
            }
            var id = 'l' + (++seq);
            waiting[id] = {
                resolve: resolve,
                reject: reject,
                timer: setTimeout(function () {
                    delete waiting[id];
                    reject(new Error((uri || type) + ': keine Antwort vom TV'));
                }, ms)
            };
            var msg = { type: type, id: id };
            if (uri) msg.uri = uri;
            if (payload) msg.payload = payload;
            ws.send(JSON.stringify(msg));
        });
    }

    function onMessage(ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        var w = waiting[msg.id];
        if (!w) return;
        // During pairing the TV first answers "PROMPT shown", then "registered" (or an error).
        if (msg.type === 'response' && msg.payload && msg.payload.pairingType === 'PROMPT') {
            DevLog.log('SSAP: the TV asks whether the launcher may connect');
            return;
        }
        clearTimeout(w.timer);
        delete waiting[msg.id];
        if (msg.type === 'error' || (msg.payload && msg.payload.returnValue === false)) {
            var err = new Error(msg.error || (msg.payload && msg.payload.errorText) || 'SSAP-Fehler');
            err.ssap = msg.error || '';
            w.reject(err);
            return;
        }
        w.resolve(msg.payload || {});
    }

    function register() {
        var s = load();
        var payload = {
            forcePairing: false,
            pairingType: 'PROMPT',
            manifest: { manifestVersion: 1, appVersion: '1.0', permissions: PERMISSIONS }
        };
        if (s.key) payload['client-key'] = s.key;
        return send('register', null, payload, PROMPT_MS).then(function (res) {
            if (res['client-key'] && res['client-key'] !== s.key) {
                save({ key: res['client-key'] });
                DevLog.log('SSAP: connection allowed on the TV');
            }
        }, function (err) {
            // Only an answer from the TV changes what is stored: a "No", or a key it no longer
            // knows. A dropped connection or a timeout keeps the key for the next start.
            if (err.ssap !== undefined) {
                if (/reject|denied|cancel/i.test(err.message)) save({ declined: Date.now() });
                else if (s.key) save({});
            }
            throw err;
        });
    }

    function connect() {
        if (ready) return ready;
        var s = load();
        if (s.declined && Date.now() - s.declined < DAY) {
            return Promise.reject(new Error('Verbindung am TV abgelehnt'));
        }
        if (typeof window.WebSocket !== 'function') return Promise.reject(new Error('Kein WebSocket'));
        ready = new Promise(function (resolve, reject) {
            var sock;
            var timer = setTimeout(function () { reject(new Error('LG Connect Apps nicht erreichbar')); }, OPEN_MS);
            try {
                sock = ws = new WebSocket(URL);
            } catch (e) {
                clearTimeout(timer);
                reject(e);
                return;
            }
            // Handlers of an earlier, already given-up socket must not touch the current one.
            sock.onopen = function () {
                if (ws !== sock) return;
                clearTimeout(timer);
                register().then(resolve, reject);
            };
            sock.onmessage = function (ev) {
                if (ws === sock) onMessage(ev);
            };
            sock.onerror = function () {
                if (ws !== sock) return;
                clearTimeout(timer);
                reject(new Error('LG Connect Apps nicht erreichbar'));
            };
            sock.onclose = function () {
                if (ws === sock) fail(new Error('Verbindung zum TV getrennt'));
            };
        });
        ready.catch(function (err) {
            DevLog.log('SSAP unavailable: ' + DevLog.errorText(err));
            fail(err);
        });
        return ready;
    }

    // One request, e.g. request('ssap://com.webos.applicationManager/listLaunchPoints').
    function request(uri, payload, ms) {
        return connect().then(function () {
            return send('request', uri, payload || {}, ms || 8000);
        });
    }

    window.Ssap = {
        request: request,
        // For the Lab/DevLog only: whether the TV has allowed the connection (never the key).
        paired: function () { return !!load().key; }
    };
})();

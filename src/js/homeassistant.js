/*
 * Home Assistant connection over its WebSocket API (ws://<address>/api/websocket, wss:// for https).
 * WebSockets are not subject to CORS; the only REST calls are the sign-in's (js/ha-auth.js).
 *
 * Connected only while something needs it (HA.connect(user) / HA.release(user)): today the view
 * "Zuhause" (js/ha-view.js) and "Verbindung prüfen" in Settings. Later features (doorbell, reminders)
 * add a user of their own and listen with HA.subscribe(eventType, fn); subscriptions are renewed
 * after every reconnect. A hidden launcher (an app in front) drops the connection; it comes back
 * when the launcher is visible again and someone still needs it.
 *
 * Which entities: those with the label "TV" on the entity; the main entities (no diagnostic, config,
 * hidden or disabled ones) of a device or an area with that label and of every integration chosen on
 * the TV (Prefs.haView.integrations); plus the members of a YAML group `group.tv`. The label,
 * entity, device and area registries are readable without admin rights in current Home Assistant
 * versions; when they are not (an old version without labels, or a refusal), group.tv still works
 * and the view says why the label could not be read.
 *
 * Cameras: one tile per device. UniFi Protect gives a camera one entity per channel (high, medium,
 * low resolution, a doorbell's package camera); the others are kept as `channels` of the tile, so
 * the view can ask for the lighter picture. A package camera gets a tile of its own only when it
 * carries the label itself. Names lose the channel words ("Klingel High Resolution Channel" ->
 * "Klingel").
 *
 * Three ways to sign in (Settings → Home Assistant): pairing with the phone (js/ha-pair.js, needs the
 * integration ordiscale_tv in HA), user name and password (js/ha-auth.js), or a long-lived token
 * (Prefs.homeAssistant.token). The first two leave only a refresh token (Prefs.homeAssistant.refresh,
 * with its client_id in `client` when it is not HAAuth.CLIENT_ID); every connect then first gets a
 * fresh access token if the one in memory is missing or about to expire; it is never stored. `auth`
 * names the one set up last; settings.js removes the others.
 * Either key goes only into the `auth` message on this socket: never into a URL, the log or an export.
 * The log gets the host, the status and error codes, nothing else.
 */
(function () {
    'use strict';

    var BACKOFF = [2000, 5000, 15000, 60000];   // reconnect delays; the last one repeats
    var CONNECT_TIMEOUT = 10000;    // from opening the socket to auth_ok
    var REQUEST_TIMEOUT = 15000;
    var PING_EVERY = 30000;         // a dead connection (TV off Wi-Fi, HA restarted) shows within a minute
    var RENEW_BEFORE = 60000;       // an access token with less than this left is renewed before connecting
    var LABEL_NAME = 'tv';          // compared case-insensitively with the label's name and id
    var GROUP_ID = 'group.tv';
    var DOMAINS = ['light', 'switch', 'fan', 'input_boolean', 'scene', 'script', 'cover', 'camera',
        'climate', 'sensor', 'binary_sensor', 'lock', 'button', 'event', 'alarm_control_panel'];

    var log = DevLog.log;

    var users = {};                 // who needs the connection: { view: true, check: true }
    // 'aus' | 'verbinde' | 'verbunden' | 'Token ungültig' | 'Anmeldung abgelaufen' | 'nicht erreichbar'
    var status = 'aus';
    var ws = null;
    var nextId = 1;
    var pending = {};               // id -> { resolve, reject, timer }
    var events = {};                // event type -> { id: subscription id or null, fns: [] }
    var authed = false;
    var invalid = false;            // key refused: no automatic retry until connect() is called again
    var access = null;              // sign-in only: { token, until } in memory, never stored
    var renewing = false;           // a renewal of the access token is under way
    var renewStamp = 0;             // bumped to make a running renewal's answer stale
    var authRetried = false;        // sign-in only: after one auth_invalid the token was renewed once
    var attempt = 0;
    var retryTimer = null;
    var retryAt = 0;
    var connectTimer = null;
    var pingTimer = null;
    var pingOpen = false;           // a ping without its pong yet
    var listeners = [];
    var changeListeners = [];       // fn(id, oldState, newState) for every change of an entity shown
    var commands = {};              // id of a streaming command (logbook) -> fn(event)
    var platforms = [];             // [{ platform, count }] from the last load, kept after release
    var data = emptyData();

    function emptyData() {
        return {
            ready: false,
            states: {},             // entity_id -> state object: the entities shown and their camera channels
            ids: [],                // the TV entities, in display order
            areas: {},              // entity_id -> area name ('' without one)
            meta: {},               // entity_id -> { areaId, deviceId, device, platform, own, name, short, channels }
            labelsReadable: true,
            labelFound: false,
            groupFound: false,
            peers: [],              // every door sensor, cover, lock, button and light in HA, chosen or not (doorPeers)
            version: ''
        };
    }

    function viewPrefs() {
        return Prefs.get().haView;
    }

    function prefs() {
        return Prefs.get().homeAssistant;
    }

    function hasUrl() {
        var p = prefs();
        return !!(p && p.url);
    }

    function hasToken() {
        var p = prefs();
        return !!(p && p.token);
    }

    // 'pair' (paired with the phone) or 'login' (user name and password), both a refresh token;
    // 'token' (long-lived token) or ''. Settings removes the others when one is set up; should both
    // kinds be there, `auth` says which came last.
    function methodOf(p) {
        if (!p) return '';
        if ((p.auth === 'login' || p.auth === 'pair') && p.refresh) return p.auth;
        if (p.auth === 'token' && p.token) return 'token';
        return p.refresh ? 'login' : p.token ? 'token' : '';
    }

    function method() {
        return methodOf(prefs());
    }

    // Signed in with a refresh token (pairing or password): access tokens are renewed from it.
    function viaRefresh() {
        var m = method();
        return m === 'login' || m === 'pair';
    }

    function hasAuth() {
        return !!method();
    }

    // Home Assistant refused the stored sign-in; settings.js clears this with the next one.
    function loginExpired() {
        var p = prefs();
        return !!(p && p.expired && !hasAuth());
    }

    function configured() {
        return hasUrl() && hasAuth();
    }

    // "http://192.168.1.5:8123/ha?x" -> { base: 'http://192.168.1.5:8123/ha', host: '192.168.1.5:8123', secure: false }
    function parts() {
        var m = /^(https?):\/\/(?:[^@\/?#]*@)?([^\/?#]+)([^?#]*)/i.exec(hasUrl() ? prefs().url : '');
        if (!m) return null;
        var path = m[3].replace(/\/+$/, '');
        return { base: m[1].toLowerCase() + '://' + m[2] + path, host: m[2], secure: /^https$/i.test(m[1]), path: path };
    }

    function host() {
        var p = parts();
        return p ? p.host : '';
    }

    function socketUrl() {
        var p = parts();
        return p ? (p.secure ? 'wss://' : 'ws://') + p.host + p.path + '/api/websocket' : null;
    }

    function notify(what) {
        listeners.forEach(function (fn) {
            try {
                fn(what);
            } catch (e) {
                log('Home Assistant listener failed: ' + DevLog.errorText(e));
            }
        });
    }

    function setStatus(s) {
        if (s === status) return;
        status = s;
        log('Home Assistant ' + host() + ': ' + s);
        notify('status');
    }

    function anyUser() {
        return Object.keys(users).length > 0;
    }

    // ---------- Socket

    function send(msg) {
        if (!ws || ws.readyState !== 1) return false;
        ws.send(JSON.stringify(msg));
        return true;
    }

    // A command with an id; resolves with `result`, rejects with { code, message }.
    function request(msg) {
        return new Promise(function (resolve, reject) {
            if (!authed) {
                reject({ code: 'not_connected', message: 'Nicht verbunden' });
                return;
            }
            var id = nextId++;
            msg.id = id;
            pending[id] = {
                resolve: resolve,
                reject: reject,
                timer: setTimeout(function () {
                    delete pending[id];
                    reject({ code: 'timeout', message: 'Keine Antwort' });
                }, REQUEST_TIMEOUT)
            };
            send(msg);
        });
    }

    function rejectAll(code) {
        Object.keys(pending).forEach(function (id) {
            clearTimeout(pending[id].timer);
            pending[id].reject({ code: code, message: code });
        });
        pending = {};
    }

    function stopTimers() {
        clearTimeout(connectTimer);
        clearInterval(pingTimer);
        connectTimer = null;
        pingTimer = null;
        pingOpen = false;
    }

    // Closes the socket on purpose: its close event must not count as a dropped connection.
    function closeSocket() {
        stopTimers();
        var s = ws;
        ws = null;
        authed = false;
        Object.keys(events).forEach(function (t) { events[t].id = null; });
        // Streaming commands end with the socket; their owners start them again on the next 'data'.
        commands = {};
        rejectAll('closed');
        if (s) {
            s.onopen = s.onmessage = s.onerror = s.onclose = null;
            try {
                s.close();
            } catch (e) {
                // Already closed.
            }
        }
    }

    function open() {
        clearTimeout(retryTimer);
        retryTimer = null;
        if (ws || renewing || !anyUser() || document.hidden) return;
        if (!configured()) {
            setStatus(loginExpired() ? 'Anmeldung abgelaufen' : 'aus');
            return;
        }
        var url = socketUrl();
        if (!url) {
            setStatus('nicht erreichbar');
            return;
        }
        invalid = false;
        setStatus('verbinde');
        if (viaRefresh() && !(access && access.until - Date.now() > RENEW_BEFORE)) {
            renew();
            return;
        }
        var s;
        try {
            s = new WebSocket(url);
        } catch (e) {
            log('Home Assistant ' + host() + ': socket refused (' + (e && e.name) + ')');
            dropped();
            return;
        }
        ws = s;
        nextId = 1;
        connectTimer = setTimeout(function () {
            if (authed) return;
            log('Home Assistant ' + host() + ': no answer within ' + (CONNECT_TIMEOUT / 1000) + ' s');
            closeSocket();
            dropped();
        }, CONNECT_TIMEOUT);
        s.onmessage = function (e) {
            var msg;
            try {
                msg = JSON.parse(e.data);
            } catch (err) {
                log('Home Assistant: unreadable message');
                return;
            }
            // Only with coalesce_messages, which is not requested; handled anyway.
            if (Array.isArray(msg)) msg.forEach(handle);
            else handle(msg);
        };
        s.onclose = function (e) {
            if (ws !== s) return;
            log('Home Assistant ' + host() + ': closed (' + e.code + ')');
            closeSocket();
            if (!invalid) dropped();
        };
        // The close event follows and does the rest.
        s.onerror = function () {};
    }

    // Sign-in only: a fresh access token from the stored refresh token, then open() again.
    function renew() {
        var stamp = ++renewStamp;
        var refreshToken = prefs().refresh;
        var base = parts().base;
        renewing = true;
        HAAuth.refresh(base, refreshToken, prefs().client).then(function (r) {
            if (stamp !== renewStamp) return;   // reset, released or hidden meanwhile
            renewing = false;
            access = { token: r.access, until: Date.now() + r.expiresIn * 1000 };
            log('Home Assistant ' + host() + ': access renewed (valid ' + r.expiresIn + ' s)');
            open();
        }, function (err) {
            // A final refusal counts even when the view was left meanwhile: every refused renewal is
            // a failed login in HA (ip_ban), so the same token must never be sent again.
            if (err.code === 'expired' || err.code === 'denied') {
                if (stamp === renewStamp) renewing = false;
                if (prefs() && prefs().refresh === refreshToken && parts().base === base) lost();
                return;
            }
            if (stamp !== renewStamp) return;
            renewing = false;
            log('Home Assistant ' + host() + ': renewal failed (' + err.code + ')');
            dropped();
        });
    }

    function stopRenew() {
        renewStamp++;
        renewing = false;
    }

    // The stored sign-in is no good any more (revoked, deleted in HA, 90 days unused, user disabled).
    // The refresh token goes; `expired` keeps the tile and lets the view and Settings say so.
    function lost() {
        var p = prefs();
        delete p.refresh;
        delete p.client;
        if (p.auth === 'login' || p.auth === 'pair') delete p.auth;
        p.expired = true;
        Prefs.save();
        access = null;
        invalid = true;
        data = emptyData();
        setStatus('Anmeldung abgelaufen');
        notify('user');
        notify('data');
    }

    // Lost or never reached: try again after 2, 5, 15, then every 60 s while still needed.
    function dropped() {
        setStatus('nicht erreichbar');
        if (!anyUser() || document.hidden) return;
        var delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
        attempt++;
        retryAt = Date.now() + delay;
        log('Home Assistant ' + host() + ': retry in ' + (delay / 1000) + ' s');
        clearTimeout(retryTimer);
        retryTimer = setTimeout(open, delay);
        notify('status');
    }

    function handle(msg) {
        switch (msg.type) {
            case 'auth_required':
                // The only place a key is used. Never logged.
                send({ type: 'auth', access_token: viaRefresh() ? (access ? access.token : '') : prefs().token });
                break;
            case 'auth_ok':
                authed = true;
                attempt = 0;
                authRetried = false;
                clearTimeout(connectTimer);
                data.version = msg.ha_version || '';
                log('Home Assistant ' + host() + ': authenticated (HA ' + data.version + ')');
                startPing();
                resubscribe();
                setStatus('verbunden');
                // Before load(): "Verbindung prüfen" closes once the entities are in, and the name
                // should be there by then.
                if (viaRefresh()) readUser();
                load();
                break;
            case 'auth_invalid':
                closeSocket();
                data = emptyData();
                // An access token can be refused although it has not run out (HA restarted with a
                // restored backup, clock skew): renew once and try again before giving up.
                if (viaRefresh() && !authRetried) {
                    authRetried = true;
                    access = null;
                    log('Home Assistant ' + host() + ': access refused, renewing once');
                    open();
                    break;
                }
                invalid = true;
                log('Home Assistant ' + host() + ': ' + (viaRefresh() ? 'renewed access refused' : 'token refused'));
                setStatus(viaRefresh() ? 'Anmeldung abgelaufen' : 'Token ungültig');
                notify('data');
                break;
            case 'result':
                var p = pending[msg.id];
                if (!p) return;
                delete pending[msg.id];
                clearTimeout(p.timer);
                if (msg.success) p.resolve(msg.result);
                else p.reject(msg.error || { code: 'unknown_error', message: '' });
                break;
            case 'event':
                if (commands[msg.id]) commands[msg.id](msg.event);
                else dispatch(msg.id, msg.event);
                break;
            case 'pong':
                pingOpen = false;
                break;
        }
    }

    // The signed-in user's name for "Angemeldet als …" (auth/current_user, readable by every user).
    function readUser() {
        request({ type: 'auth/current_user' }).then(function (u) {
            var p = prefs();
            var name = u && String(u.name || '').trim();
            if (!name || !p || !viaRefresh() || p.user === name) return;
            p.user = name;
            Prefs.save();
            notify('user');
        }, function (err) {
            log('Home Assistant: current user not readable (' + (err && err.code) + ')');
        });
    }

    function startPing() {
        clearInterval(pingTimer);
        pingOpen = false;
        pingTimer = setInterval(function () {
            if (pingOpen) {
                log('Home Assistant ' + host() + ': no pong');
                closeSocket();
                dropped();
                return;
            }
            pingOpen = true;
            send({ type: 'ping', id: nextId++ });
        }, PING_EVERY);
    }

    // ---------- Events (state_changed today; doorbell and reminders later)

    function sendSubscribe(type) {
        var entry = events[type];
        // The id request() is about to take: events carrying it belong to this subscription.
        var id = nextId;
        entry.id = id;
        request({ type: 'subscribe_events', event_type: type }).catch(function (err) {
            log('Home Assistant: subscribe ' + type + ' failed (' + err.code + ')');
            if (entry.id === id) entry.id = null;
        });
    }

    function resubscribe() {
        Object.keys(events).forEach(function (type) {
            if (events[type].fns.length) sendSubscribe(type);
        });
    }

    function dispatch(id, event) {
        Object.keys(events).forEach(function (type) {
            var entry = events[type];
            if (entry.id !== id) return;
            entry.fns.slice().forEach(function (fn) { fn(event); });
        });
    }

    // fn(event) for every event of this type while connected. Returns a function that ends it.
    function subscribe(type, fn) {
        var entry = events[type] || (events[type] = { id: null, fns: [] });
        entry.fns.push(fn);
        if (authed && entry.id === null) sendSubscribe(type);
        return function () {
            var i = entry.fns.indexOf(fn);
            if (i >= 0) entry.fns.splice(i, 1);
            if (!entry.fns.length && entry.id !== null && authed) {
                request({ type: 'unsubscribe_events', subscription: entry.id }).catch(function () {});
                entry.id = null;
            }
        };
    }

    // ---------- Which entities, and their states

    function failed(what) {
        return function (err) {
            log('Home Assistant: ' + what + ' not readable (' + (err && err.code) + ')');
            return null;
        };
    }

    // state_changed events that arrive while load() is still waiting for its answers. The snapshot
    // may be older or newer than each of them, so they are applied afterwards by timestamp.
    var queuedEvents = {};
    // One load at a time, per socket: `loading` holds the socket it runs on. A reason to load again
    // while one runs (group.tv changed) only marks `reloadAgain`, which runs once it has finished.
    var loading = null;
    var reloadAgain = false;

    function load() {
        var started = ws;
        if (loading && loading === started) {
            reloadAgain = true;
            return;
        }
        queuedEvents = {};
        reloadAgain = false;
        loading = started;
        function stale() {
            if (loading === started) loading = null;
            return ws !== started;
        }
        Promise.all([
            request({ type: 'get_states' }),
            request({ type: 'config/label_registry/list' }).catch(failed('labels')),
            request({ type: 'config/entity_registry/list' }).catch(failed('entity registry')),
            request({ type: 'config/device_registry/list' }).catch(failed('device registry')),
            request({ type: 'config/area_registry/list' }).catch(failed('areas'))
        ]).then(function (r) {
            if (stale()) return;     // reconnected or released meanwhile
            if (reloadAgain) {
                load();             // group.tv changed under this answer: select from a fresh one
                return;
            }
            data = select(r[0] || [], r[1], r[2], r[3], r[4]);
            applyPending();
            log('Home Assistant: ' + data.ids.length + ' TV entities (labels ' +
                (data.labelsReadable ? (data.labelFound ? 'read' : 'without "TV"') : 'not readable') +
                ', group.tv ' + (data.groupFound ? 'found' : 'absent') + ')');
            notify('data');
        }).catch(function (err) {
            if (stale()) return;
            reloadAgain = false;
            log('Home Assistant: states not readable (' + (err && err.code) + ')');
            closeSocket();
            dropped();
        });
    }

    function named(state) {
        var a = state.attributes || {};
        return a.friendly_name || state.entity_id;
    }

    function domainOf(id) {
        return id.split('.')[0];
    }

    // ---------- Names: without the technical words integrations add

    var CHANNEL_EN = /\s*[-–·:]?\s*\b(high|medium|low)[\s_-]*resolution[\s_-]*channel\b(\s*\(?insecure\)?)?\s*$/i;
    var CHANNEL_DE = /\s*[-–·:]?\s*\b(hohe|mittlere|niedrige)\s+auflösung(skanal)?\b(\s*\(?unsicher\)?)?\s*$/i;
    var INSECURE = /\s*[-–·:]?\s*\(?(insecure|unsicher)\)?\s*$/i;
    var PACKAGE = /\s*[-–·:]?\s*\b(package[\s_-]*camera|paketkamera)\s*$/i;

    // Which stream of a camera an entity is: 'high' | 'medium' | 'low' | 'package' | 'main', with
    // '-insecure' for Protect's RTSP twin of a channel (disabled by default).
    function channelOf(id, name) {
        // Id and name each on their own, the channel phrase at their end: "High Garden" is a name,
        // and a renamed entity still has the phrase in its id.
        var parts = [String(id).replace(/^camera\./, ''), String(name || '')].map(function (x) {
            return x.toLowerCase().replace(/[_.]/g, ' ').replace(/\s+/g, ' ').trim();
        });
        var i, m;
        // The doorbell's package lens only ("… Package Camera"), not a place called "Paketstation".
        for (i = 0; i < parts.length; i++) {
            if (/\b(package camera|paketkamera)$/.test(parts[i])) return 'package';
        }
        var WORD = { high: 'high', hohe: 'high', medium: 'medium', mittlere: 'medium', low: 'low', niedrige: 'low' };
        for (i = 0; i < parts.length; i++) {
            m = /\b(high|medium|low) resolution channel( \(?insecure\)?)?$/.exec(parts[i]) ||
                /\b(hohe|mittlere|niedrige) auflösung(?:skanal)?( \(?unsicher\)?)?$/.exec(parts[i]);
            if (m) return WORD[m[1]] + (m[2] ? '-insecure' : '');
        }
        return 'main';
    }

    /*
     * "Klingel High Resolution Channel" -> "Klingel", "Klingel Package Camera" -> "Klingel Paket",
     * "Haustür Haustür" -> "Haustür". A name that is nothing but those words falls back to the
     * device's name, then the area's.
     */
    function cleanName(raw, device, area) {
        var n = String(raw || '').trim();
        n = n.replace(CHANNEL_EN, '').replace(CHANNEL_DE, '').replace(INSECURE, '');
        if (PACKAGE.test(n)) n = (n.replace(PACKAGE, '') + ' Paket').trim();
        // A device name repeated at the start ("Haustür Haustür Kontakt").
        var dup = /^(.+?)\s+\1(\s|$)/i.exec(n);
        if (dup) n = (dup[1] + n.slice(dup[0].length - dup[2].length)).trim();
        if (!n || n.toLowerCase() === 'paket') n = (String(device || '').trim() + (n ? ' Paket' : '')).trim();
        return n || String(area || '').trim() || String(raw || '');
    }

    // The camera block's name line: as short as the name allows ("Kamera Garten" -> "Garten").
    function shortName(name) {
        var n = String(name || '');
        var cut = n.replace(/^(kamera|camera|cam)\s+/i, '').replace(/\s+(kamera|camera|cam)$/i, '');
        return cut || n;
    }

    function select(states, labels, entities, devices, areas) {
        var d = emptyData();
        d.version = data.version;
        d.ready = true;
        var byId = {};
        states.forEach(function (s) { byId[s.entity_id] = s; });

        var labelIds = Object.create(null);   // label ids are free text ("constructor" must not match)
        d.labelsReadable = !!(labels && entities);
        (labels || []).forEach(function (l) {
            if (String(l.name || '').trim().toLowerCase() === LABEL_NAME || l.label_id === LABEL_NAME) {
                labelIds[l.label_id] = true;
                d.labelFound = true;
            }
        });
        function tvLabel(list) {
            return (list || []).some(function (id) { return labelIds[id]; });
        }

        var areaNames = {};
        var tvAreas = Object.create(null);
        (areas || []).forEach(function (a) {
            areaNames[a.area_id] = a.name || '';
            if (tvLabel(a.labels)) tvAreas[a.area_id] = true;
        });
        var deviceById = {};
        (devices || []).forEach(function (dv) { deviceById[dv.id] = dv; });
        var wanted = Object.create(null);
        ((viewPrefs() && viewPrefs().integrations) || []).forEach(function (p) { wanted[p] = true; });

        var regById = {};
        var counts = Object.create(null);
        var chosen = {};        // entity_id -> 'own' (label on the entity, group.tv) | 'via' (device, area, integration)
        (entities || []).forEach(function (e) {
            regById[e.entity_id] = e;
            if (e.disabled_by) return;
            var dev = e.device_id ? deviceById[e.device_id] : null;
            var areaId = e.area_id || (dev && dev.area_id) || '';
            // Main entities only for everything chosen as a whole: no diagnostic, config or hidden ones.
            var main = !e.entity_category && !e.hidden_by;
            var shown = main && byId[e.entity_id] && DOMAINS.indexOf(domainOf(e.entity_id)) >= 0;
            if (shown && e.platform) counts[e.platform] = (counts[e.platform] || 0) + 1;
            if (tvLabel(e.labels)) chosen[e.entity_id] = 'own';
            else if (main && ((dev && tvLabel(dev.labels)) || tvAreas[areaId] || (e.platform && wanted[e.platform]))) chosen[e.entity_id] = 'via';
        });
        platforms = Object.keys(counts).map(function (p) { return { platform: p, count: counts[p] }; });

        // Works without the registries: members of a YAML group group.tv.
        var group = byId[GROUP_ID];
        if (group) {
            d.groupFound = true;
            ((group.attributes || {}).entity_id || []).forEach(function (id) { chosen[id] = 'own'; });
        }

        function metaOf(id) {
            var e = regById[id] || {};
            var dev = e.device_id ? deviceById[e.device_id] : null;
            var areaId = e.area_id || (dev && dev.area_id) || '';
            return {
                areaId: areaId,
                area: areaNames[areaId] || '',
                deviceId: e.device_id || '',
                device: dev ? (dev.name_by_user || dev.name || '') : '',
                platform: e.platform || '',
                own: chosen[id] === 'own'
            };
        }

        var ids = Object.keys(chosen).filter(function (id) {
            return byId[id] && DOMAINS.indexOf(domainOf(id)) >= 0;
        });
        ids.forEach(function (id) { d.meta[id] = metaOf(id); });

        // One camera tile per device; its other streams become the tile's channels.
        var cameraOf = {};      // device id -> the tile's entity
        ids = ids.filter(function (id) {
            if (domainOf(id) !== 'camera') return true;
            var m = d.meta[id];
            var ch = channelOf(id, named(byId[id]));
            m.channel = ch;
            if (ch === 'package') return m.own;    // the doorbell's second lens: only when asked for itself
            // Only resolution channels are one camera (UniFi Protect "… High/Medium/Low Resolution
            // Channel"); two plain cameras of one device are two views and stay two tiles.
            if (!m.deviceId || ch.replace('-insecure', '') === 'main') return true;
            var first = cameraOf[m.deviceId];
            // The high channel (or the plain one) stands for the device; the others drop out.
            if (first && rank(d.meta[first].channel) <= rank(ch)) return false;
            if (first) d.meta[first].dropped = true;
            cameraOf[m.deviceId] = id;
            return true;
        }).filter(function (id) { return !d.meta[id].dropped; });
        function rank(ch) {
            return ['high', 'main', 'medium', 'low'].indexOf(ch.replace('-insecure', '')) + (/-insecure/.test(ch) ? 4 : 0);
        }
        // Every enabled stream of the device, also those not chosen themselves (Protect enables only
        // the high channel by default; a medium one the viewer enabled is lighter for the TV).
        Object.keys(cameraOf).forEach(function (devId) {
            var tile = cameraOf[devId];
            var channels = {};
            (entities || []).forEach(function (e) {
                if (e.device_id !== devId || e.disabled_by || domainOf(e.entity_id) !== 'camera' || !byId[e.entity_id]) return;
                var ch = channelOf(e.entity_id, named(byId[e.entity_id]));
                var base = ch.replace('-insecure', '');
                if (ch === 'package' || base === 'main') return;
                if (!channels[base] || /-insecure/.test(channels[base].ch)) channels[base] = { id: e.entity_id, ch: ch };
            });
            var list = {};
            Object.keys(channels).forEach(function (k) {
                list[k] = channels[k].id;
                d.states[channels[k].id] = byId[channels[k].id];
            });
            d.meta[tile].channels = list;
        });

        ids.forEach(function (id) {
            var m = d.meta[id];
            d.states[id] = byId[id];
            d.areas[id] = m.area;
            m.name = cleanName(named(byId[id]), m.device, m.area);
            m.short = domainOf(id) === 'camera' ? shortName(m.name) : m.name;
        });
        if (group) d.states[GROUP_ID] = group;
        // Cameras first in their area (they are the big tiles), then by name.
        ids.sort(function (a, b) {
            return (d.areas[a] || '￿').localeCompare(d.areas[b] || '￿', 'de') ||
                (domainOf(a) === 'camera' ? 0 : 1) - (domainOf(b) === 'camera' ? 0 : 1) ||
                d.meta[a].name.localeCompare(d.meta[b].name, 'de');
        });
        d.ids = ids;
        // Whether a door opener belongs to a door can only be told from all of HA, not from what the
        // TV shows: a second door or opener left out of the selection still makes it uncertain.
        (entities || []).forEach(function (e) {
            var dom = domainOf(e.entity_id);
            if (e.disabled_by || ['binary_sensor', 'cover', 'lock', 'button', 'light'].indexOf(dom) < 0) return;
            var st = byId[e.entity_id];
            var m = metaOf(e.entity_id);
            d.peers.push({
                id: e.entity_id, domain: dom, name: st ? named(st) : (e.name || e.original_name || ''),
                deviceClass: (st && st.attributes && st.attributes.device_class) || e.device_class || e.original_device_class || '',
                deviceId: m.deviceId, areaId: m.areaId, platform: e.platform || ''
            });
        });
        return d;
    }

    function newer(a, b) {
        return !b || String((a && a.last_updated) || '') >= String(b.last_updated || '');
    }

    // The tile of an entity that has no state for the moment: its name, shown as unavailable.
    function gone(old) {
        var a = (old && old.attributes) || {};
        return { entity_id: old.entity_id, state: 'unavailable', attributes: { friendly_name: a.friendly_name }, last_updated: '' };
    }

    function applyPending() {
        Object.keys(queuedEvents).forEach(function (id) {
            var e = queuedEvents[id];
            if (!data.states[id]) return;
            if (!e.new_state) {
                data.states[id] = gone(data.states[id]);
            } else if (newer(e.new_state, data.states[id])) {
                data.states[id] = e.new_state;
            }
        });
        queuedEvents = {};
    }

    function onStateChanged(event) {
        var e = event && event.data;
        if (!e) return;
        var id = e.entity_id;
        // group.tv got other members: read everything again (or once more, after a load that runs).
        if (id === GROUP_ID && (loading || data.ready)) {
            load();
            return;
        }
        // During a (re)load the coming snapshot replaces data, so keep the event for afterwards too.
        if (loading && id) queuedEvents[id] = e;
        if (!data.ready) return;
        if (!data.states[id]) return;
        var before = data.states[id];
        if (!e.new_state) {
            // Removed or restarting: the tile stays (as unavailable) and comes back with the next state.
            data.states[id] = gone(data.states[id]);
            changed(id, before, data.states[id]);
            notify(id);
            return;
        }
        data.states[id] = e.new_state;
        changed(id, before, e.new_state);
        notify(id);
    }

    function changed(id, before, after) {
        changeListeners.forEach(function (fn) {
            try {
                fn(id, before, after);
            } catch (err) {
                log('Home Assistant change listener failed: ' + DevLog.errorText(err));
            }
        });
    }

    subscribe('state_changed', onStateChanged);

    // ---------- Public

    function connect(user) {
        users[user || 'default'] = true;
        if (ws || retryTimer || renewing) return;
        attempt = 0;
        open();
    }

    function release(user) {
        delete users[user || 'default'];
        if (anyUser()) return;
        clearTimeout(retryTimer);
        retryTimer = null;
        stopRenew();
        closeSocket();
        data = emptyData();
        if (!invalid) setStatus('aus');
    }

    // Address or sign-in changed: start over with the new ones. fresh (after a sign-in): the access
    // token it brought, { access, expiresIn }, so the first connect needs no renewal.
    // Counts resets (another server or account): HAHistory drops what it collected before.
    var epoch = 0;

    function reset(fresh) {
        epoch++;
        clearTimeout(retryTimer);
        retryTimer = null;
        stopRenew();
        closeSocket();
        invalid = false;
        authRetried = false;
        access = fresh && fresh.access ? { token: fresh.access, until: Date.now() + fresh.expiresIn * 1000 } : null;
        data = emptyData();
        setStatus('aus');
        if (anyUser()) {
            attempt = 0;
            open();
        }
    }

    function retryNow() {
        if (ws || renewing) return;
        attempt = 0;
        open();
    }

    function doorPeers() { return data.peers || []; }

    function tvEntities() {
        return data.ids.map(function (id) {
            var s = data.states[id];
            var m = data.meta[id] || {};
            return {
                id: id, name: m.name || named(s), short: m.short || m.name || named(s), domain: domainOf(id),
                area: data.areas[id] || '', areaId: m.areaId || '', deviceId: m.deviceId || '',
                platform: m.platform || '', own: !!m.own, channels: m.channels || null, state: s
            };
        });
    }

    /*
     * A command that keeps answering with events (logbook/event_stream): fn(event) for each. Resolves
     * with a function that ends it. It ends with the connection too; start it again after the next
     * 'data' (every connect loads afresh).
     */
    function stream(msg, fn) {
        if (!authed) return Promise.reject({ code: 'not_connected', message: 'Nicht verbunden' });
        var id = nextId;    // the id request() is about to take
        commands[id] = fn;
        return request(msg).then(function () {
            return function stop() {
                if (!commands[id]) return;
                delete commands[id];
                if (authed) request({ type: 'unsubscribe_events', subscription: id }).catch(function () {});
            };
        }, function (err) {
            delete commands[id];
            throw err;
        });
    }

    // camera/stream (no admin rights needed, HA camera/__init__.py ws_camera_stream): an HLS playlist
    // for a live picture. The URL carries Home Assistant's own short-lived stream token in its path.
    function cameraStream(id) {
        return request({ type: 'camera/stream', entity_id: id, format: 'hls' }).then(function (r) {
            var url = r && r.url;
            if (!url) throw { code: 'no_url', message: '' };
            var p = parts();
            return /^https?:/i.test(url) || !p ? url : p.base + url;
        });
    }

    // Integrations seen in the entity registry, with their main entities: for "Integrationen einbeziehen".
    function platformList() {
        var chosen = (viewPrefs() && viewPrefs().integrations) || [];
        var list = platforms.slice();
        chosen.forEach(function (p) {
            if (!list.some(function (x) { return x.platform === p; })) list.push({ platform: p, count: 0 });
        });
        return list.sort(function (a, b) { return b.count - a.count || a.platform.localeCompare(b.platform); });
    }

    // The choice changed (labels or integrations): pick the entities again from a fresh answer.
    function reload() {
        if (authed) load();
    }

    function info() {
        return {
            ready: data.ready,
            count: data.ids.length,
            labelsReadable: data.labelsReadable,
            labelFound: data.labelFound,
            groupFound: data.groupFound,
            retryIn: retryTimer ? Math.max(0, retryAt - Date.now()) : 0
        };
    }

    // call('light', 'toggle', {}, { entity_id: 'light.x' })
    function call(domain, service, serviceData, target) {
        var msg = { type: 'call_service', domain: domain, service: service };
        if (serviceData) msg.service_data = serviceData;
        if (target) msg.target = target;
        return request(msg).catch(function (err) {
            log('Home Assistant: ' + domain + '.' + service + ' failed (' + (err && err.code) + ')');
            throw err;
        });
    }

    /*
     * The shape of each camera's picture (width / height), learnt from the pictures it sends. A
     * 180-degree camera is far wider than 16:9: asked for the box's own 16:9, it came back squeezed
     * or small and was blown up to fill the tile, which made it blocky. All channels of one camera
     * share the shape (UniFi Protect: high, medium, low resolution channel).
     */
    var shapes = Object.create(null);
    var WIDE = 2;      // from 2:1 a camera is shown whole (contain), see ha-view.js

    function shapeKey(id) {
        return String(id).replace(/_(high|medium|low)_resolution_channel$/, '');
    }

    // img: a loaded picture of the camera. Notes size and load time in the DevLog once per size.
    function cameraSeen(id, img, ms) {
        if (!img || !img.naturalWidth || !img.naturalHeight) return;
        var key = shapeKey(id);
        var aspect = img.naturalWidth / img.naturalHeight;
        var seen = img.naturalWidth + 'x' + img.naturalHeight;
        var old = shapes[key];
        shapes[key] = { aspect: aspect, seen: seen };
        if (!old || old.seen !== seen) log('Camera ' + id + ': ' + seen + (ms ? ', ' + ms + ' ms' : ''));
    }

    function cameraShape(id) {
        var s = shapes[shapeKey(id)];
        return s ? s.aspect : 0;
    }

    function cameraWide(id) { return cameraShape(id) >= WIDE; }

    // [width, height] to ask for a picture in a box of w × h: the camera's own shape, as large as the
    // box needs (cover: the box is filled, contain: the picture fits in it). Unknown shape: the box.
    function cameraSize(id, w, h, fit) {
        if (!w || !h) return null;
        var a = cameraShape(id);
        if (!a) return [Math.round(w), Math.round(h)];
        var wider = a > w / h;
        var byWidth = fit === 'contain' ? wider : !wider;
        return byWidth ? [Math.round(w), Math.round(w / a)] : [Math.round(h * a), Math.round(h)];
    }

    // A still image of a camera with the camera's own short-lived token (from its state), never
    // the long-lived one. The preview simulator draws its own picture.
    // width and height (both): Home Assistant scales a JPEG before sending it (camera/__init__.py
    // _async_get_image; UniFi Protect asks the camera for that size), so the TV never decodes 4K.
    // They are the box the picture goes in; the size asked keeps the camera's own shape (cameraSize),
    // fit: 'cover' (fills the box, edges cut) or 'contain' (all of it, bars beside or above).
    function cameraUrl(id, width, height, fit) {
        var wh = cameraSize(id, width, height, fit);
        var size = wh ? '&width=' + wh[0] + '&height=' + wh[1] : '';
        if (window.__TIZEN_MOCK__ && window.HAMock && HAMock.handles(host())) return HAMock.cameraUrl(id, wh && wh[0], wh && wh[1]);
        var s = data.states[id];
        var token = s && s.attributes && s.attributes.access_token;
        var p = parts();
        if (!token || !p) return '';
        return p.base + '/api/camera_proxy/' + encodeURIComponent(id) + '?token=' + encodeURIComponent(token) + size + '&t=' + Date.now();
    }

    /*
     * Settings → Home Assistant → "Verbindung prüfen": connects, reads the entities and closes again
     * (unless something else still needs the connection). Resolves with { status, count, info }.
     */
    // A second "Verbindung prüfen" while one is running shares it: two checks would release the
    // same user, and the first to finish would close the connection under the other.
    var checking = null;

    function check() {
        if (checking) return checking;
        var run = new Promise(function (resolve) {
            var done = false;
            var timer = null;
            function finish() {
                if (done) return;
                done = true;
                clearTimeout(timer);
                var i = listeners.indexOf(watch);
                if (i >= 0) listeners.splice(i, 1);
                var result = { status: status, info: info() };
                release('check');
                resolve(result);
            }
            function watch() {
                if (data.ready || status === 'Token ungültig' || status === 'Anmeldung abgelaufen' || status === 'nicht erreichbar') finish();
            }
            listeners.push(watch);
            timer = setTimeout(finish, CONNECT_TIMEOUT + REQUEST_TIMEOUT);
            if (ws && data.ready) {
                finish();
                return;
            }
            users.check = true;
            // A refused token or an earlier failure is tried again right away for an explicit check.
            if (!ws && !renewing) {
                clearTimeout(retryTimer);
                retryTimer = null;
                attempt = 0;
                open();
            }
            if (!configured()) finish();
        });
        // Cleared once it has settled (it may settle inside the executor, before this assignment).
        checking = run;
        run.then(function () { if (checking === run) checking = null; });
        return run;
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            if (ws || retryTimer || renewing) {
                clearTimeout(retryTimer);
                retryTimer = null;
                stopRenew();
                closeSocket();
                setStatus('aus');
            }
            return;
        }
        if (anyUser() && !ws && !invalid) {
            attempt = 0;
            open();
        }
    });

    window.HA = {
        configured: configured,
        hasUrl: hasUrl,
        hasToken: hasToken,
        hasAuth: hasAuth,
        method: method,
        viaRefresh: viaRefresh,
        methodOf: methodOf,
        loginExpired: loginExpired,
        user: function () { var p = prefs(); return (p && p.user) || ''; },
        host: host,
        base: function () { var p = parts(); return p ? p.base : ''; },
        connect: connect,
        release: release,
        reset: reset,
        retryNow: retryNow,
        check: check,
        status: function () { return status; },
        info: info,
        state: function (id) { return data.states[id] || null; },
        tvEntities: tvEntities,
        doorPeers: doorPeers,
        call: call,
        subscribe: subscribe,
        cameraUrl: cameraUrl,
        epoch: function () { return epoch; },
        cameraSeen: cameraSeen,
        cameraWide: cameraWide,
        cameraStream: cameraStream,
        request: request,
        stream: stream,
        platforms: platformList,
        reload: reload,
        cleanName: cleanName,
        channelOf: channelOf,
        // fn(id, oldState, newState) for each change of an entity shown (popups, the history)
        onChange: function (fn) { changeListeners.push(fn); },
        onUpdate: function (fn) { listeners.push(fn); }
    };
})();

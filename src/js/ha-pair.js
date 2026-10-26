/*
 * Pairing with the phone (Settings → Home Assistant → "Mit dem Handy koppeln", and the first-run
 * assistant). Needs the integration ordiscale_tv in Home Assistant; the contract is homeassistant/API.md,
 * the requests are in js/ha-auth.js (pairStart, pairPoll).
 *
 * The view shows a QR code with the HA address and the approval page's path, and next to it the
 * six-character code. Someone scans, signs in to Home Assistant on the phone, types the code and
 * approves; the TV polls meanwhile and takes the refresh token it is then handed once. The QR code
 * holds nothing secret: the poll secret stays in this file's memory, the code only on the screen,
 * and the log gets states and the first six characters of the pairing id, nothing else.
 *
 * Polling runs only while this view is on screen, the launcher is visible and the code is valid:
 * leaving the view, an app in front (visibilitychange) or the end of its time stops it. Coming back
 * to the launcher with time left goes on with the same code.
 *
 * The QR encoder (Kazuhiko Arase's qrcode-generator 2.0.4, MIT, js/vendor) is loaded the first time
 * the view opens, like ical.js in js/calendar.js: nothing at start-up.
 */
(function () {
    'use strict';

    var $ = UI.$;
    var el = UI.el;

    var QR_SRC = 'js/vendor/qrcode-generator-2.0.4.js';
    var QR_PX = 440;            // target size of the code incl. its quiet zone; ≥ 360 px reads from 3 m
    var QUIET = 4;              // modules of white around the code, as the standard asks
    var OFFLINE_RETRY = 5;      // s between polls while Home Assistant does not answer
    var DEFAULT_NAME = 'Fernseher';

    var log = DevLog.log;

    // opts of the current open(): { base, host, apply(result) → Promise, login(), token(), address(), done() }
    var opts = null;
    // The running pairing: { pairing, until, timer, polling } — replaced (never reused) on every start,
    // so an answer that arrives for an older one is recognised and dropped.
    var run = null;
    var tick = null;
    // 'loading' | 'pending' | 'expired' | 'denied' | 'not_installed' | 'disabled' | 'busy' |
    // 'unreachable' | 'error' | 'connecting' | 'done' | 'no_connection'
    var state = 'loading';
    var detail = '';            // extra text for some states (HTTP status, retry time, connection state)
    var offline = false;        // the last poll got no answer; still trying

    var view = null;
    var parts = {};

    // ---------- QR code

    var qrLoading = null;

    function loadQr() {
        if (window.qrcode) return Promise.resolve();
        if (qrLoading) return qrLoading;
        qrLoading = new Promise(function (resolve, reject) {
            var tag = document.createElement('script');
            tag.src = QR_SRC;
            tag.onload = function () {
                if (window.qrcode) resolve();
                else reject(new Error('QR library broken'));
            };
            tag.onerror = function () {
                if (tag.parentNode) tag.parentNode.removeChild(tag);
                qrLoading = null;
                reject(new Error('QR library not loadable'));
            };
            document.head.appendChild(tag);
        });
        return qrLoading;
    }

    /*
     * The code as one SVG path, black on white, with its quiet zone. Error correction M (15 %), the
     * version as small as the text allows. Whole pixels per module, so every edge is sharp; the
     * size lands between 360 and QR_PX for an address of normal length.
     */
    // The address as the phone must read it: plain ASCII. The QR library writes one byte per
    // character, so a domain with umlauts would come out garbled; URL gives its punycode form.
    function qrText(base, path) {
        try {
            return new URL(base + path).href;
        } catch (e) {
            return base + path;
        }
    }

    function qrSvg(text) {
        var qr = window.qrcode(0, 'M');
        qr.addData(text, 'Byte');
        qr.make();
        var n = qr.getModuleCount();
        var cells = n + QUIET * 2;
        var mod = Math.max(4, Math.floor(QR_PX / cells));
        var d = '';
        for (var r = 0; r < n; r++) {
            for (var c = 0; c < n; c++) {
                if (qr.isDark(r, c)) d += 'M' + (c + QUIET) + ' ' + (r + QUIET) + 'h1v1h-1z';
            }
        }
        var px = cells * mod;
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="0 0 ' +
            cells + ' ' + cells + '" shape-rendering="crispEdges" aria-label="QR-Code">' +
            '<rect width="' + cells + '" height="' + cells + '" fill="#fff"/><path fill="#000" d="' + d + '"/></svg>';
    }

    // ---------- Pairing

    function stopTimers() {
        if (run) {
            clearTimeout(run.timer);
            run.timer = null;
        }
        clearInterval(tick);
        tick = null;
    }

    // Stops everything; a reply still under way finds `run` changed and is ignored.
    function stop() {
        stopTimers();
        run = null;
    }

    /*
     * A pairing left while it still waits is parked, not dropped: opening the view again within
     * its time picks it up (same QR code and code). Otherwise every open-and-leave would leave a
     * request open in Home Assistant for five minutes, and after two the integration refuses more.
     */
    var parked = null;          // { pairing, until, base }
    var PARK_MIN_MS = 20000;    // less left than this: a fresh code is the better start

    function park() {
        parked = run && run.pairing && state === 'pending' ? { pairing: run.pairing, until: run.until, base: opts.base } : null;
    }

    function left() {
        return run ? Math.max(0, Math.ceil((run.until - Date.now()) / 1000)) : 0;
    }

    function setState(s, text) {
        state = s;
        detail = text || '';
        render();
    }

    function start() {
        stop();
        var mine = run = { pairing: null, until: 0, timer: null, polling: false };
        offline = false;
        setState('loading');
        var again = parked;
        parked = null;
        if (again && again.base === opts.base && again.until - Date.now() > PARK_MIN_MS) {
            loadQr().then(function () {
                if (run !== mine) return;
                mine.pairing = again.pairing;
                mine.until = again.until;
                setState('pending');
                startTick();
                schedule(0.2);
            }, function () {
                if (run !== mine) return;
                run = null;
                setState('error', 'QR-Code');
            });
            return;
        }
        var cfg = window.LAUNCHER_CONFIG || {};
        var name = (cfg.homeAssistant && cfg.homeAssistant.tvName) || DEFAULT_NAME;
        var base = opts.base;
        Promise.all([HAAuth.pairStart(base, name), loadQr()]).then(function (res) {
            if (run !== mine) {
                // Left while the code was being fetched: keep the request to pick it up again,
                // rather than leaving it open in Home Assistant for nothing.
                if (!parked && res[0]) parked = { pairing: res[0], until: Date.now() + res[0].expiresIn * 1000, base: base };
                return;
            }
            mine.pairing = res[0];
            mine.until = Date.now() + mine.pairing.expiresIn * 1000;
            setState('pending');
            startTick();
            schedule(mine.pairing.interval);
        }, function (err) {
            if (run !== mine) return;
            run = null;
            if (err && err.code === 'busy') setState('busy', String(err.retryAfter || 60));
            else if (err && err.code === 'http') setState('error', 'HTTP ' + err.status);
            else if (err && err.message) setState('error', 'QR-Code');   // the library did not load
            else setState(err && err.code ? err.code : 'error');
        });
    }

    function startTick() {
        clearInterval(tick);
        tick = setInterval(function () {
            if (!run || state !== 'pending') return;
            if (left() <= 0) {
                expire();
                return;
            }
            showTime();
        }, 1000);
    }

    // The time is up here. One last poll catches an approval given in the final seconds (the
    // integration keeps an approved pairing at least 30 s); then it counts as expired.
    function expire() {
        var mine = run;
        clearInterval(tick);
        tick = null;
        clearTimeout(mine.timer);
        if (mine.polling) {
            mine.last = true;
            return;
        }
        mine.last = true;
        poll(mine);
    }

    function schedule(seconds) {
        var mine = run;
        clearTimeout(mine.timer);
        mine.timer = setTimeout(function () { poll(mine); }, seconds * 1000);
    }

    function poll(mine) {
        if (run !== mine) return;
        mine.timer = null;
        // Hidden: no request; visibilitychange picks it up again (only this view, never in the background).
        if (document.hidden || !UI.isVisible('ha-pair')) return;
        mine.polling = true;
        var base = opts.base;
        HAAuth.pairPoll(base, mine.pairing).then(function (r) {
            mine.polling = false;
            if (run !== mine) {
                // Approved after all, but nobody waits for it here any more: Home Assistant handed out
                // the access once and forgot the pairing, so end that access instead of orphaning it.
                if (r.status === 'approved' && r.refresh) HAAuth.revoke(base, r.refresh).catch(function () {});
                return;
            }
            if (r.status === 'approved') {
                approved(r);
                return;
            }
            if (r.status === 'denied') {
                stop();
                setState('denied');
                return;
            }
            if (r.status === 'expired' || mine.last || left() <= 0) {
                stop();
                setState('expired');
                return;
            }
            if (r.status === 'error') {
                stop();
                setState('error', 'HTTP ' + r.http);
                return;
            }
            var was = offline;
            offline = r.status === 'offline';
            if (was !== offline) showStatus();
            if (document.hidden) return;   // resumes on visibilitychange
            schedule(r.status === 'wait' ? r.retryAfter : offline ? OFFLINE_RETRY : mine.pairing.interval);
        });
    }

    function approved(r) {
        stop();
        setState('connecting');
        var mine = run = { pairing: null, until: 0, timer: null };
        // The access token rides along (homeassistant.js keeps it in memory only), so the first
        // connection needs no renewal.
        opts.apply({ refresh: r.refresh, access: r.access, expiresIn: r.expiresIn, clientId: r.clientId }).then(function (outcome) {
            if (run !== mine) return;
            run = null;
            if (outcome && outcome.status === 'verbunden') setState('done');
            else setState('no_connection', outcome ? outcome.text : '');
        });
    }

    // Back on screen with time left: go on with the same code.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden || !run || !run.pairing || state !== 'pending' || !UI.isVisible('ha-pair')) return;
        if (left() <= 0) {
            expire();
            return;
        }
        startTick();
        if (!run.timer && !run.polling) poll(run);
    });

    // ---------- View

    function build() {
        view = $('ha-pair');
        view.classList.add('split', 'pair');
        view.innerHTML = '';
        var head = view.appendChild(el('header', 'split-head has-crumb'));
        head.appendChild(el('div', 'crumb', 'Home Assistant'));
        head.appendChild(el('h1', '', 'Mit dem Handy koppeln'));
        parts.left = view.appendChild(el('div', 'pair-left'));
        var right = view.appendChild(el('div', 'pair-right'));
        parts.body = right.appendChild(el('div', 'pair-body'));
        parts.status = right.appendChild(el('div', 'pair-status'));
        parts.box = right.appendChild(el('div', 'gl-box pair-actions'));
    }

    function svgSpan(cls, name) {
        var s = el('span', cls);
        s.innerHTML = Icons.svg(name);
        return s;
    }

    function stageIcon(name, color) {
        var wrap = el('div', 'pair-icon');
        wrap.appendChild(svgSpan('stage-icon ' + color, name));
        return wrap;
    }

    function step(n, text) {
        var li = el('li', 'pair-step');
        li.appendChild(el('span', 'pair-num', String(n)));
        li.appendChild(el('span', 'pair-step-text', text));
        return li;
    }

    // "7KQ2MX" as two groups of three, every character in a cell of the same width.
    function codeEl(code) {
        var box = el('div', 'pair-code');
        box.setAttribute('aria-label', code.split('').join(' '));
        for (var i = 0; i < code.length; i++) {
            box.appendChild(el('span', 'pair-ch' + (i === 3 ? ' gap' : ''), code.charAt(i)));
        }
        return box;
    }

    function message(title, text) {
        var wrap = el('div', 'pair-msg');
        wrap.appendChild(el('h3', 'pair-msg-title', title));
        if (text) wrap.appendChild(el('p', 'pair-msg-text', text));
        return wrap;
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function showTime() {
        if (!parts.time) return;
        var s = left();
        parts.time.textContent = 'Noch ' + Math.floor(s / 60) + ':' + pad2(s % 60);
    }

    function showStatus() {
        if (!parts.statusText) return;
        parts.statusText.textContent = offline
            ? 'Home Assistant antwortet gerade nicht – versuche weiter …'
            : 'Warte auf Freigabe …';
        parts.statusText.classList.toggle('warn', offline);
    }

    var TEXTS = {
        expired: ['Code abgelaufen', 'Der Code gilt nur wenige Minuten. Mit einem neuen Code geht es weiter.'],
        denied: ['Abgelehnt', 'Die Kopplung wurde in Home Assistant abgelehnt (oder der Code dreimal falsch eingegeben).'],
        not_installed: ['Integration fehlt', 'In Home Assistant fehlt die Integration „Ordiscale TV“: über HACS installieren, neu starten und unter Geräte & Dienste hinzufügen. Bis dahin geht es auch so:'],
        disabled: ['Kopplung ausgeschaltet', 'In Home Assistant ist das Koppeln neuer Fernseher ausgeschaltet (Ordiscale TV → Konfigurieren). Bis dahin geht es auch so:'],
        unreachable: ['Nicht erreichbar', 'Home Assistant antwortet nicht. Adresse und Netz prüfen.'],
        error: ['Kopplung fehlgeschlagen', ''],
        busy: ['Gerade zu viele Kopplungen', ''],
        no_connection: ['Gekoppelt, aber nicht verbunden', '']
    };

    function render() {
        if (!view || !UI.isVisible('ha-pair')) return;
        var style = (Prefs.get().appearance.iconStyle) || 'ordiscale';
        ['ordiscale', 'plain', 'color'].forEach(function (s) { view.classList.toggle('st-' + s, s === style); });
        var side = parts.left;
        var body = parts.body;
        side.innerHTML = '';
        body.innerHTML = '';
        parts.status.innerHTML = '';
        parts.time = parts.statusText = null;
        var p = run && run.pairing;

        if (state === 'pending' && p) {
            var panel = side.appendChild(el('div', 'pair-qr'));
            panel.innerHTML = qrSvg(qrText(opts.base, p.approvePath));
            side.appendChild(el('div', 'pair-host', 'Öffnet ' + opts.host));
            var steps = body.appendChild(el('ol', 'pair-steps'));
            steps.appendChild(step(1, 'Mit dem Handy scannen'));
            var two = steps.appendChild(step(2, 'In Home Assistant diesen Code eingeben:'));
            two.appendChild(codeEl(p.code));
            steps.appendChild(step(3, 'Freigeben'));
            parts.time = parts.status.appendChild(el('span', 'pair-time'));
            parts.statusText = parts.status.appendChild(el('span', 'pair-state'));
            showTime();
            showStatus();
        } else if (state === 'loading' || state === 'connecting') {
            side.appendChild(stageIcon('smartphone', 'c-teal'));
            body.appendChild(message(state === 'loading' ? 'Code wird angefordert …' : 'Freigegeben', state === 'connecting' ? 'Verbinde mit ' + opts.host + ' …' : ''));
        } else if (state === 'done') {
            side.appendChild(stageIcon('check', 'c-green'));
            body.appendChild(message('Verbunden', HA.user() ? 'Verbunden als ' + HA.user() + '.' : 'Der Fernseher ist mit Home Assistant gekoppelt.'));
        } else {
            var t = TEXTS[state] || TEXTS.error;
            var text = t[1];
            if (state === 'error') text = 'Home Assistant hat die Kopplung nicht angenommen' + (detail ? ' (' + detail + ')' : '') + '.';
            if (state === 'busy') text = 'Home Assistant nimmt gerade keine weitere Kopplung an. In ' + detail + ' s erneut versuchen.';
            if (state === 'no_connection') text = 'Der Zugang ist gespeichert, die Verbindung klappte noch nicht (' + (detail || 'nicht erreichbar') + '). Später unter „Verbindung prüfen“ erneut.';
            var icon = state === 'expired' ? 'timer' : state === 'unreachable' ? 'cloud-off' : 'triangle-alert';
            side.appendChild(stageIcon(icon, state === 'expired' ? 'c-gray' : 'c-orange'));
            body.appendChild(message(t[0], text));
        }
        renderActions();
    }

    function action(label, icon, color, run) {
        return { label: label, icon: icon, color: color, run: run };
    }

    // Leaves the view first, then runs the other way of signing in from where pairing was opened.
    function leaveTo(fn) {
        return function () {
            UI.back();
            if (fn) fn();
        };
    }

    function actions() {
        var again = action('Neuen Code anzeigen', 'refresh-cw', 'c-blue', start);
        var retry = action('Erneut versuchen', 'refresh-cw', 'c-blue', start);
        var login = action('Mit Benutzername und Passwort', 'log-in', 'c-green', leaveTo(opts.login));
        var token = action('Token einfügen', 'key-round', 'c-orange', leaveTo(opts.token));
        switch (state) {
            case 'pending':
            case 'loading':
                return [action('Abbrechen', 'circle-x', 'c-gray', leaveTo(null))];
            case 'expired':
            case 'denied':
                return [again];
            case 'not_installed':
            case 'disabled':
                return [retry, login, token];
            case 'unreachable':
                return [retry, action('Adresse ändern', 'server', 'c-blue', leaveTo(opts.address))];
            case 'connecting':
                return [];
            case 'done':
                return [
                    action('Zuhause öffnen', 'house', 'c-teal', function () { UI.back(); HAView.open(); }),
                    action('Fertig', 'check', 'c-green', leaveTo(opts.done))
                ];
            case 'no_connection':
                return [action('Fertig', 'check', 'c-green', leaveTo(opts.done))];
            default:
                return [retry, login, token];
        }
    }

    function renderActions() {
        var box = parts.box;
        box.innerHTML = '';
        actions().forEach(function (a) {
            var row = el('div', 'gl-row');
            row.appendChild(svgSpan('gl-ic ' + a.color, a.icon));
            row.appendChild(el('span', 'gl-label', a.label));
            row._item = a;
            box.appendChild(row);
        });
        box.classList.toggle('hidden', !box.firstChild);
        UI.refresh();
        UI.refreshHints();   // Zurück reads "Abbrechen" only while a code is shown
    }

    function rowEls() {
        return Array.prototype.slice.call(parts.box.querySelectorAll('.gl-row'));
    }

    /*
     * open(o): o = { base, host, apply(result) → Promise of { status, text }, login(), token(),
     * address(), done() }. apply stores the new sign-in (settings.js) and reports how connecting went.
     */
    function open(o) {
        opts = o;
        state = 'loading';
        UI.show('ha-pair');
    }

    function init() {
        build();
        UI.register('ha-pair', {
            el: view,
            rows: function () { return rowEls().map(function (r) { return [r]; }); },
            onShow: function (o) {
                // Back from a dialog of this view: the pairing still runs. Back after the view was left
                // (a colour key, say) while waiting: that pairing was stopped, so ask for a new code.
                if (o.back && (run || (state !== 'pending' && state !== 'loading'))) {
                    render();
                    return;
                }
                start();
            },
            onHide: function () {
                // Approved and connecting: nothing polls any more, the result just comes in. It is
                // kept for when the view is shown again (Back), instead of "Verbinde …" for ever.
                if (state === 'connecting') return;
                if (run && run.pairing) log('Home Assistant pairing: left (' + HAAuth.shortId(run.pairing.id) + ')');
                park();
                stop();
                // A finished state (connected, refused, …) stays to be read; a wait starts over.
                if (state === 'pending') state = 'loading';
            },
            activate: function (a) { if (a.run) a.run(); },
            hints: function () {
                return [['OK', 'Auswählen'], ['Zurück', state === 'pending' || state === 'loading' ? 'Abbrechen' : 'Home Assistant']];
            }
        });
        // The signed-in name arrives once connected.
        HA.onUpdate(function (what) {
            if (what === 'user' && state === 'done' && UI.isVisible('ha-pair')) render();
        });
    }

    window.HAPair = { init: init, open: open };
})();

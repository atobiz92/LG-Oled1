/*
 * "Sicherheit": the Home Assistant entities chosen for the TV (js/homeassistant.js) as a security
 * cockpit, decided 26.10.2026 (entscheidungen/launcher-sicherheit.html, layout A):
 *   - cameras together at the top (one to six in a block that fits their number, more in pages),
 *     a still every 2 s at the tile's size; OK opens one full screen with the live picture
 *     (js/ha-live.js);
 *   - beside them the state ("Alles geschlossen" green / "2 offen: …" orange / alarm red) and
 *     "Zuletzt", the last 12 events (js/ha-history.js);
 *   - below, doors, windows and garage as chips (open ones with how long), motion, and the door
 *     openers and lights by the cameras as actions;
 *   - then "Weitere Geräte": everything else as tiles, by area.
 * What goes where follows from the entity itself (domain and device_class); a door, doorbell or
 * opener belongs to the camera of the same device, else of the same area.
 *
 * Meant to stay on for hours: the screen saver never starts over it (screensaver.js runs on Home
 * only), the content shifts a few pixels every 3 minutes, the key hints fade after a minute without
 * a key, and at night (Appearance.night) a flat layer dims it. A doorbell, a door opened or the alarm
 * going off makes it bright at once and opens a popup with that camera live; only while this view
 * is open. A door opener acts only after OK held 2 s and a confirmation, in the popup too.
 */
(function () {
    'use strict';

    var log = DevLog.log;

    var $ = UI.$;
    var el = UI.el;
    var KEY = UI.KEY;

    var TILE_MS = 2000;             // stills in the camera block
    var HOLD_OPEN_MS = 2000;        // OK held this long on a door opener asks to open it
    var SHIFT_MS = 3 * 60000;       // burn-in: the content moves a few pixels this often
    var SHIFTS = [[0, 0], [5, 3], [-4, 6], [6, -4], [-5, -3], [3, -6], [-6, 4], [2, 5]];
    var IDLE_MS = 60000;            // key hints fade after this without a key
    var BRIGHT_MS = 2 * 60000;      // at night: bright this long after a key
    var ALERT_BRIGHT_MS = 5 * 60000;
    var POP_CLOSE_MS = 3 * 60000;   // a popup nobody answers closes by itself
    var CAM_W = 1160;               // the camera block; the state column beside it
    var SIDE_W = 490;
    var GAP = 30;
    var PAGE = 6;                   // cameras in the block at once
    var TOGGLE = ['light', 'switch', 'fan', 'input_boolean'];

    // Drawn icons per domain (never emoji or symbol characters).
    var ICON_PATHS = {
        light: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
        switch: '<path d="M12 3v8"/><path d="M6.3 7.3a8 8 0 1 0 11.4 0"/>',
        fan: '<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2C11 6 12.5 3 15 3.5c2.3.5 1.5 3.8-1.3 6.2"/>' +
            '<path d="M13.6 12.9c4 1.4 6 4 4.6 6-1.3 1.9-4.2.3-5.1-3.3"/><path d="M10.4 12.4c-3.2 2.8-6.4 3-6.9.6-.5-2.3 2.9-3.5 6.3-2.4"/>',
        scene: '<path d="M11 3l1.8 4.7 4.7 1.8-4.7 1.8L11 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M18 14l.8 2.2 2.2.8-2.2.8L18 20l-.8-2.2-2.2-.8 2.2-.8z"/>',
        script: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/>',
        cover: '<rect x="4" y="3.5" width="16" height="17" rx="1.5"/><path d="M4 8h16M4 12h16M4 16h16"/>',
        climate: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
        sensor: '<path d="M4.5 17a8 8 0 1 1 15 0"/><path d="M12 13l3.5-4"/>',
        binary_sensor: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
        camera: '<rect x="3" y="6.5" width="13" height="11" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/>',
        button: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>'
    };
    ICON_PATHS.input_boolean = ICON_PATHS.switch;
    ICON_PATHS.event = ICON_PATHS.binary_sensor;

    function iconEl(domain) {
        var span = el('span', 'ha-icon');
        span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
            'stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[domain] || ICON_PATHS.sensor) + '</svg>';
        return span;
    }

    // Lucide (js/icons.js) for the security parts.
    function lucide(cls, name) {
        var span = el('span', cls);
        span.innerHTML = Icons.svg(name);
        return span;
    }

    var view = {
        focusId: null,      // key of the element shown focused, kept across redraws
        full: null,         // camera shown full screen
        pop: null,          // { kind, item, cam, opener } while a popup is up
        shown: false,       // between onShow and onHide (a menu over the view keeps it shown)
        model: null,
        camPage: 0,
        tileTimer: null,
        tick: null,
        shiftTimer: null,
        shift: 0,
        popTimer: null,
        lastKey: Date.now(),
        hintOpener: false,  // the focus is on a door opener (its hint differs)
        brightUntil: 0,
        target: {},         // thermostat target just set, until its state reports it
        opened: {}          // opener id -> when the TV opened it (its door raises no popup then)
    };

    function track() { return $('ha-track'); }
    function tiles() { return Array.prototype.slice.call(track().querySelectorAll('.ha-tile')); }

    // ---------- What an entity is

    function attrs(it) { return (it.state && it.state.attributes) || {}; }
    function devClass(it) { return attrs(it).device_class || ''; }

    var CONTACT = ['door', 'window', 'garage_door', 'opening', 'garage', 'gate'];
    var DOORISH = ['door', 'garage_door', 'opening', 'garage', 'gate'];   // their opening raises a popup
    var PRESENCE = ['motion', 'occupancy', 'presence', 'moving'];
    var OPENER_WORDS = /unlock|entriegel|öffn|oeffn|\bopen\b|_open|türöffner|door[\s_-]?opener|summer/i;

    function roleOf(it) {
        var d = it.domain;
        var dc = devClass(it);
        var text = it.id + ' ' + it.name;
        if (d === 'camera') return 'camera';
        if (d === 'alarm_control_panel') return 'alarm';
        if (d === 'lock') return 'opener';
        if (d === 'button' && OPENER_WORDS.test(text)) return 'opener';
        if (d === 'event') {
            // What the event is, not the device's name: a doorbell camera called "Klingel" also has
            // motion, NFC and fingerprint events (UniFi Protect). Words only when HA says nothing.
            var types = attrs(it).event_types || [];
            if (dc === 'doorbell' || types.indexOf('ring') >= 0) return 'bell';
            if (dc === 'motion') return 'motion';     // UniFi Protect's motion_detection event
            return !dc && !types.length && /(doorbell|klingel)$/i.test(it.id) ? 'bell' : 'other';
        }
        if (d === 'binary_sensor') {
            // UniFi Protect's older doorbell sensor is an occupancy sensor "…_doorbell" (the id ends
            // in it). The doorbell camera's other sensors ("g4_doorbell_motion", "klingel_motion")
            // stay what their class says.
            if (dc !== 'motion' && (/doorbell$/i.test(it.id) || /klingel$/i.test(it.name))) return 'bell';
            if (CONTACT.indexOf(dc) >= 0) return 'contact';
            if (PRESENCE.indexOf(dc) >= 0) return 'motion';
        }
        if (d === 'cover' && ['garage', 'door', 'gate'].indexOf(dc) >= 0) return 'contact';
        return 'other';
    }

    // A name without what the role says already: "Einfahrt Motion" -> "Einfahrt".
    var ROLE_WORDS = {
        motion: /\s+(motion|bewegung|bewegungsmelder|bewegungserkennung|occupancy|präsenz|presence)$/i,
        contact: /\s+(door position( sensor)?|türpositionssensor|positionssensor|türsensor|türkontakt|kontakt|contact( sensor)?|door sensor)$/i,
        opener: /\s+(unlock|entriegeln|öffnen|open|türöffner|door opener|lock|schloss|türschloss)$/i,
        bell: /\s+(doorbell|klingel|ring)$/i
    };

    // What a device is, not where: "Haustür-DoorHub öffnen" is "Haustür öffnen" on the TV. Taken off
    // the end, one after the other, as long as something is left.
    var HARDWARE = /[\s_-]+(door ?hub( mini)?|hub|reader( pro| lite| flex)?|intercom( viewer)?|viewer|access( point)?|unifi|ubiquiti|g[3-6]( (pro|flex|bullet|dome|turret|instant|doorbell))*|ua[\s-]?[a-z0-9-]+|pro|lite|mini|controller|relay|relais|modul|module)$/i;

    function plainName(it) {
        var re = ROLE_WORDS[it.role];
        // "Sensor - Haustür Kontakt": a leading word for the kind of device goes too.
        var n = it.name.replace(/^(sensor|kontakt|melder|aktor)\s*[-–:·]\s*/i, '');
        n = re ? n.replace(re, '') : n;
        n = n.replace(/\s*flood ?light$/i, ' Flutlicht').trim();
        for (var i = 0; i < 4; i++) {
            var cut = n.replace(HARDWARE, '').replace(/[\s_\-–·:]+$/, '');
            if (!cut || cut === n) break;
            n = cut;
            if (re) n = n.replace(re, '') || n;
        }
        return n || it.name;
    }

    var OUTSIDE = /au(ß|ss)en|outdoor|outside|garten|hof\b|einfahrt|zufahrt|terrass|eingang|fassade|carport|flut|flood|garage/i;

    function model() {
        var m = { all: [], cams: [], contacts: [], motion: [], openers: [], bells: [], alarms: [], quick: [], other: [], byId: {} };
        var lists = { camera: m.cams, contact: m.contacts, motion: m.motion, opener: m.openers, bell: m.bells, alarm: m.alarms };
        HA.tvEntities().forEach(function (it) {
            it.role = roleOf(it);
            it.plain = plainName(it);
            m.byId[it.id] = it;
            m.all.push(it);
            (lists[it.role] || m.other).push(it);
        });
        // Lights and switches where a camera is (the outside light) stand by the door openers.
        var camAreas = {};
        m.cams.forEach(function (c) { if (c.areaId) camAreas[c.areaId] = true; });
        m.other = m.other.filter(function (it) {
            // ... and outside lights given the label themselves (a group "Außenlampen").
            if ((it.domain === 'light' || it.domain === 'switch') && (camAreas[it.areaId] || (it.domain === 'light' && OUTSIDE.test(it.name + ' ' + it.area)))) {
                m.quick.push(it);
                return false;
            }
            return true;
        });
        // Without anything for security there is no "Türöffner und Licht": the lights stay with the rest.
        if (!security(m)) {
            m.other = m.quick.concat(m.other);
            m.quick = [];
        }
        return m;
    }

    function security(m) {
        return !!(m.cams.length || m.contacts.length || m.motion.length || m.openers.length || m.bells.length || m.alarms.length);
    }

    // A door, doorbell or opener and the camera that shows it: same device, else same area.
    // In an area with several cameras, the doorbell's camera watches the door.
    function cameraFor(it) {
        var m = view.model;
        if (!m || !it) return null;
        if (it.role === 'camera') return it;
        var own = m.cams.find(function (c) { return c.deviceId && c.deviceId === it.deviceId; });
        if (own) return own;
        var near = m.cams.filter(function (c) { return c.areaId && c.areaId === it.areaId; });
        return near.find(function (c) {
            return m.bells.some(function (b) { return b.deviceId && b.deviceId === c.deviceId; });
        }) || near[0] || null;
    }

    function isDoor(c) { return c.domain === 'cover' || DOORISH.indexOf(devClass(c)) >= 0; }

    // From all of HA (HA.doorPeers), not only what the TV shows: doors and openers with key = value
    // ('deviceId' or 'areaId').
    function peers(key, value) {
        var doors = 0;
        var openers = 0;
        if (!value) return { doors: 0, openers: 0 };
        HA.doorPeers().forEach(function (p) {
            if (p[key] !== value) return;
            var dc = p.deviceClass;
            if (p.domain === 'cover' ? ['garage', 'door', 'gate'].indexOf(dc) >= 0 : p.domain === 'binary_sensor' && DOORISH.indexOf(dc) >= 0) doors++;
            if (p.domain === 'lock' || (p.domain === 'button' && OPENER_WORDS.test(p.id + ' ' + p.name))) openers++;
        });
        return { doors: doors, openers: openers };
    }

    /*
     * The opener that belongs to a door or bell, or null when that is not certain: the TV must never
     * offer to open the wrong door. Candidates are the openers shown on the same device (UniFi Access:
     * the door's hub), else in the same area. Among them, one with the same name ("Haustür Unlock"
     * for "Haustür Door Position") wins; otherwise only when HA as a whole has one opener there and
     * at most one door on the device, or exactly one door in the area (counted in all of HA, also
     * what the TV does not show).
     */
    function openerFor(it) {
        var m = view.model;
        if (!m || !it) return null;
        if (it.role === 'opener') return it;
        var dev = it.deviceId ? m.openers.filter(function (o) { return o.deviceId === it.deviceId; }) : [];
        var by = dev.length ? 'deviceId' : 'areaId';
        var cand = dev.length ? dev : it.areaId ? m.openers.filter(function (o) { return o.areaId === it.areaId; }) : [];
        if (!cand.length) return null;
        var named = cand.filter(function (o) { return o.plain === it.plain; });
        if (named.length === 1) return named[0];
        var all = peers(by, it[by]);
        // On one device at most one door; by area exactly one door sensor, which shows there is one
        // door there (an area without any could hold the opener of a door elsewhere).
        if (by === 'areaId' ? all.doors !== 1 : all.doors > 1) return null;
        if (cand.length === 1 && all.openers === 1) return cand[0];
        // Several openers, all on one device with at most one door and no other opener around
        // (UniFi Access: a lock and an "Unlock" button for the same door): they open that one door.
        var devId = cand[0].deviceId;
        var same = devId && cand.every(function (o) { return o.deviceId === devId; });
        var onDev = same ? peers('deviceId', devId) : null;
        if (!onDev || onDev.doors > 1 || onDev.openers !== all.openers) return null;
        return cand.find(function (o) { return o.domain === 'lock'; }) || cand[0];
    }

    // The first channel in this order that answers (has a state and a camera token); one that is
    // unavailable is passed over, so the camera still shows through another.
    function pick(cam, order) {
        var ch = cam.channels || {};
        var first = null;
        for (var i = 0; i < order.length; i++) {
            var id = ch[order[i]];
            if (!id) continue;
            first = first || id;
            var s = HA.state(id);
            if (s && !unavailable(s) && s.attributes && s.attributes.access_token) return id;
        }
        return first || cam.id;
    }

    function tileSource(cam) { return pick(cam, ['medium', 'low', 'high', 'main']); }

    function streamSource(cam) {
        if (Prefs.get().haView.fullCamera === 'max') return pick(cam, ['high', 'main', 'medium', 'low']);
        return pick(cam, ['medium', 'high', 'main', 'low']);
    }

    // ---------- State text

    function num(v) {
        var n = Number(v);
        if (v === null || v === undefined || v === '' || isNaN(n)) return null;
        return String(Math.round(n * 10) / 10).replace('.', ',');
    }

    function unavailable(s) {
        return !s || s.state === 'unavailable' || s.state === 'unknown';
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function clock(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function clockSec(ms) { var d = new Date(ms); return clock(ms) + ':' + pad(d.getSeconds()); }

    function since(s) {
        var t = Date.parse(s && (s.last_changed || s.last_updated));
        return isNaN(t) ? null : t;
    }

    // "24 Min.", "2 Std.", "3 Tg."
    function duration(ms) {
        var min = Math.floor(ms / 60000);
        if (min < 1) return 'gerade eben';
        if (min < 60) return min + ' Min.';
        var h = Math.floor(min / 60);
        if (h < 48) return h + ' Std.';
        return Math.floor(h / 24) + ' Tg.';
    }

    var COVER = { open: 'Offen', closed: 'Geschlossen', opening: 'Öffnet', closing: 'Schließt' };
    // Binary sensors read by what they watch; anything else is An / Aus.
    var BINARY = {
        door: ['Offen', 'Zu'], window: ['Offen', 'Zu'], opening: ['Offen', 'Zu'], garage_door: ['Offen', 'Zu'],
        motion: ['Bewegung', 'Ruhig'], occupancy: ['Belegt', 'Frei'], presence: ['Da', 'Weg'],
        moisture: ['Nass', 'Trocken'], smoke: ['Rauch', 'Normal'], lock: ['Offen', 'Verriegelt']
    };
    var ALARM = {
        disarmed: 'Unscharf', armed_home: 'Scharf (zu Hause)', armed_away: 'Scharf (abwesend)',
        armed_night: 'Scharf (Nacht)', armed_vacation: 'Scharf (Urlaub)', armed_custom_bypass: 'Scharf (eigene)',
        pending: 'Verzögerung', arming: 'Wird scharf', disarming: 'Wird unscharf', triggered: 'Ausgelöst'
    };
    var LOCK = {
        locked: 'verriegelt', unlocked: 'entriegelt', open: 'offen', opening: 'öffnet', jammed: 'klemmt',
        locking: 'verriegelt …', unlocking: 'entriegelt …'
    };

    function stateText(item) {
        var s = item.state;
        var a = s.attributes || {};
        if (s.state === 'unavailable') return 'Nicht erreichbar';
        if (s.state === 'unknown') return 'Unbekannt';
        switch (item.domain) {
            case 'light':
                if (s.state !== 'on') return 'Aus';
                return a.brightness ? 'An · ' + Math.round(a.brightness / 2.55) + ' %' : 'An';
            case 'switch': case 'fan': case 'input_boolean':
                return s.state === 'on' ? 'An' : 'Aus';
            case 'scene':
                return 'Szene';
            case 'script':
                return s.state === 'on' ? 'Läuft' : 'Skript';
            case 'button':
                return 'Drücken';
            case 'event':
                var t = Date.parse(s.state);
                return isNaN(t) ? 'Ereignis' : 'Zuletzt ' + clock(t);
            case 'cover':
                var pos = a.current_position;
                return (COVER[s.state] || s.state) + (pos !== undefined && pos !== null && s.state !== 'closed' ? ' · ' + pos + ' %' : '');
            case 'climate':
                var now = num(a.current_temperature);
                var want = num(a.temperature);
                if (s.state === 'off') return 'Aus' + (now ? ' · ' + now + ' °C' : '');
                return (now ? now + ' °C' : '') + (want ? (now ? ' · ' : '') + 'Soll ' + want + ' °C' : '');
            case 'sensor':
                var v = num(s.state);
                return (v !== null ? v : s.state) + (a.unit_of_measurement ? ' ' + a.unit_of_measurement : '');
            case 'binary_sensor':
                var pair = BINARY[a.device_class] || ['An', 'Aus'];
                return s.state === 'on' ? pair[0] : pair[1];
            case 'camera':
                return '';
        }
        return s.state;
    }

    function isOn(item) {
        return TOGGLE.indexOf(item.domain) >= 0 && item.state.state === 'on';
    }

    function isOpen(it) {
        var s = it.state.state;
        if (it.role === 'contact') return it.domain === 'cover' ? (s === 'open' || s === 'opening' || s === 'closing') : s === 'on';
        // A lock is safe only when it says "locked" (not while "locking": not yet confirmed).
        if (it.role === 'opener' && it.domain === 'lock') return s !== 'locked' && !unavailable(it.state);
        return false;
    }

    // Chip value: "zu", "offen · 24 Min.", "Bewegung", "ruhig · 21:14", "Scharf (abwesend)".
    function chipValue(it) {
        var s = it.state;
        if (unavailable(s)) return 'nicht erreichbar';
        if (it.role === 'contact') {
            if (!isOpen(it)) return 'zu';
            var t = since(s);
            return (it.domain === 'cover' && s.state !== 'open' ? COVER[s.state].toLowerCase() : 'offen') + (t ? ' · ' + duration(Date.now() - t) : '');
        }
        if (it.role === 'motion') {
            if (moving(it)) return 'Bewegung';
            var m = since(s);
            return 'ruhig' + (m && Date.now() - m < 12 * 3600000 ? ' · ' + clock(m) : '');
        }
        if (it.role === 'alarm') return ALARM[s.state] || s.state;
        return stateText(it);
    }

    function chipLevel(it) {
        var s = it.state;
        if (unavailable(s)) return 'off';
        if (it.role === 'alarm') return s.state === 'triggered' ? 'alarm' : s.state === 'disarmed' ? 'idle' : 'ok';
        if (it.role === 'motion') return moving(it) ? 'open' : 'idle';
        return isOpen(it) ? 'open' : 'ok';
    }

    // A motion sensor is on; a motion event entity (state = time of its last event) counts as
    // moving for MOTION_EVENT_MS after it, the chip redraws with the minute tick.
    var MOTION_EVENT_MS = 2 * 60000;

    function moving(it) {
        var s = it.state;
        if (it.domain === 'event') return Date.now() - (Date.parse(s.state) || 0) < MOTION_EVENT_MS;
        return s.state === 'on';
    }

    // The overall state: { level: ok | open | alarm | none, title, sub, alarmLine }
    function overall(m) {
        var alarmLine = m.alarms.length ? m.alarms.map(function (a) { return a.plain + ': ' + (ALARM[a.state.state] || a.state.state); }).join(' · ') : '';
        // Without a connection no change arrives: what was last known may be wrong by now.
        // Signed in again, but the new snapshot is not there yet: still not "Alles geschlossen".
        if (HA.status() !== 'verbunden' || view.lostAt) {
            var title = HA.status() === 'verbunden' ? 'Wird aktualisiert' : 'Keine Verbindung';
            return { level: 'open', title: title, sub: view.lostAt ? 'Letzter Stand ' + clock(view.lostAt) : '', alarmLine: '' };
        }
        var hit = m.alarms.find(function (a) { return a.state.state === 'triggered'; });
        if (hit) return { level: 'alarm', title: 'Alarm ausgelöst', sub: hit.plain, alarmLine: '' };
        var locks = m.openers.filter(function (o) { return o.domain === 'lock'; });
        // A sensor that does not answer may hide an open door: never "Alles geschlossen" then.
        var off = m.contacts.concat(locks).filter(function (x) { return unavailable(x.state); });
        var open = m.contacts.concat(m.openers).filter(isOpen);
        if (open.length) {
            var sub = open.map(function (x) { return x.plain; }).join(' · ') + (off.length ? ' · ' + off.length + ' ohne Meldung' : '');
            return { level: 'open', title: open.length + ' offen', sub: sub, alarmLine: alarmLine };
        }
        if (!m.contacts.length && !locks.length) {
            return { level: 'none', title: m.alarms.length ? 'Alarmanlage' : 'Keine Tür- und Fenstersensoren', sub: '', alarmLine: alarmLine };
        }
        if (off.length) {
            return { level: 'open', title: off.length + ' ohne Meldung', sub: off.map(function (x) { return x.plain; }).join(' · '), alarmLine: alarmLine };
        }
        return { level: 'ok', title: 'Alles geschlossen', sub: '', alarmLine: alarmLine };
    }

    // ---------- Tiles of "Weitere Geräte"

    function fillTile(tile, item) {
        tile._item = { id: item.id, domain: item.domain, name: item.name };
        tile.classList.toggle('on', isOn(item));
        tile.classList.toggle('off-line', unavailable(item.state));
        tile.innerHTML = '';
        tile.appendChild(iconEl(item.domain));
        tile.appendChild(el('div', 'ha-name', item.name));
        tile.appendChild(el('div', 'ha-state', stateText(item)));
    }

    function tileEl(item) {
        var tile = el('div', 'ha-tile ha-' + item.domain);
        fillTile(tile, item);
        tile._entity = item.id;
        tile._key = item.id;
        return tile;
    }

    // ---------- Chips and actions

    var ROLE_ICON = { contact: 'door-closed', motion: 'activity', alarm: 'shield' };

    function chipIcon(it) {
        if (it.role === 'contact') {
            var dc = devClass(it);
            if (dc === 'window') return 'app-window';
            if (dc === 'garage_door' || dc === 'garage' || it.domain === 'cover') return 'warehouse';
            return isOpen(it) ? 'door-open' : 'door-closed';
        }
        if (it.role === 'alarm') return it.state.state === 'triggered' ? 'shield-alert' : 'shield';
        return ROLE_ICON[it.role] || 'activity';
    }

    function fillChip(chip, it) {
        chip.innerHTML = '';
        chip.className = 'ha-tile ha-chip lv-' + chipLevel(it);
        chip.appendChild(lucide('ha-chip-ic', chipIcon(it)));
        chip.appendChild(el('span', 'ha-chip-name', it.plain));
        chip.appendChild(el('span', 'ha-chip-val', chipValue(it)));
    }

    function chipEl(it) {
        var chip = el('div', 'ha-tile ha-chip');
        chip._entity = it.id;
        chip._key = it.id;
        chip._item = { id: it.id, domain: it.domain, name: it.name, chip: true };
        fillChip(chip, it);
        return chip;
    }

    // A lock that can open the door itself (LockEntityFeature.OPEN = 1: Nuki, a door buzzer) is
    // opened with lock.open; any other lock is only unlocked (lock.unlock), and the words say so.
    function canOpen(it) {
        return it.domain !== 'lock' || ((Number(attrs(it).supported_features) || 0) & 1) === 1;
    }

    function openVerb(it) { return canOpen(it) ? 'öffnen' : 'entriegeln'; }


    function fillAction(btn, it) {
        btn.innerHTML = '';
        if (it.role === 'opener') {
            btn.appendChild(lucide('ha-chip-ic', it.domain === 'lock' && !isOpen(it) ? 'lock' : 'lock-open'));
            // Only the door: the lock icon and "OK halten" say what it does.
            btn.appendChild(el('span', 'ha-chip-name', it.plain));
            var v = it.domain === 'lock' ? (unavailable(it.state) ? 'nicht erreichbar' : LOCK[it.state.state] || it.state.state) : 'OK halten';
            btn.appendChild(el('span', 'ha-chip-val', v));
            btn.appendChild(el('span', 'ha-hold'));
            btn.classList.toggle('off-line', unavailable(it.state));
            return;
        }
        btn.appendChild(iconEl(it.domain));
        btn.appendChild(el('span', 'ha-chip-name', it.plain || it.name));
        btn.appendChild(el('span', 'ha-chip-val', stateText(it)));
        btn.classList.toggle('on', isOn(it));
        btn.classList.toggle('off-line', unavailable(it.state));
    }

    function actionEl(it) {
        var btn = el('div', 'ha-tile ha-chip ha-act' + (it.role === 'opener' ? ' opener' : ''));
        btn._entity = it.id;
        btn._key = 'act:' + it.id;
        btn._opener = it.role === 'opener' ? it.id : null;
        btn._item = { id: it.id, domain: it.domain, name: it.name, opener: it.role === 'opener' };
        fillAction(btn, it);
        return btn;
    }

    // ---------- Camera block

    // Places for n cameras in a block CAM_W wide: bigger when there are fewer.
    function camRects(n) {
        var W = CAM_W;
        var g = 20;
        if (n <= 1) return { h: 652, r: [[0, 0, W, 652]] };
        if (n === 2) return { h: 321, r: [[0, 0, 570, 321], [590, 0, 570, 321]] };
        if (n === 3) return { h: 428, r: [[0, 0, 760, 428], [780, 0, 380, 204], [780, 224, 380, 204]] };
        // Four a little smaller, so the doors below still show without scrolling.
        if (n === 4) return { w: 1108, h: 632, r: [[0, 0, 544, 306], [564, 0, 544, 306], [0, 326, 544, 306], [564, 326, 544, 306]] };
        var w = Math.floor((W - 2 * g) / 3);
        var h = Math.round(w * 9 / 16);
        var r = [];
        for (var i = 0; i < n; i++) r.push([(i % 3) * (w + g), Math.floor(i / 3) * (h + g), w, h]);
        return { h: 2 * h + g, r: r };
    }

    function camTile(cam, rect) {
        var t = el('div', 'ha-tile camera');
        t.style.left = rect[0] + 'px';
        t.style.top = rect[1] + 'px';
        t.style.width = rect[2] + 'px';
        t.style.height = rect[3] + 'px';
        var img = new Image();
        img.className = 'ha-cam-img';
        t.appendChild(img);
        t.appendChild(el('div', 'ha-cam-none', 'Kein Bild'));
        t.appendChild(el('div', 'ha-cam-name', cam.short));
        t.appendChild(el('div', 'ha-cam-time'));
        t._entity = cam.id;
        t._key = cam.id;
        t._cam = cam;
        t._src = tileSource(cam);
        t._w = rect[2];
        t._h = rect[3];
        t._item = { id: cam.id, domain: 'camera', name: cam.name };
        return t;
    }

    function moreTile(rest, rect) {
        var t = el('div', 'ha-tile camera more');
        t.style.left = rect[0] + 'px';
        t.style.top = rect[1] + 'px';
        t.style.width = rect[2] + 'px';
        t.style.height = rect[3] + 'px';
        t.appendChild(lucide('ha-more-ic', 'cctv'));
        t.appendChild(el('div', 'ha-more-text', rest > 0 ? 'Weitere Kameras · ' + rest : 'Erste Kameras'));
        t._key = 'more-cams';
        t._item = { moreCams: true };
        return t;
    }

    // Loads the next picture off-screen and swaps it in when it is there: no blank frame, and no new
    // request while one is still on its way (a slow camera never piles them up).
    function loadPicture(box, id, w, h) {
        var old = box.querySelector('.ha-cam-img');
        if (!old || (box._loading && box._loadingId === id) || document.hidden) return;
        // A 180-degree camera (2:1 and wider) is shown whole, with dark bars, not cut and blown up.
        var url = HA.cameraUrl(id, w, h, HA.cameraWide(id) ? 'contain' : 'cover');
        if (!url) {
            box.classList.add('no-image');
            return;
        }
        var next = new Image();
        var token = box._token = (box._token || 0) + 1;
        var t0 = Date.now();
        box._loading = true;
        box._loadingId = id;
        next.onload = function () {
            if (token !== box._token) return;   // another camera (or none) took the box meanwhile
            box._loading = false;
            box._loadMs = Date.now() - t0;
            box._shownAt = Date.now();
            HA.cameraSeen(id, next, box._loadMs);
            next.className = 'ha-cam-img';
            var cur = box.querySelector('.ha-cam-img');
            if (cur) box.replaceChild(next, cur);
            box.classList.remove('no-image', 'stale');
            box.classList.toggle('wide', HA.cameraWide(id));
        };
        next.onerror = function () {
            if (token !== box._token) return;
            box._loading = false;
            box.classList.add('no-image');
        };
        next.src = url;
    }

    // The time of the picture shows only when it is old (camera or network stuck): a fresh picture
    // needs no label of its own, it is the same on every tile.
    var STALE_MS = 10000;

    function staleCheck(box) {
        var old = box._shownAt && Date.now() - box._shownAt > STALE_MS;
        box.classList.toggle('stale', !!old);
        var stamp = box.querySelector('.ha-cam-time');
        if (stamp && old) stamp.textContent = 'Bild von ' + clockSec(box._shownAt);
    }

    function refreshCameraTiles() {
        if (view.full || view.pop || !view.shown) return;
        tiles().forEach(function (t) {
            if (!t._src) return;
            // A channel that went away (disabled, unavailable) is replaced by another on the next round.
            if (t._cam) t._src = tileSource(t._cam);
            staleCheck(t);
            loadPicture(t, t._src, t._w, t._h);
        });
    }

    // ---------- Whole view

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

    function headText() {
        var st = HA.status();
        var info = HA.info();
        if (st === 'verbunden') return info.ready ? '' : 'lade Geräte …';
        if (st === 'verbinde') return 'verbinde mit ' + HA.host() + ' …';
        if (st === 'nicht erreichbar') {
            var s = Math.ceil(info.retryIn / 1000);
            return 'nicht erreichbar' + (s ? ' · neuer Versuch in ' + s + ' s' : '');
        }
        return st === 'aus' ? '' : st;
    }

    function renderHead() {
        $('ha-status').textContent = headText();
        var now = new Date();
        var locale = Prefs.get().appearance.locale || 'de-DE';
        var date = '';
        try {
            date = now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
        } catch (e) {
            date = now.toDateString();
        }
        $('ha-sub').textContent = date + ' · ' + clock(now.getTime());
    }

    // What to say instead of tiles: { title, text, action: { label, run } } or null for the tiles.
    function emptyState() {
        var st = HA.status();
        var info = HA.info();
        var settings = { label: 'Einstellungen öffnen', run: function () { UI.show('ha-settings'); } };
        if (!HA.hasUrl()) {
            return { title: 'Home Assistant ist nicht eingerichtet', text: 'Einstellungen → Home Assistant → Adresse eingeben.', action: settings };
        }
        var relogin = {
            title: 'Anmeldung abgelaufen',
            text: 'Home Assistant nimmt die Anmeldung dieses TV nicht mehr an (abgemeldet, Sitzung gelöscht oder 90 Tage nicht benutzt). Unter Einstellungen → Home Assistant neu koppeln oder anmelden.',
            action: settings
        };
        if (!HA.hasAuth()) {
            if (HA.loginExpired()) return relogin;
            return {
                title: 'Nicht angemeldet',
                text: 'Einstellungen → Home Assistant: mit dem Handy koppeln, mit Benutzername und Passwort anmelden oder einen Langzeit-Token einfügen.',
                action: settings
            };
        }
        if (st === 'Anmeldung abgelaufen') return relogin;
        if (st === 'Token ungültig') {
            return {
                title: 'Token ungültig',
                text: 'Home Assistant hat den Zugangsschlüssel abgelehnt. Im Home-Assistant-Profil einen neuen Langzeit-Token erstellen und unter Einstellungen → Home Assistant eintragen.',
                action: settings
            };
        }
        if (info.ready && info.count) return null;
        if (info.ready) {
            if (!info.labelsReadable) {
                return {
                    title: 'Label „TV“ nicht lesbar',
                    text: 'Home Assistant gibt die Labels nicht heraus (Version vor 2024.4 oder fehlende Rechte). Ersatz: eine YAML-Gruppe group.tv mit den gewünschten Entitäten anlegen.',
                    action: { label: 'Neu laden', run: function () { HA.reset(); } }
                };
            }
            return {
                title: 'Noch nichts ausgewählt',
                text: 'In Home Assistant das Label „TV“ an einen Bereich, ein Gerät oder eine Entität vergeben, oder hier ganze Integrationen einbeziehen (z. B. UniFi Protect).',
                action: { label: 'Integrationen einbeziehen', run: function () { if (window.Settings && Settings.openIntegrations) Settings.openIntegrations(); } }
            };
        }
        if (st === 'nicht erreichbar') {
            return {
                title: 'Home Assistant nicht erreichbar',
                text: HA.host() + ' antwortet nicht. Läuft Home Assistant, und ist der TV im selben Netz? Der Launcher versucht es weiter, solange diese Ansicht offen ist.',
                action: { label: 'Erneut versuchen', run: function () { HA.retryNow(); } }
            };
        }
        return { title: 'Verbinde mit Home Assistant …', text: HA.host(), action: null };
    }

    function section(title, cls) {
        var s = el('div', 'ha-sec' + (cls ? ' ' + cls : ''));
        if (title) s.appendChild(el('h2', '', title));
        return s;
    }

    function renderTop(m, t) {
        var cams = m.cams;
        var paged = cams.length > PAGE;
        var per = paged ? PAGE - 1 : PAGE;
        var pages = paged ? Math.ceil(cams.length / per) : 1;
        if (view.camPage >= pages) view.camPage = 0;
        var shown = cams.slice(view.camPage * per, view.camPage * per + per);
        var count = shown.length + (paged ? 1 : 0);
        var layout = cams.length ? camRects(count) : { h: 0, r: [] };
        var top = el('div', 'ha-sec ha-top');
        var sideH = Math.max(layout.h, 440);
        var camW = cams.length ? layout.w || CAM_W : 0;
        var full = CAM_W + GAP + SIDE_W;
        top.style.height = sideH + 'px';
        if (cams.length) {
            var block = el('div', 'ha-cams');
            block.style.width = camW + 'px';
            block.style.height = layout.h + 'px';
            shown.forEach(function (c, i) { block.appendChild(camTile(c, layout.r[i])); });
            if (paged) block.appendChild(moreTile(cams.length - (view.camPage + 1) * per, layout.r[count - 1]));
            top.appendChild(block);
        }
        var side = el('div', 'ha-side');
        side.style.left = (camW ? camW + GAP : 0) + 'px';
        side.style.width = (camW ? full - camW - GAP : full) + 'px';
        side.style.height = sideH + 'px';
        var card = el('div', 'ha-card ha-status');
        card.appendChild(el('span', 'ha-dot'));
        var txt = card.appendChild(el('div', 'ha-status-text'));
        txt.appendChild(el('div', 'ha-status-title'));
        txt.appendChild(el('div', 'ha-status-sub'));
        txt.appendChild(el('div', 'ha-status-alarm'));
        side.appendChild(card);
        // Focusable: OK shows all twelve events when fewer fit here (fewer cameras, larger text).
        var logCard = el('div', 'ha-card ha-log ha-tile');
        logCard.appendChild(el('div', 'ha-card-h', 'Zuletzt'));
        logCard.appendChild(el('div', 'ha-log-more'));
        logCard.appendChild(el('div', 'ha-log-list'));
        logCard._key = 'log';
        logCard._item = { action: openLog };
        side.appendChild(logCard);
        top.appendChild(side);
        t.appendChild(top);
        fillStatus();
        renderLog();
    }

    function fillStatus() {
        var card = track().querySelector('.ha-status');
        if (!card || !view.model) return;
        var o = overall(view.model);
        card.className = 'ha-card ha-status lv-' + o.level;
        card.querySelector('.ha-status-title').textContent = o.title;
        card.querySelector('.ha-status-sub').textContent = o.sub;
        card.querySelector('.ha-status-alarm').textContent = o.alarmLine;
    }

    var LOG_ICON = { bell: 'bell-ring', open: 'door-open', door: 'door-closed', motion: 'activity', lock: 'lock-open', alarm: 'shield-alert' };

    // The events into box; returns how many there are.
    function logRows(box) {
        var list = HAHistory.list();
        box.innerHTML = '';
        if (!list.length) {
            box.appendChild(el('div', 'ha-log-empty', HA.info().ready ? 'Noch keine Ereignisse' : ''));
            return 0;
        }
        list.forEach(function (e) {
            var row = el('div', 'ha-log-row k-' + e.kind);
            row.appendChild(el('span', 'ha-log-tm', clock(e.when)));
            row.appendChild(lucide('ha-log-ic', LOG_ICON[e.kind] || 'activity'));
            row.appendChild(el('span', 'ha-log-tx', e.text));
            box.appendChild(row);
        });
        return list.length;
    }

    function renderLog() {
        if (view.logOpen) logRows($('ha-logall-list'));
        var box = track().querySelector('.ha-log-list');
        if (!box) return;
        var n = logRows(box);
        // Whole lines only: what does not fit (fewer cameras, larger text) is left out, not cut,
        // and the header says so ("4 von 12"); OK on the card shows them all.
        var room = box.clientHeight;
        Array.prototype.slice.call(box.children).forEach(function (row) {
            if (row.offsetTop + row.offsetHeight > room) box.removeChild(row);
        });
        var shown = box.querySelectorAll('.ha-log-row').length;
        var more = track().querySelector('.ha-log-more');
        if (more) more.textContent = shown < n ? shown + ' von ' + n : '';
    }

    function chipsSection(title, items, make) {
        var s = section(title);
        var box = el('div', 'ha-chips');
        items.forEach(function (it) { box.appendChild(make(it)); });
        s.appendChild(box);
        return s;
    }

    function render() {
        renderHead();
        var empty = emptyState();
        var box = $('ha-empty');
        var t = track();
        box.classList.toggle('hidden', !empty);
        t.parentNode.classList.toggle('hidden', !!empty);
        if (empty) {
            view.model = null;
            t.innerHTML = '';
            t._pos = 0;
            t.style.transform = '';
            box.innerHTML = '';
            box.appendChild(el('h2', '', empty.title));
            box.appendChild(el('p', '', empty.text));
            if (empty.action) {
                var btn = el('div', 'ha-action', empty.action.label);
                btn._item = { action: empty.action.run };
                box.appendChild(btn);
            }
            $('ha-title').textContent = 'Zuhause';
            UI.refresh();
            UI.refreshHints();
            return;
        }
        var m = view.model = model();
        var secure = security(m);
        $('ha-title').textContent = secure ? 'Sicherheit' : 'Zuhause';
        t.innerHTML = '';
        if (secure) {
            renderTop(m, t);
            var contacts = m.alarms.concat(m.contacts);
            if (contacts.length) t.appendChild(chipsSection('Türen und Fenster', contacts, chipEl));
            if (m.motion.length) t.appendChild(chipsSection('Bewegung', m.motion, chipEl));
            var acts = m.openers.concat(m.quick);
            if (acts.length) t.appendChild(chipsSection(m.openers.length ? 'Türöffner und Licht' : 'Licht', acts, actionEl));
        }
        if (m.other.length) {
            var more = section(secure ? 'Weitere Geräte' : '', 'ha-more');
            var byArea = Object.create(null);   // area names are free text ("constructor" must not hit a prototype)
            var order = [];
            m.other.forEach(function (it) {
                if (!byArea[it.area]) {
                    byArea[it.area] = [];
                    order.push(it.area);
                }
                byArea[it.area].push(it);
            });
            var named = order.some(function (a) { return a; });
            order.forEach(function (a) {
                var group = el('div', 'ha-group');
                if (named) group.appendChild(el('h3', '', a || 'Ohne Bereich'));
                var grid = el('div', 'ha-grid');
                byArea[a].forEach(function (it) { grid.appendChild(tileEl(it)); });
                group.appendChild(grid);
                more.appendChild(group);
            });
            t.appendChild(more);
        }
        refreshCameraTiles();
        UI.refresh();
        UI.refreshHints();
    }

    // One entity changed: its chip, action or tile, and the state card.
    function updateEntity(id) {
        if (!view.model) return;
        var item = HA.tvEntities().find(function (x) { return x.id === id; });
        if (!item) return;
        var old = view.model.byId[id];
        item.role = old ? old.role : roleOf(item);
        item.plain = plainName(item);
        view.model.byId[id] = item;
        ['all', 'cams', 'contacts', 'motion', 'openers', 'bells', 'alarms', 'quick', 'other'].forEach(function (k) {
            var list = view.model[k];
            var i = list.findIndex(function (x) { return x.id === id; });
            if (i >= 0) list[i] = item;
        });
        delete view.target[id];
        var popTiles = Array.prototype.slice.call($('ha-pop').querySelectorAll('.ha-tile'));
        tiles().concat(popTiles).forEach(function (t) {
            if (t._entity !== id) return;
            var focused = t.classList.contains('focused');
            if (t.classList.contains('ha-act')) fillAction(t, item);
            else if (t.classList.contains('ha-chip')) fillChip(t, item);
            else if (!t.classList.contains('camera')) fillTile(t, item);
            if (focused) t.classList.add('focused');
        });
        fillStatus();
        if (view.full === id) $('ha-full-name').textContent = item.name;
    }

    // Once a minute: how long things are open, the clock.
    function minuteTick() {
        if (!view.model) return;
        tiles().forEach(function (t) {
            if (!t.classList.contains('ha-chip') || t.classList.contains('ha-act')) return;
            var it = view.model.byId[t._entity];
            if (it) {
                var focused = t.classList.contains('focused');
                fillChip(t, it);
                if (focused) t.classList.add('focused');
            }
        });
        renderLog();
    }

    // ---------- Focus: nearest element in the arrow's direction

    function focusEl() {
        if (view.pop) return $('ha-pop').querySelector('.ha-tile');
        if (view.full || view.logOpen || view.slider) return null;
        var list = tiles();
        if (!list.length) return $('ha-empty').querySelector('.ha-action');
        return list.find(function (t) { return t._key === view.focusId; }) || list[0];
    }

    /*
     * Up/Down: nearest row first, then the element closest to the current one's centre in it, so a
     * shorter row or the next section is still reached. Left/Right: the next one in the same row.
     * Rects include the focus growth; the gaps between elements are larger than that.
     */
    function neighbour(cur, k) {
        var a = cur.getBoundingClientRect();
        var horizontal = k === KEY.LEFT || k === KEY.RIGHT;
        var found = [];
        tiles().forEach(function (t) {
            if (t === cur) return;
            var b = t.getBoundingClientRect();
            var d = k === KEY.RIGHT ? b.left - a.right : k === KEY.LEFT ? a.left - b.right
                : k === KEY.DOWN ? b.top - a.bottom : a.top - b.bottom;
            if (d < -4) return;
            // Sideways only within the same row (a big camera spans two); at its end the focus stays.
            if (horizontal && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 0) return;
            var off = horizontal ? Math.abs((b.top + b.bottom) - (a.top + a.bottom)) / 2
                : Math.abs((b.left + b.right) - (a.left + a.right)) / 2;
            found.push({ t: t, d: d, off: off, top: b.top, left: b.left });
        });
        if (!found.length) return null;
        var nearest = Math.min.apply(null, found.map(function (f) { return f.d; }));
        var row = found.filter(function (f) { return f.d <= nearest + 40; });
        row.sort(function (x, y) { return x.off - y.off || x.top - y.top || x.left - y.left; });
        return row[0].t;
    }

    function move(k) {
        var cur = focusEl();
        var next = cur && cur.classList.contains('ha-tile') ? neighbour(cur, k) : null;
        if (window.Sound) Sound.play(next ? 'move' : 'edge');
        if (!next) return;
        view.focusId = next._key;
        UI.refresh();
    }

    function offsetIn(node, root) {
        var y = 0;
        while (node && node !== root) {
            y += node.offsetTop;
            node = node.offsetParent;
        }
        return y;
    }

    // The list scrolls as one layer; the first row of a section brings its heading along.
    function scrollTo(tile) {
        var t = track();
        var port = t.parentNode;
        var style = getComputedStyle(port);
        var size = port.clientHeight - (parseInt(style.paddingTop, 10) || 0) - (parseInt(style.paddingBottom, 10) || 0);
        var top = offsetIn(tile, t);
        var group = tile.parentNode;
        while (group && group !== t && !group.classList.contains('ha-group') && !group.classList.contains('ha-sec')) group = group.parentNode;
        var head = group && group !== t ? offsetIn(group, t) : top;
        var start = top - head < 140 ? head : top;
        var end = top + tile.offsetHeight;
        var pos = t._pos || 0;
        if (start < pos) pos = start;
        else if (end > pos + size) pos = Math.min(start, end - size);
        if (pos === t._pos) return;
        t._pos = pos;
        t.style.transform = pos ? 'translateY(' + (-pos) + 'px)' : '';
    }

    // ---------- Actions

    function busy(id, on) {
        tiles().forEach(function (x) { if (x._entity === id) x.classList.toggle('busy', on); });
    }

    function run(item, domain, service, data, done, failed) {
        busy(item.id, true);
        return HA.call(domain, service, data || null, { entity_id: item.id }).then(function () {
            busy(item.id, false);
            if (done) done();
        }, function (err) {
            busy(item.id, false);
            if (failed) failed();
            UI.toast(item.name + ': ' + (err && err.code === 'not_connected' ? 'Home Assistant nicht verbunden' : 'Befehl abgelehnt (' + (err && err.code) + ')'));
        });
    }

    function coverMenu(item, cam) {
        var list = [
            { label: 'Öffnen', run: function () { run(item, 'cover', 'open_cover'); } },
            { label: 'Stopp', run: function () { run(item, 'cover', 'stop_cover'); } },
            { label: 'Schließen', run: function () { run(item, 'cover', 'close_cover'); } }
        ];
        if (cam) list.push({ label: 'Kamera zeigen', run: function () { openFull(cam); } });
        UI.menu(item.name, list);
    }

    // +0,5 / −0,5 °C; the menu comes back after each step, with the same entry selected.
    function climateMenu(item, again) {
        var s = HA.state(item.id);
        var a = (s && s.attributes) || {};
        var target = view.target[item.id] !== undefined ? view.target[item.id] : Number(a.temperature);
        if (isNaN(target) || a.temperature === null || a.temperature === undefined) {
            UI.toast(item.name + ': Solltemperatur lässt sich hier nicht einstellen');
            return;
        }
        function step(delta) {
            var t = Math.round((target + delta) * 2) / 2;
            if (a.min_temp !== undefined && t < a.min_temp) t = a.min_temp;
            if (a.max_temp !== undefined && t > a.max_temp) t = a.max_temp;
            view.target[item.id] = t;
            // Rejected or not sent: forget the guess, so the menu shows Home Assistant's value again.
            run(item, 'climate', 'set_temperature', { temperature: t }, null, function () { delete view.target[item.id]; });
            climateMenu(item, delta > 0 ? 0 : 1);
        }
        UI.menu(item.name + ' · Soll ' + num(target) + ' °C', [
            { label: '+0,5 °C', run: function () { step(0.5); } },
            { label: '−0,5 °C', run: function () { step(-0.5); } }
        ]);
        if (again) UI.focusOn(UI.children($('menu-list'))[again]);
    }

    // ---------- Door opener: OK held 2 s, then a confirmation

    var hold = null;            // { el, id, last, repeats, timer }
    var keyupSeen = false;

    function openerDown(target) {
        if (hold) {
            hold.last = Date.now();
            hold.repeats++;
            return;
        }
        hold = { el: target, id: target._opener, last: Date.now(), repeats: 0 };
        target.classList.add('holding');
        hold.timer = setTimeout(holdDone, HOLD_OPEN_MS);
    }

    function endHold() {
        var h = hold;
        hold = null;
        if (!h) return null;
        clearTimeout(h.timer);
        h.el.classList.remove('holding');
        return h;
    }

    function holdDone() {
        var h = endHold();
        if (!h) return;
        // Still held: no keyup since (this TV sends them), or on a TV without keyups the repeats still coming.
        var held = keyupSeen || (h.repeats > 0 && Date.now() - h.last < 600);
        if (!held) {
            UI.toast('Zum Öffnen OK 2 s halten');
            return;
        }
        var it = view.model && view.model.byId[h.id];
        if (it) confirmOpen(it);
    }

    document.addEventListener('keyup', function (e) {
        if (e.keyCode !== KEY.ENTER) return;
        keyupSeen = true;
        if (endHold()) UI.toast('Zum Öffnen OK 2 s halten');
    });

    // The second step: a question with "Abbrechen" focused, so a stray OK does nothing.
    function confirmOpen(it) {
        UI.menu(it.plain + ' jetzt ' + openVerb(it) + '?', [
            { label: 'Ja, ' + openVerb(it), run: function () { openDoor(it); } },
            { label: 'Abbrechen', run: function () {} }
        ]);
        UI.focusOn(UI.children($('menu-list'))[1]);
    }

    function openDoor(it) {
        view.opened[it.id] = Date.now();
        var opens = canOpen(it);
        var done = function () {
            UI.toast(it.plain + (opens ? ' geöffnet' : ' entriegelt'));
            HAHistory.note(it.id, 'Türöffner · ' + it.plain + (opens ? '' : ' entriegelt') + ' (TV)', 'lock');
        };
        // Refused (rights, not reachable): the door was not the TV's doing, its popup comes again.
        var refused = function () { delete view.opened[it.id]; };
        if (it.domain === 'lock') run(it, 'lock', opens ? 'open' : 'unlock', null, done, refused);
        else run(it, 'button', 'press', null, done, refused);
    }

    // ---------- Full screen and popup

    function badge(box, mode) {
        var b = box.querySelector('.ha-live-badge');
        if (!b) return;
        b.textContent = mode === 'live' ? 'Live' : mode === 'wait' ? 'Verbinde …' : mode === 'still' ? 'Standbild' : '';
        b.className = 'ha-live-badge m-' + mode;
    }

    // Stills come from the sharpest channel, scaled by Home Assistant to the box (as light as the
    // medium channel, but not blown up on a big screen); the live picture follows the setting.
    function stillSource(cam) { return pick(cam, ['high', 'main', 'medium', 'low']); }

    function liveOpts(box, cam, w, h) {
        return {
            stream: streamSource(cam), still: stillSource(cam), width: w, height: h,
            onMode: function (mode) { badge(box, mode); }
        };
    }

    function openFull(cam) {
        closePop(true);
        view.full = cam.id;
        $('ha-full-name').textContent = cam.name;
        var box = $('ha-full');
        box.classList.remove('hidden', 'no-image');
        HALive.start(box, liveOpts(box, cam, 1920, 1080));
        UI.refresh();
        UI.refreshHints();
    }

    // hiding: the view is being replaced, so focus and hints belong to the next one.
    function closeFull(hiding) {
        if (!view.full) return false;
        view.full = null;
        HALive.stop();
        $('ha-full').classList.add('hidden');
        if (hiding === true) return true;
        UI.refresh();
        UI.refreshHints();
        refreshCameraTiles();
        return true;
    }

    // All events of "Zuletzt" on their own, over the cockpit; Back closes.
    function openLog() {
        view.logOpen = true;
        $('ha-logall').classList.remove('hidden');
        logRows($('ha-logall-list'));
        UI.refresh();
        UI.refreshHints();
    }

    // ---------- Lights: on/off, brightness on a slider, flood light

    function lightMenu(item) {
        var s = HA.state(item.id);
        var on = s && s.state === 'on';
        var list = [
            { label: on ? 'Ausschalten' : 'Einschalten', run: function () { run(item, 'light', on ? 'turn_off' : 'turn_on'); } }
        ];
        if (dimmable(s)) list.push({ label: 'Helligkeit …', run: function () { openSlider(item); } });
        // Flood light only for an outside light: it switches the camera lights on as well.
        var m = view.model;
        var cur = m && m.byId[item.id];
        if (cur && (m.quick.indexOf(cur) >= 0 || OUTSIDE.test(cur.name + ' ' + cur.area))) {
            list.push({ label: 'Flutlicht', run: function () { floodlight(item); } });
        }
        UI.menu(item.name, list);
    }

    function dimmable(s) {
        var modes = (s && s.attributes && s.attributes.supported_color_modes) || [];
        return modes.some(function (m) { return m !== 'onoff'; });
    }

    // Brightness in 10 % steps with Left/Right; sent a moment after the last step, not with each.
    function openSlider(item) {
        var s = HA.state(item.id);
        var b = s && s.state === 'on' ? Number(s.attributes.brightness) || 255 : 0;
        // A light that is on starts at 10 % at least, never at "Aus".
        var pct = Math.round(b / 255 * 10) * 10;
        view.slider = { item: item, pct: b ? Math.max(10, pct) : 0 };
        $('ha-slider-title').textContent = item.name;
        $('ha-slider').classList.remove('hidden');
        drawSlider();
        UI.refresh();
        UI.refreshHints();
    }

    function drawSlider() {
        var pct = view.slider.pct;
        $('ha-slider-fill').style.transform = 'scaleX(' + pct / 100 + ')';
        $('ha-slider-pct').textContent = pct ? pct + ' %' : 'Aus';
    }

    function sendSlider(sl) {
        clearTimeout(sl.timer);
        sl.timer = null;
        if (!sl.dirty) return;
        sl.dirty = false;
        if (sl.pct) run(sl.item, 'light', 'turn_on', { brightness_pct: sl.pct });
        else run(sl.item, 'light', 'turn_off');
    }

    function slide(k) {
        var sl = view.slider;
        sl.pct = Math.max(0, Math.min(100, sl.pct + (k === KEY.RIGHT ? 10 : -10)));
        sl.dirty = true;
        drawSlider();
        clearTimeout(sl.timer);
        sl.timer = setTimeout(function () { sendSlider(sl); }, 350);
    }

    // Closing sends a step still waiting at once: the connection may go with the view.
    function closeSlider(hiding) {
        if (!view.slider) return false;
        sendSlider(view.slider);
        view.slider = null;
        $('ha-slider').classList.add('hidden');
        if (hiding === true) return true;
        UI.refresh();
        UI.refreshHints();
        return true;
    }

    /*
     * Flood light: the light white and as bright as it goes, and with it every UniFi Protect light
     * (flood lights paired with the cameras; HA offers no other camera light). White as the light can:
     * its white channel, else its coolest colour temperature, else RGB white.
     */
    function whiteData(s) {
        var a = (s && s.attributes) || {};
        var modes = a.supported_color_modes || [];
        var data = { brightness: 255 };
        if (modes.indexOf('white') >= 0) return { white: 255 };
        if (modes.indexOf('color_temp') >= 0) data.color_temp_kelvin = Math.min(Number(a.max_color_temp_kelvin) || 6500, 6500);
        else if (modes.some(function (m) { return ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].indexOf(m) >= 0; })) data.rgb_color = [255, 255, 255];
        return data;
    }

    function floodlight(item) {
        // Only camera lights that certainly belong: on the device of a camera shown here, or given
        // the label "TV" themselves. Not every UniFi light in the house, and not by area.
        var m = view.model;
        var camDevices = {};
        var chosen = {};
        (m ? m.cams : []).forEach(function (c) { if (c.deviceId) camDevices[c.deviceId] = true; });
        (m ? m.all : []).forEach(function (x) { chosen[x.id] = true; });
        var others = HA.doorPeers().filter(function (p) {
            return p.domain === 'light' && p.platform === 'unifiprotect' && p.id !== item.id &&
                (chosen[p.id] || (p.deviceId && camDevices[p.deviceId]));
        });
        // The camera lights only once the light itself came on; the toast says what really did.
        run(item, 'light', 'turn_on', whiteData(HA.state(item.id)), function () {
            Promise.all(others.map(function (p) {
                return HA.call('light', 'turn_on', { brightness: 255 }, { entity_id: p.id }).then(function () { return true; }, function () { return false; });
            })).then(function (res) {
                var ok = res.filter(Boolean).length;
                var failed = res.length - ok;
                UI.toast('Flutlicht an' + (ok ? ' · ' + plural(ok, 'Kameralicht', 'Kameralichter') : '') +
                    (failed ? ' · ' + failed + ' nicht erreichbar' : ''));
            });
        });
    }

    function closeLog(hiding) {
        if (!view.logOpen) return false;
        view.logOpen = false;
        $('ha-logall').classList.add('hidden');
        if (hiding === true) return true;
        UI.refresh();
        UI.refreshHints();
        return true;
    }

    function bright() {
        view.brightUntil = Date.now() + ALERT_BRIGHT_MS;
        view.lastKey = Date.now();
        quiet();
    }

    function popup(kind, it) {
        if (!view.shown || !view.model) return;
        var cam = cameraFor(it);
        var opener = kind === 'alarm' ? null : openerFor(it);
        closeFull(true);
        closeLog(true);
        closeSlider(true);
        HALive.stop();
        view.pop = { kind: kind, id: it.id };
        bright();
        var place = opener ? opener.plain : it.plain;
        var title = kind === 'bell' ? (/tür$/i.test(place) ? 'Es klingelt an der ' + place : 'Es klingelt · ' + place)
            : kind === 'alarm' ? 'Alarm ausgelöst' : it.plain + ' wurde geöffnet';
        var box = $('ha-pop');
        box.className = 'ha-pop k-' + kind + (cam ? '' : ' no-cam');
        $('ha-pop-title').textContent = title;
        $('ha-pop-sub').textContent = clock(Date.now()) + (kind === 'alarm' ? ' · ' + it.plain : cam ? ' · ' + cam.short : '');
        var acts = $('ha-pop-actions');
        acts.innerHTML = '';
        if (opener) {
            var btn = actionEl(opener);
            btn._key = 'pop:' + opener.id;
            acts.appendChild(btn);
        }
        var camBox = $('ha-pop-cam');
        if (cam) HALive.start(camBox, liveOpts(camBox, cam, 1320, 742));
        clearTimeout(view.popTimer);
        view.popTimer = setTimeout(function () { closePop(); }, POP_CLOSE_MS);
        if (window.Sound) Sound.play('move');
        UI.refresh();
        UI.refreshHints();
    }

    function closePop(hiding) {
        if (!view.pop) return false;
        view.pop = null;
        clearTimeout(view.popTimer);
        endHold();
        HALive.stop();
        $('ha-pop').classList.add('hidden');
        if (hiding === true) return true;
        UI.refresh();
        UI.refreshHints();
        refreshCameraTiles();
        return true;
    }

    // The door at a bell: on the same device, behind the same opener, or in the same area.
    function sameDoor(bell, door) {
        if (!bell || !door) return false;
        var o = openerFor(bell);
        var od = openerFor(door);
        // Two known openers: they decide, a shared device or area must not overrule them.
        if (o && od) return o === od;
        // Same device or area only when it has this one door: with two, the TV cannot tell which.
        var by = bell.deviceId && bell.deviceId === door.deviceId ? 'deviceId'
            : bell.areaId && bell.areaId === door.areaId ? 'areaId' : '';
        if (!by) return false;
        return peers(by, door[by]).doors === 1;
    }

    // Doorbell, a door opened, the alarm going off: only while this view is open.
    HA.onChange(function (id, before, after) {
        if (!view.shown || !view.model || !before || !after) return;
        var it = view.model.byId[id];
        if (!it || unavailable(after) || before.state === after.state) return;
        // A doorbell event entity that never rang is "unknown" until its first ring (HA EventEntity):
        // that ring counts, if it is fresh (not a state brought back after a restart).
        // The same for a motion event entity's first motion.
        var firstRing = (it.role === 'bell' || it.role === 'motion') && it.domain === 'event' && before.state === 'unknown' &&
            Math.abs(Date.now() - (Date.parse(after.state) || 0)) < 60000;
        if (unavailable(before) && !firstRing) return;
        var dc = (after.attributes || {}).device_class || '';
        if (it.role === 'bell') {
            // An event entity with several types rings only with "ring".
            var type = (after.attributes || {}).event_type;
            if (it.domain === 'event' && type && type !== 'ring' && (attrs(it).event_types || []).indexOf('ring') >= 0) return;
            if (it.domain !== 'binary_sensor' || after.state === 'on') popup('bell', it);
        } else if (it.role === 'motion') {
            // Agreed: bright on any event, also without a popup (motion, a window). A motion event
            // entity's state is the time of its last event.
            if (after.state === 'on' || it.domain === 'event') bright();
        } else if (it.role === 'contact') {
            var opened = it.domain === 'cover' ? before.state === 'closed' : after.state === 'on';
            var doorish = it.domain === 'cover' || DOORISH.indexOf(dc) >= 0;
            if (opened) bright();
            // Someone opened the door the bell rang at: the ringing popup has done its job.
            if (opened && doorish && view.pop && view.pop.kind === 'bell' && sameDoor(view.model.byId[view.pop.id], it)) {
                closePop();
                return;
            }
            // Not for the door the TV itself just opened.
            var mine = openerFor(it);
            if (mine && Date.now() - (view.opened[mine.id] || 0) < 30000) return;
            if (opened && doorish) popup('door', it);
        } else if (it.role === 'alarm' && after.state === 'triggered') {
            popup('alarm', it);
        }
    });

    function activate(it) {
        if (it.action) {
            it.action();
            return;
        }
        if (it.moreCams) {
            view.camPage++;
            view.focusId = 'more-cams';
            render();
            return;
        }
        var cur = view.model && view.model.byId[it.id];
        var s = HA.state(it.id);
        if (!s || !cur) return;
        // Never on one press: openers go through OK held 2 s and a question (onKey, openerDown).
        if (it.opener || cur.role === 'opener') return;
        if (it.domain === 'camera') {
            openFull(cur);
            return;
        }
        // A garage door or gate (cover): its controls as before, its camera as one more entry.
        if (it.chip && cur.domain === 'cover') {
            coverMenu(it, cameraFor(cur));
            return;
        }
        // A door, window or motion sensor shows its camera.
        if (it.chip && cur.role !== 'alarm') {
            var cam = cameraFor(cur);
            if (cam) openFull(cam);
            else UI.toast(cur.plain + ': ' + chipValue(cur) + ' · keine Kamera im selben Bereich');
            return;
        }
        if (cur.role === 'alarm') {
            UI.toast('Alarmanlage: ' + (ALARM[s.state] || s.state) + ' · am TV nur Anzeige');
            return;
        }
        if (s.state === 'unavailable') {
            UI.toast(it.name + ' ist nicht erreichbar');
            return;
        }
        if (it.domain === 'light') lightMenu(it);
        else if (TOGGLE.indexOf(it.domain) >= 0) run(it, it.domain, 'toggle');
        else if (it.domain === 'scene') run(it, 'scene', 'turn_on', null, function () { UI.toast(it.name + ' aktiviert'); });
        else if (it.domain === 'script') run(it, 'script', 'turn_on', null, function () { UI.toast(it.name + ' gestartet'); });
        else if (it.domain === 'button') run(it, 'button', 'press', null, function () { UI.toast(it.name + ' gedrückt'); });
        else if (it.domain === 'cover') coverMenu(it);
        else if (it.domain === 'climate') climateMenu(it);
        // Sensors only show their value.
    }

    // ---------- Long running: burn-in shift, quiet hints, night dimming

    function shift() {
        view.shift = (view.shift + 1) % SHIFTS.length;
        var s = SHIFTS[view.shift];
        $('ha-shift').style.transform = s[0] || s[1] ? 'translate(' + s[0] + 'px, ' + s[1] + 'px)' : '';
    }

    function quiet() {
        var now = Date.now();
        var ha = $('ha');
        ha.classList.toggle('idle', now - view.lastKey > IDLE_MS && !view.pop);
        var dim = window.Appearance && Appearance.night() && !view.pop && now > view.brightUntil;
        ha.classList.toggle('dimmed', !!dim);
    }

    function poke() {
        view.lastKey = Date.now();
        if (window.Appearance && Appearance.night()) view.brightUntil = Math.max(view.brightUntil, Date.now() + BRIGHT_MS);
        quiet();
    }

    // ---------- History

    // type: the event type where known (event entities, seen live), e.g. "ring".
    function describe(id, state, type) {
        var it = view.model && view.model.byId[id];
        if (!it || state === 'unavailable' || state === 'unknown' || state === null || state === undefined) return null;
        switch (it.role) {
            case 'bell':
                if (it.domain === 'binary_sensor' && state !== 'on') return null;
                if (type && type !== 'ring' && (attrs(it).event_types || []).indexOf('ring') >= 0) return null;
                var opener = openerFor(it);
                return { text: 'Klingel · ' + (opener ? opener.plain : it.plain), kind: 'bell' };
            case 'contact':
                if (it.domain === 'cover') {
                    if (state === 'open') return { text: it.plain + ' geöffnet', kind: 'open' };
                    if (state === 'closed') return { text: it.plain + ' geschlossen', kind: 'door' };
                    return null;
                }
                return state === 'on' ? { text: it.plain + ' geöffnet', kind: 'open' } : { text: it.plain + ' geschlossen', kind: 'door' };
            case 'motion':
                return state === 'on' || it.domain === 'event' ? { motion: true, name: it.plain, text: 'Bewegung · ' + it.plain, kind: 'motion' } : null;
            case 'opener':
                if (it.domain === 'button') return { text: 'Türöffner · ' + it.plain, kind: 'lock' };
                if (state === 'unlocked' || state === 'open') return { text: it.plain + ' ' + (state === 'open' ? 'geöffnet' : 'entriegelt'), kind: 'lock' };
                if (state === 'locked') return { text: it.plain + ' verriegelt', kind: 'door' };
                return null;
            case 'alarm':
                return { text: 'Alarmanlage: ' + (ALARM[state] || state), kind: state === 'triggered' ? 'alarm' : 'door' };
        }
        return null;
    }

    function startHistory() {
        var m = view.model;
        if (!m) {
            HAHistory.stop();
            return;
        }
        var ids = m.bells.concat(m.contacts, m.motion, m.openers, m.alarms).map(function (x) { return x.id; });
        HAHistory.start(ids, describe);
    }

    // ---------- Lifecycle

    /*
     * Samsung's own screen saver as well (webapis.appcommon.setScreenSaver, Tizen 6.0 product API,
     * no privilege): off while the cockpit shows, on again when it goes. Where the TV lacks the API
     * (the reference Q70B had no appcommon, platform-probe.js) nothing happens; the DevLog says which.
     */
    function systemSaver(on) {
        var ac = window.webapis && webapis.appcommon;
        if (!ac || !ac.setScreenSaver || !ac.AppCommonScreenSaverState) {
            if (!on) log('Samsung screen saver: no webapis.appcommon on this TV');
            return;
        }
        var st = ac.AppCommonScreenSaverState;
        try {
            ac.setScreenSaver(on ? st.SCREEN_SAVER_ON : st.SCREEN_SAVER_OFF, function () {
                log('Samsung screen saver ' + (on ? 'on' : 'off'));
            }, function (e) {
                log('Samsung screen saver: refused (' + (e && e.code) + ')');
            });
        } catch (e) {
            log('Samsung screen saver: ' + (e && (e.name || e.code)));
        }
    }

    function onShow(opts) {
        if (!opts.back) {
            view.focusId = null;
            view.target = {};
            view.camPage = 0;
            track()._pos = 0;
            track().style.transform = '';
        }
        // Also when coming back from Settings, which released the connection on the way there.
        view.shown = true;
        view.lastKey = Date.now();
        systemSaver(false);
        HA.connect('view');
        render();
        if (HA.info().ready) startHistory();
        clearInterval(view.tileTimer);
        view.tileTimer = setInterval(refreshCameraTiles, TILE_MS);
        clearInterval(view.tick);
        var minute = new Date().getMinutes();
        view.tick = setInterval(function () {
            renderHead();
            quiet();
            var m = new Date().getMinutes();
            if (m !== minute) {
                minute = m;
                minuteTick();
            }
        }, 1000);
        clearInterval(view.shiftTimer);
        view.shiftTimer = setInterval(shift, SHIFT_MS);
        quiet();
    }

    function onHide() {
        view.shown = false;
        systemSaver(true);
        closeFull(true);
        closePop(true);
        closeLog(true);
        closeSlider(true);
        endHold();
        HAHistory.stop();
        clearInterval(view.tileTimer);
        clearInterval(view.tick);
        clearInterval(view.shiftTimer);
        view.tileTimer = view.tick = view.shiftTimer = null;
        $('ha').classList.remove('idle', 'dimmed');
        HA.release('view');
    }

    function open() {
        UI.show('ha');
    }

    function init() {
        UI.register('ha', {
            el: $('ha'),
            // The door opener reads OK's repeats itself (held 2 s); everything else is one step per press.
            keepRepeats: true,
            focusEl: focusEl,
            onShow: onShow,
            onHide: onHide,
            onFocus: function (t) {
                if (!!t._opener !== view.hintOpener) {
                    view.hintOpener = !!t._opener;
                    UI.refreshHints();
                }
                if (!t.classList.contains('ha-tile') || view.pop) return;
                view.focusId = t._key;
                scrollTo(t);
            },
            activate: activate,
            onKey: function (k) {
                poke();
                var arrow = k === KEY.LEFT || k === KEY.RIGHT || k === KEY.UP || k === KEY.DOWN;
                if (k === KEY.ENTER) {
                    var f = focusEl();
                    if (hold || (f && f._opener)) {
                        if (f && f._opener) openerDown(f);
                        return true;
                    }
                    if (view.slider) return closeSlider();
                    if (view.full || view.logOpen) return true;
                    return false;
                }
                if (view.slider) {
                    if (k === KEY.LEFT || k === KEY.RIGHT) slide(k);
                    return arrow;
                }
                if (view.pop || view.full || view.logOpen) return arrow;
                if (!arrow) return false;
                move(k);
                return true;
            },
            onBack: function () { return closeSlider() || closePop() || closeFull() || closeLog(); },
            hints: function () {
                if (view.pop) return $('ha-pop-actions').firstChild ? [['OK', '2 s halten: Tür öffnen'], ['Zurück', 'Schließen']] : [['Zurück', 'Schließen']];
                if (view.slider) return [['Links/Rechts', 'Helligkeit'], ['OK', 'Fertig']];
                if (view.full || view.logOpen) return [['Zurück', 'Schließen']];
                if (view.hintOpener) return [['OK', '2 s halten: Tür öffnen'], ['Zurück', 'Home']];
                return [['OK', 'Auswählen'], ['Zurück', 'Home']];
            }
        });
        HA.onUpdate(function (what) {
            if (!view.shown) return;
            if (what === 'status' || what === 'data') {
                var up = HA.status() === 'verbunden';
                if (!up && !view.lostAt) view.lostAt = Date.now();
                // Only the fresh snapshot after signing in again makes the state current.
                if (up && what === 'data') view.lostAt = 0;
                if (what === 'data' || !HA.info().ready) render();
                else {
                    renderHead();
                    fillStatus();
                }
                if (what === 'data') startHistory();
                return;
            }
            if (what !== 'user') updateEntity(what);
        });
        HAHistory.onUpdate(function () { if (view.shown) renderLog(); });
    }

    window.HAView = {
        init: init,
        open: open,
        // For checks in the preview: move the content now instead of in 3 minutes.
        shiftNow: shift
    };
})();

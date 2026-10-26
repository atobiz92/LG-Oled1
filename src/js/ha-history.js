/*
 * "Zuletzt" in the view "Sicherheit": the last 12 events of the security entities shown (doorbell,
 * doors and windows, motion, locks and door openers, alarm), with their time.
 *
 * Source: Home Assistant's logbook stream (WebSocket `logbook/event_stream`, no admin rights needed,
 * HA logbook/websocket_api.py): one answer with the past 12 hours, then the new entries live. Where
 * the logbook is missing (not loaded) or refused, `history/history_during_period` gives the past
 * 12 hours instead (also without admin rights; HA filters by read permission) and the changes seen
 * over `state_changed` while the view is open are added.
 *
 * Motion is summed up per sensor ("Einfahrt · 3× in 10 Min."), so a busy driveway does not push
 * everything else out. A door opened from the TV is noted at once and its own logbook entry left out.
 */
(function () {
    'use strict';

    var KEEP = 12;
    var HOURS = 12;
    var MOTION_GAP = 10 * 60000;     // motion within this of the previous one joins its line
    var PER_ID = 60;                // raw changes kept per entity (a motion sensor on and off)
    var OWN_GRACE = 20000;          // Home Assistant's entry for a door the TV opened: left out

    var log = DevLog.log;
    var entries = [];               // { when (ms), id, state } or { when, text, kind } (noted here)
    var seen = Object.create(null);
    var watched = Object.create(null);  // entity_id -> true
    var describe = null;            // fn(id, state) -> { text, kind, motion } or null (from the view)
    var mode = '';                  // 'logbook' | 'history' | ''
    var stopStream = null;
    var run = 0;
    var listeners = [];
    var own = {};                   // entity_id -> time the TV opened it
    var epoch = -1;                 // HA.epoch() the entries belong to

    function notify() {
        listeners.forEach(function (fn) { fn(); });
    }

    function add(e) {
        if (!e.id || e.state === undefined || e.state === null || !isFinite(e.when)) return false;
        var key = e.id + '|' + e.state + '|' + Math.round(e.when / 1000);
        if (seen[key]) return false;
        seen[key] = true;
        entries.push(e);
        return true;
    }

    function trim() {
        var since = Date.now() - HOURS * 3600000;
        entries = entries.filter(function (e) { return e.when >= since; });
        entries.sort(function (a, b) { return a.when - b.when; });
        // A busy motion sensor must not push the doorbell and doors out: each entity keeps its
        // newest PER_ID entries (enough for the lines that sum motion up), the rest all of theirs.
        var count = Object.create(null);
        var kept = [];
        for (var i = entries.length - 1; i >= 0; i--) {
            var e = entries[i];
            if (e.id) {
                count[e.id] = (count[e.id] || 0) + 1;
                if (count[e.id] > PER_ID) continue;
            }
            kept.push(e);
        }
        entries = kept.reverse();
        // Only what is kept counts as seen: the view may stay open for weeks.
        seen = Object.create(null);
        entries.forEach(function (e) { if (e.id) seen[e.id + '|' + e.state + '|' + Math.round(e.when / 1000)] = true; });
    }

    function iso(ms) {
        return new Date(ms).toISOString();
    }

    function fromLogbook(event) {
        var list = (event && event.events) || [];
        var added = false;
        list.forEach(function (x) {
            if (!x || !watched[x.entity_id]) return;
            // HA hands an event entity's event_type along (logbook EXPOSED_STATE_ATTRIBUTES).
            var type = x.attributes && x.attributes.event_type;
            added = add({ when: Number(x.when) * 1000, id: x.entity_id, state: x.state, type: type }) || added;
        });
        if (added) {
            trim();
            notify();
        }
    }

    // history/history_during_period answers in the compressed form: { id: [{ s, lu, lc? }] }.
    function fromHistory(result) {
        Object.keys(result || {}).forEach(function (id) {
            var last = null;
            (result[id] || []).forEach(function (x) {
                var state = x.s !== undefined ? x.s : x.state;
                var when = x.lc || x.lu ? Number(x.lc || x.lu) * 1000 : Date.parse(x.last_changed || x.last_updated);
                var a = x.a || x.attributes;
                if (state === last) return;
                last = state;
                add({ when: when, id: id, state: state, type: a && a.event_type });
            });
        });
        trim();
        notify();
    }

    // Event entities are asked for with their attributes (every row), to know which event it was
    // ("ring" or not); everything else without, which keeps the answer small.
    function historyOf(ids, withAttributes) {
        if (!ids.length) return Promise.resolve({});
        return HA.request({
            type: 'history/history_during_period', start_time: iso(Date.now() - HOURS * 3600000), entity_ids: ids,
            include_start_time_state: false, significant_changes_only: false,
            minimal_response: !withAttributes, no_attributes: !withAttributes
        });
    }

    function useHistory(ids, mine) {
        mode = 'history';
        var events = ids.filter(function (id) { return /^event\./.test(id); });
        var rest = ids.filter(function (id) { return !/^event\./.test(id); });
        Promise.all([historyOf(rest, false), historyOf(events, true)]).then(function (r) {
            if (mine !== run) return;
            fromHistory(r[0]);
            fromHistory(r[1]);
        }, function (err) {
            if (mine !== run) return;
            log('Home Assistant: history not readable (' + (err && err.code) + '), collecting from now on');
        });
    }

    /*
     * ids: the security entities shown; fn(id, state) describes one entry. Called after every load
     * (a new connection ends the stream). Keeps what was collected for entities still shown.
     */
    function start(ids, fn) {
        stop();
        // Another server or account (Settings): nothing of the last one stays, not even what the TV
        // noted itself.
        if (HA.epoch() !== epoch) {
            epoch = HA.epoch();
            entries = [];
            seen = Object.create(null);
            own = {};
        }
        var mine = ++run;
        describe = fn;
        watched = Object.create(null);
        ids.forEach(function (id) { watched[id] = true; });
        entries = entries.filter(function (e) { return !e.id || watched[e.id]; });
        // What left with them is no longer "seen": shown again, they come back in full.
        seen = Object.create(null);
        entries.forEach(function (e) { if (e.id) seen[e.id + '|' + e.state + '|' + Math.round(e.when / 1000)] = true; });
        notify();
        if (!ids.length) return;
        mode = 'logbook';
        HA.stream({ type: 'logbook/event_stream', start_time: iso(Date.now() - HOURS * 3600000), entity_ids: ids }, function (event) {
            if (mine === run) fromLogbook(event);
        }).then(function (end) {
            if (mine !== run) {
                end();
                return;
            }
            stopStream = end;
        }, function (err) {
            if (mine !== run) return;
            log('Home Assistant: logbook not usable (' + (err && err.code) + '), using history');
            useHistory(ids, mine);
        });
    }

    function stop() {
        run++;
        mode = '';
        if (stopStream) stopStream();
        stopStream = null;
    }

    // Without the logbook: changes seen live (with the logbook they arrive through its stream).
    HA.onChange(function (id, before, after) {
        if (mode !== 'history' || !watched[id] || !after) return;
        if (before && before.state === after.state) return;
        var when = Date.parse(after.last_changed || after.last_updated) || Date.now();
        var type = (after.attributes || {}).event_type;
        if (add({ when: when, id: id, state: after.state, type: type })) {
            trim();
            notify();
        }
    });

    // Something the TV did itself ("Haustür geöffnet (TV)"), shown at once.
    function note(id, text, kind) {
        // Every opening of its own, the last ten: an earlier one must not come back as HA's entry.
        own[id] = (own[id] || []).concat(Date.now()).slice(-10);
        entries.push({ when: Date.now(), text: text, kind: kind || 'lock' });
        trim();
        notify();
    }

    function mine(e) {
        return (own[e.id] || []).some(function (t) { return e.when >= t - 2000 && e.when <= t + OWN_GRACE; });
    }

    function minutes(ms) {
        return Math.max(1, Math.round(ms / 60000));
    }

    // Newest first, motion summed up, at most KEEP lines: [{ when, text, kind }].
    function list() {
        // The view redraws every minute: what is older than HOURS goes then too, not only when
        // something new comes in.
        var since = Date.now() - HOURS * 3600000;
        if (entries.length && entries[0].when < since) trim();
        var out = [];
        var motion = {};        // id -> the open motion line
        for (var i = entries.length - 1; i >= 0 && out.length < KEEP * 3; i--) {
            var e = entries[i];
            if (e.text) {
                out.push({ when: e.when, text: e.text, kind: e.kind });
                continue;
            }
            // Home Assistant's own entry for what the TV did (the opening) is left out, not what
            // followed it, e.g. a lock locking itself again ten seconds later.
            if (e.state !== 'locked' && mine(e)) continue;
            var d = describe ? describe(e.id, e.state, e.type) : null;
            if (!d) continue;
            if (d.motion) {
                var line = motion[e.id];
                if (line && line.oldest - e.when <= MOTION_GAP) {
                    line.count++;
                    line.oldest = e.when;
                    line.text = d.name + ' · ' + line.count + '× in ' + minutes(line.when - line.oldest) + ' Min.';
                    continue;
                }
                line = motion[e.id] = { when: e.when, oldest: e.when, count: 1, text: d.text, kind: 'motion' };
                out.push(line);
                continue;
            }
            out.push({ when: e.when, text: d.text, kind: d.kind });
        }
        return out.slice(0, KEEP).map(function (x) { return { when: x.when, text: x.text, kind: x.kind }; });
    }

    window.HAHistory = {
        start: start,
        stop: stop,
        note: note,
        list: list,
        mode: function () { return mode; },
        onUpdate: function (fn) { listeners.push(fn); }
    };
})();

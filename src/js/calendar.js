/*
 * Upcoming appointments from one or more private calendar links (iCal/ICS: Google, iCloud,
 * Outlook). The TV fetches them straight from the calendar provider; no service in between, and
 * nothing is ever written back.
 *
 * The links are secrets (anyone with one can read that calendar), so they are not in config:
 * config.local.js only names each calendar and its Keychain entry, and scripts/install-tv.sh puts
 * the links into js/calendar-links.js inside the build, read from the Mac's Keychain.
 *
 * Reading the calendars is left to ical.js (Mozilla, MPL-2.0, vendored in js/vendor): time zones
 * from the feed's VTIMEZONE blocks, every RRULE part, EXDATE, moved occurrences, alarms kept apart
 * from the event. This file only fetches, keeps a small per-calendar cache and formats.
 *
 * The 79 KB library is not in index.html: it is parsed on the TV's slow CPU before Home can show,
 * and without a calendar it is never needed. loadIcal() adds it the first time a fetch is due.
 */
(function () {
    'use strict';

    var STORE_KEY = 'arn0.calendar.v2';
    var OLD_KEYS = ['arn0.calendar.v1'];     // earlier formats, removed on start (titles inside)
    var FRESH_MS = 15 * 60 * 1000;          // refetch a calendar at most every 15 minutes
    var USABLE_MS = 24 * 60 * 60 * 1000;    // a calendar not fetched for a day shows nothing
    var WINDOW_DAYS = 14;
    var MAX_STEPS = 20000;                   // per series; a daily series since 1970 still fits
    var TIMEOUT_MS = 10000;
    var DAY_MS = 86400000;

    // RRULE parts that are iterated. ical.js 1.5.0 can loop forever on some others (BYWEEKNO with
    // YEARLY), synchronously, so an event using anything else is skipped rather than expanded.
    var RRULE_PARTS = ['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'WKST'];

    function safeRule(ev) {
        var prop = ev.component.getFirstPropertyValue('rrule');
        if (!prop) return true;
        var parts = prop.toString().split(';').map(function (p) { return p.split('=')[0].toUpperCase(); });
        return parts.every(function (p) { return RRULE_PARTS.indexOf(p) >= 0; });
    }

    // ---------- Configuration

    // Calendars from two places: set up on the TV (Settings → Kalender, stored with the other
    // settings) and installed from the Mac's Keychain (config.local.js + install script). `key`
    // identifies a calendar in the cache, so renaming keeps its entries.
    function sources() {
        var cfg = (window.LAUNCHER_CONFIG && window.LAUNCHER_CONFIG.calendar) || {};
        var links = window.LAUNCHER_CALENDAR_LINKS || {};
        var macPrefs = prefs().mac || {};
        var fromMac = (cfg.sources || []).map(function (s) {
            var o = macOverride(macPrefs, s.name);
            return { key: 'mac:' + s.name, macName: s.name, name: o.name || s.name, url: links[s.name] || '', onTv: false, hidden: !!o.hidden };
        });
        var onTv = (prefs().list || []).map(function (c) {
            return { key: 'tv:' + c.id, name: c.name, url: c.url, onTv: true, id: c.id };
        });
        return onTv.concat(fromMac).filter(function (s) { return s.name && s.url && !s.hidden; });
    }

    // TV-side changes to an installed calendar; own properties only, so a calendar named
    // "constructor" or "toString" does not pick up Object.prototype.
    function macOverride(macPrefs, name) {
        var o = Object.prototype.hasOwnProperty.call(macPrefs, name) ? macPrefs[name] : null;
        return o && typeof o === 'object' ? o : {};
    }

    // Installed calendars the viewer removed on the TV, so Settings can offer them back.
    function hiddenMac() {
        var cfg = (window.LAUNCHER_CONFIG && window.LAUNCHER_CONFIG.calendar) || {};
        var macPrefs = prefs().mac || {};
        return (cfg.sources || []).filter(function (s) { return macOverride(macPrefs, s.name).hidden; })
            .map(function (s) { return s.name; });
    }

    // Host only, for showing which service a calendar comes from without showing its secret path.
    // Without user info ("name:password@") and port, which can carry secrets as well.
    function host(url) {
        var m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?([^/?#:]+)/i.exec(url || '');
        return m ? m[1] : '';
    }

    function prefs() {
        return Prefs.get().calendar;
    }

    // ---------- Reading a feed with ical.js
    // → [{ title, start, end, allDay }] (times as ms) for occurrences that overlap [from, until].

    // ical.js rejects a whole feed for one bad value (an unknown BYDAY, a malformed UNTIL). Then
    // each event is read on its own, with the feed's time zones, and only the broken ones are lost.
    function parseFeed(text) {
        try {
            return [new ICAL.Component(ICAL.parse(text))];
        } catch (e) {
            var plain = text.replace(/\r\n/g, '\n');
            var zones = plain.match(/BEGIN:VTIMEZONE[\s\S]*?END:VTIMEZONE/g) || [];
            var events = plain.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
            var roots = [];
            events.forEach(function (ev) {
                try {
                    roots.push(new ICAL.Component(ICAL.parse(['BEGIN:VCALENDAR'].concat(zones, [ev, 'END:VCALENDAR']).join('\n'))));
                } catch (e2) {
                    // A fixed message only: the parser's own text can quote attendee names and mails.
                    DevLog.log('Calendar: skipped an unreadable event');
                }
            });
            return roots;
        }
    }

    function occurrences(text, from, until) {
        var roots = parseFeed(text);
        var vevents = [];
        roots.forEach(function (root) {
            root.getAllSubcomponents('vtimezone').forEach(function (vtz) {
                var tz = new ICAL.Timezone(vtz);
                if (tz.tzid && !ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz.tzid, tz);
            });
            vevents = vevents.concat(root.getAllSubcomponents('vevent'));
        });

        // Exceptions (moved or cancelled single occurrences) are tied to their series by UID only.
        // An empty `exceptions` list stops ical.js 1.5.0 from attaching every sibling with a
        // RECURRENCE-ID regardless of its UID; strictExceptions makes relateException check it.
        var masters = {};
        var exceptions = [];
        vevents.forEach(function (vevent) {
            var ev = new ICAL.Event(vevent, { strictExceptions: true, exceptions: [] });
            if (ev.isRecurrenceException()) exceptions.push(ev);
            else masters[ev.uid || Math.random()] = ev;
        });
        exceptions.forEach(function (ex) {
            if (!masters[ex.uid]) return;
            try {
                masters[ex.uid].relateException(ex);
            } catch (e) {
                DevLog.log('Calendar: skipped an exception that does not fit its series');
            }
        });

        var out = [];
        function add(item, start, end) {
            if (/CANCELLED/i.test(item.component.getFirstPropertyValue('status') || '')) return;
            var s = start.toJSDate().getTime();
            var e = end ? end.toJSDate().getTime() : s + (start.isDate ? DAY_MS : 0);
            if (e <= from || s > until) return;
            out.push({ title: item.summary || 'Termin', start: s, end: e, allDay: !!start.isDate });
        }

        Object.keys(masters).forEach(function (uid) {
            var ev = masters[uid];
            try {
                if (!ev.isRecurring()) {
                    add(ev, ev.startDate, ev.endDate);
                    return;
                }
                if (!safeRule(ev)) {
                    DevLog.log('Calendar: skipped a series with an unsupported repeat rule');
                    return;
                }
                var it = ev.iterator();
                var next;
                var steps = 0;
                while ((next = it.next()) && steps++ < MAX_STEPS) {
                    if (next.toJSDate().getTime() > until) break;
                    var d = ev.getOccurrenceDetails(next);
                    // A single moved occurrence is added below by its own (new) time. A range
                    // exception (RANGE=THISANDFUTURE) also changes every later occurrence: those
                    // keep the times computed here, with the exception's details.
                    if (d.item === ev) add(ev, d.startDate, d.endDate);
                    else if (d.item.recurrenceId && d.item.recurrenceId.compare(d.recurrenceId) !== 0) add(d.item, d.startDate, d.endDate);
                }
            } catch (e) {
                // One malformed event must not take the others with it. Fixed text, no feed content.
                DevLog.log('Calendar: skipped an event that could not be expanded');
            }
        });

        // Each moved or cancelled occurrence by its own start, so one moved from outside the window
        // to tomorrow still shows (and a cancelled one never does).
        exceptions.forEach(function (ex) {
            if (!masters[ex.uid]) return;
            try {
                add(ex, ex.startDate, ex.endDate);
            } catch (e) {
                DevLog.log('Calendar: skipped an exception that could not be read');
            }
        });
        return out;
    }

    // ---------- Cache: per calendar, stamped with that calendar's last successful fetch

    var cache = {};        // name → { at, items }; `at` is the last successful fetch
    var tried = {};        // name → last attempt, so a failing calendar is retried every 15 min, not every tick
    var fetching = false;
    var listeners = [];
    var status = {};       // name → true | reason, for Settings → Kalender

    function load() {
        try {
            cache = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
        } catch (e) {
            cache = {};
        }
    }

    function save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(cache));
        } catch (e) {
            // Only the instant first paint is lost.
        }
    }

    // Calendars that were removed from the configuration leave the cache, titles included.
    function prune() {
        var keep = {};
        sources().forEach(function (s) { keep[s.key] = true; });
        Object.keys(cache).forEach(function (key) { if (!keep[key]) delete cache[key]; });
    }

    // A calendar's link changed: its old entries belong to the old link.
    // A fetch carries the link it was started with; an answer for a link that has changed since
    // (or a calendar that is gone) is dropped instead of filling the cache with the old entries.
    function forget(key) {
        delete cache[key];
        delete status[key];
        delete tried[key];
        save();
    }

    function currentUrl(key) {
        var s = sources().filter(function (x) { return x.key === key; })[0];
        return s ? s.url : null;
    }

    // ical.js is loaded on demand, once: the first fetch that is due adds the script tag, later ones
    // share the promise. A failed load is forgotten so the next fetch (15 minutes on) tries again; it
    // surfaces as that calendar's error in Settings, like an unreachable feed.
    var ICAL_SRC = 'js/vendor/ical-1.5.0.min.js';
    var icalLoading = null;

    function loadIcal() {
        if (window.ICAL) return Promise.resolve();
        if (icalLoading) return icalLoading;
        icalLoading = new Promise(function (resolve, reject) {
            var tag = document.createElement('script');
            tag.src = ICAL_SRC;
            tag.onload = function () {
                if (window.ICAL) resolve();
                else reject(new Error('Kalender-Bibliothek defekt'));
            };
            tag.onerror = function () {
                if (tag.parentNode) tag.parentNode.removeChild(tag);
                reject(new Error('Kalender-Bibliothek nicht ladbar'));
            };
            document.head.appendChild(tag);
        });
        icalLoading.catch(function () { icalLoading = null; });
        return icalLoading;
    }

    function get(url) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url.replace(/^webcal:/i, 'https:'), true);
            xhr.timeout = TIMEOUT_MS;
            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300 && /BEGIN:VCALENDAR/.test(xhr.responseText)) resolve(xhr.responseText);
                else reject(new Error('HTTP ' + xhr.status));
            };
            xhr.onerror = function () { reject(new Error('nicht erreichbar')); };
            xhr.ontimeout = function () { reject(new Error('Zeitüberschreitung')); };
            xhr.send();
        });
    }

    // Fetches every calendar that is due; a failed one keeps its old entries with their old stamp,
    // so after a day without success it stops showing them.
    var again = false;      // a forced refresh asked for while one was running

    function refresh(force) {
        if (!prefs().enabled) return;
        if (fetching) {
            if (force) again = true;
            return;
        }
        prune();
        var now = Date.now();
        var due = sources().filter(function (s) {
            if (force) return true;
            if (tried[s.key] && now - tried[s.key] < FRESH_MS) return false;
            return !cache[s.key] || now - cache[s.key].at >= FRESH_MS;
        });
        due.forEach(function (s) { tried[s.key] = now; });
        if (!due.length) return;
        fetching = true;
        var from = now - DAY_MS;
        var until = now + WINDOW_DAYS * DAY_MS;
        Promise.all(due.map(function (s) {
            // The feed and the library load side by side; the library is not waited for before the request.
            return Promise.all([get(s.url), loadIcal()]).then(function (loaded) {
                var text = loaded[0];
                if (currentUrl(s.key) !== s.url) return;
                cache[s.key] = { at: Date.now(), items: occurrences(text, from, until) };
                status[s.key] = true;
            }).catch(function (err) {
                if (currentUrl(s.key) !== s.url) return;
                status[s.key] = err.message;
                DevLog.log('Calendar ' + s.name + ': ' + err.message);
            });
        })).then(function () {
            fetching = false;
            prune();
            save();
            listeners.forEach(function (fn) { fn(); });
            if (again) {
                again = false;
                refresh(true);
            }
        });
    }

    // Entries of the configured, recently fetched calendars (a calendar not fetched for a day shows nothing).
    function entries(t) {
        var items = [];
        if (!prefs().enabled) return items;
        sources().forEach(function (s) {
            var c = cache[s.key];
            if (!c || t - c.at > USABLE_MS) return;
            c.items.forEach(function (it) {
                items.push({ title: it.title, start: new Date(it.start), end: new Date(it.end), allDay: it.allDay });
            });
        });
        return items;
    }

    function byStart(a, b) { return a.start - b.start; }

    function sameItem(a, b) {
        return a.title === b.title && a.start.getTime() === b.start.getTime();
    }

    // Next appointments for Home, at most `max`: from configured, recently fetched calendars only.
    // `skip`: items (from waste()) that are shown elsewhere and must not appear a second time.
    function next(now, max, skip) {
        var t = now.getTime();
        return entries(t).filter(function (it) {
            return it.end.getTime() > t && !(skip || []).some(function (x) { return sameItem(x, it); });
        }).sort(byStart).slice(0, max);
    }

    // Appointments touching the days from `from` up to (not including) `to`, by start. The same rules
    // as next(); an appointment over several days is one entry, the caller puts it on every day it
    // touches. A zero-length one at exactly `from` still counts.
    function range(from, to) {
        var f = from.getTime();
        var u = to.getTime();
        return entries(Date.now()).filter(function (it) {
            return it.start.getTime() < u && (it.end.getTime() > f || it.start.getTime() >= f);
        }).sort(byStart);
    }

    // ---------- Waste collection: appointments whose title sounds like it get a line of their own the
    // evening before (from 18:00) and on the morning itself (until 10:00), so the bin goes out.
    var WASTE_WORDS = [
        // Whole words only where a name could match: "Dr. Müller" is not the bin.
        /tonne/, /\b(rest|bio|sperr|haus)?(müll|muell)(abfuhr|tonne|säcke|sack)?(?![a-zäöüß])/, /abfall/, /\b(alt)?papier(abfuhr|sammlung|container)?\b/,
        /\bgelbe[rn]? (sack|säcke|tonne)\b/, /wertstoff/, /\bbio(abfall|müll|tonne)?\b/, /\bglas(container|abfuhr)?\b/
    ];
    var WASTE_FROM_HOUR = 18;
    var WASTE_UNTIL_HOUR = 10;

    function isWaste(title) {
        var t = String(title || '').toLowerCase();
        return WASTE_WORDS.some(function (re) { return re.test(t); });
    }

    // { label: "Morgen: Papiertonne", items } for the day the bin goes out, or null. With titles
    // switched off the label names only what it is, not the calendar entry.
    function waste(now) {
        var h = now.getHours();
        if (h >= WASTE_UNTIL_HOUR && h < WASTE_FROM_HOUR) return null;
        var offset = h >= WASTE_FROM_HOUR ? 1 : 0;
        var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
        var end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset + 1);
        var items = range(day, end).filter(function (it) {
            return it.start >= day && it.start < end && isWaste(it.title);
        });
        if (!items.length) return null;
        var names = [];
        items.forEach(function (it) {
            var n = prefs().titles ? it.title : 'Müllabfuhr';
            if (names.indexOf(n) < 0) names.push(n);
        });
        return { label: (offset ? 'Morgen' : 'Heute') + ': ' + names.join(', '), items: items };
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    // { when: "Heute 14:00" | "Morgen ganztägig" | "Mi 10:30" | "Do 12. Nov. 10:30", what: title }
    function parts(item, now) {
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var day = new Date(item.start.getFullYear(), item.start.getMonth(), item.start.getDate());
        var diff = Math.round((day - today) / DAY_MS);
        var weekday = day.toLocaleDateString('de-DE', { weekday: 'short' }).replace(/\.$/, '');
        var when = diff <= 0 ? 'Heute' : diff === 1 ? 'Morgen' : diff < 7 ? weekday :
            weekday + ' ' + day.getDate() + '. ' + day.toLocaleDateString('de-DE', { month: 'short' }).replace(/\.$/, '') + '.';
        var time = item.allDay ? 'ganztägig' : pad(item.start.getHours()) + ':' + pad(item.start.getMinutes());
        return { when: when + ' ' + time, what: prefs().titles ? item.title : 'Termin' };
    }

    // "Heute 14:00 · Kundentermin", for places that show one line.
    function label(item, now) {
        var p = parts(item, now);
        return p.when + ' · ' + p.what;
    }

    function summary() {
        var n = sources().length;
        if (!n) return 'Kein Kalender eingerichtet';
        if (!prefs().enabled) return 'Aus';
        return n === 1 ? '1 Kalender' : n + ' Kalender';
    }

    // For Settings → Kalender: every calendar with where it comes from and how it fetched.
    function list() {
        return sources().map(function (s) {
            var st = status[s.key];
            return {
                id: s.id, macName: s.macName, name: s.name, onTv: s.onTv, key: s.key, host: host(s.url),
                state: st === true ? 'geladen' : st ? 'nicht geladen (' + st + ')' : 'noch nicht geladen'
            };
        });
    }

    function start() {
        OLD_KEYS.forEach(function (k) {
            try {
                localStorage.removeItem(k);
            } catch (e) {
                // Nothing to clean then.
            }
        });
        load();
        prune();
        save();
        refresh();
    }

    window.Calendar = {
        start: start,
        refresh: refresh,
        next: next,
        range: range,
        waste: waste,
        isWaste: isWaste,
        label: label,
        parts: parts,
        summary: summary,
        list: list,
        hiddenMac: hiddenMac,
        forget: forget,
        host: host,
        configured: function () { return sources().length > 0; },
        onUpdate: function (fn) { listeners.push(fn); },
        occurrences: occurrences    // for tests
    };
})();

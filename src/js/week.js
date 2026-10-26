/*
 * Week view "Diese Woche": seven columns from today with the appointments and holidays of each
 * day, the active weather warning above them. Opened with OK on the agenda at the top left of
 * Home (home.js); Back returns there. Read-only: nothing here can be focused or changed.
 *
 * A day's column holds what fits. Titles wrap to two lines and the text grows with the text size,
 * so instead of a fixed count the column is filled and then trimmed until it fits, with
 * "+n weitere" for the rest.
 */
(function () {
    'use strict';

    var $ = UI.$;
    var el = UI.el;
    var DAYS = 7;

    function day(base, plus) {
        return new Date(base.getFullYear(), base.getMonth(), base.getDate() + plus);
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

    function short(d, opts) {
        return d.toLocaleDateString('de-DE', opts).replace(/\.$/, '');
    }

    // "So 25. Okt"
    function dayLabel(d) {
        return short(d, { weekday: 'short' }) + ' ' + short(d, { day: 'numeric', month: 'short' });
    }

    // When an entry happens on this day: its start, "ganztägig", or for one that began earlier "bis 09:00".
    function whenText(it, from, until) {
        if (it.allDay) return 'ganztägig';
        if (it.start < from) return it.end <= until ? 'bis ' + hm(it.end) : 'ganztägig';
        return hm(it.start);
    }

    // All-day and carried-over entries first, then by start.
    function ordered(items, from) {
        function first(it) { return it.allDay || it.start < from ? 0 : 1; }
        return items.slice().sort(function (a, b) { return first(a) - first(b) || a.start - b.start; });
    }

    function entryEl(when, text) {
        var row = el('div', 'wk-ev');
        row.appendChild(el('div', 'wk-time', when));
        row.appendChild(el('div', 'wk-title', text));
        return row;
    }

    function holidayEl(name) {
        var row = el('div', 'wk-hol', name);
        return row;
    }

    // Fills `list`, then drops entries from the end until it fits, replacing them by "+n weitere".
    function fit(list, entries) {
        entries.forEach(function (e) { list.appendChild(e); });
        var shown = entries.length;
        var more = el('div', 'wk-more');
        while (shown > 0 && list.scrollHeight > list.clientHeight + 1) {
            list.removeChild(entries[--shown]);
            more.textContent = '+' + (entries.length - shown) + ' weitere';
            if (!more.parentNode) list.appendChild(more);
        }
    }

    function render() {
        var now = new Date();
        var start = day(now, 0);
        var end = day(now, DAYS);
        var titles = Prefs.get().calendar.titles;
        var events = window.Calendar ? Calendar.range(start, end) : [];
        var holidays = window.Holidays ? Holidays.range(start, end) : [];

        var warning = window.Warnings ? Warnings.current(now) : null;
        shownWarning = JSON.stringify(warning);
        Alerts.fill($('week-alerts'), { warning: warning, waste: null, count: warning ? 1 : 0 });

        var last = day(now, DAYS - 1);
        $('week-range').textContent = dayLabel(start) + ' bis ' + dayLabel(last);

        var cols = $('week-cols');
        cols.innerHTML = '';
        var lists = [];
        for (var i = 0; i < DAYS; i++) {
            var from = day(now, i);
            var until = day(now, i + 1);
            var col = el('div', 'wk-col' + (i === 0 ? ' today' : ''));
            var head = el('div', 'wk-head');
            head.appendChild(el('span', 'wk-dow', short(from, { weekday: 'short' })));
            head.appendChild(el('span', 'wk-date', short(from, { day: 'numeric', month: 'short' })));
            col.appendChild(head);
            var list = el('div', 'wk-list');
            col.appendChild(list);
            cols.appendChild(col);

            var entries = [];
            holidays.forEach(function (h) {
                if (h.date >= from && h.date < until) entries.push(holidayEl(h.name));
            });
            var today = events.filter(function (it) {
                // Touching the day; a zero-length entry exactly at midnight counts for that day.
                return it.start < until && (it.end > from || it.start >= from);
            });
            ordered(today, from).forEach(function (it) {
                entries.push(entryEl(whenText(it, from, until), titles ? it.title : 'Termin'));
            });
            lists.push({ list: list, entries: entries });
        }
        // Trimmed after all columns are in the page: only then do the lists have their height.
        lists.forEach(function (l) { fit(l.list, l.entries); });
    }

    var shownDay = null;
    var shownWarning = null;    // what render() last drew, so an expired warning goes without a fetch

    function onShow() {
        shownDay = new Date().getDate();
        render();
    }

    function init() {
        UI.register('week', {
            el: $('week'),
            rows: function () { return []; },
            onShow: onShow,
            hints: [['Zurück', 'Home']]
        });
        if (window.Calendar) Calendar.onUpdate(function () { if (UI.isVisible('week')) render(); });
        if (window.Warnings) Warnings.onUpdate(function () { if (UI.isVisible('week')) render(); });
    }

    window.Week = {
        init: init,
        open: function () { UI.show('week'); },
        // With Home's clock: a new day while the view is open moves the columns along.
        tick: function () {
            if (!UI.isVisible('week')) return;
            if (new Date().getDate() !== shownDay) onShow();
            // A warning that ran out (or went stale offline) leaves without waiting for an update.
            else if (window.Warnings && JSON.stringify(Warnings.current(new Date())) !== shownWarning) render();
        }
    };
})();

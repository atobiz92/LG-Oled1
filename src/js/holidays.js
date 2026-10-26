/*
 * Next public holiday in Germany, worked out on the TV: no service is asked, nothing leaves the
 * device. Nationwide holidays plus those of the state chosen on the TV (Prefs holidays.state, set
 * in the first-run assistant or Settings → Feiertage) or else set in config (holidays.state,
 * e.g. 'NW'); without a state only the nationwide ones count. Easter by the Gregorian computus, everything
 * movable from there. Holidays that apply only to parts of a state (Augsburg, some Catholic
 * communes) are left out.
 */
(function () {
    'use strict';

    function easter(y) {
        var a = y % 19;
        var b = Math.floor(y / 100);
        var c = y % 100;
        var d = Math.floor(b / 4);
        var e = b % 4;
        var f = Math.floor((b + 8) / 25);
        var g = Math.floor((b - f + 1) / 3);
        var h = (19 * a + b - d - g + 15) % 30;
        var i = Math.floor(c / 4);
        var k = c % 4;
        var l = (32 + 2 * e + 2 * i - h - k) % 7;
        var m = Math.floor((a + 11 * h + 22 * l) / 451);
        var month = Math.floor((h + l - 7 * m + 114) / 31);
        var day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(y, month - 1, day);
    }

    function plus(date, days) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
    }

    // Wednesday before 23 November.
    function repentanceDay(y) {
        var d = new Date(y, 10, 22);
        while (d.getDay() !== 3) d = plus(d, -1);
        return d;
    }

    // [name, date, states: '*' for nationwide, else state codes]
    function year(y) {
        var e = easter(y);
        return [
            ['Neujahr', new Date(y, 0, 1), '*'],
            ['Heilige Drei Könige', new Date(y, 0, 6), 'BW BY ST'],
            ['Frauentag', new Date(y, 2, 8), 'BE MV'],
            ['Karfreitag', plus(e, -2), '*'],
            ['Ostersonntag', e, 'BB'],
            ['Ostermontag', plus(e, 1), '*'],
            ['Tag der Arbeit', new Date(y, 4, 1), '*'],
            ['Christi Himmelfahrt', plus(e, 39), '*'],
            ['Pfingstsonntag', plus(e, 49), 'BB'],
            ['Pfingstmontag', plus(e, 50), '*'],
            ['Fronleichnam', plus(e, 60), 'BW BY HE NW RP SL'],
            ['Mariä Himmelfahrt', new Date(y, 7, 15), 'SL'],
            ['Weltkindertag', new Date(y, 8, 20), 'TH'],
            ['Tag der Deutschen Einheit', new Date(y, 9, 3), '*'],
            ['Reformationstag', new Date(y, 9, 31), 'BB HB HH MV NI SN ST SH TH'],
            ['Allerheiligen', new Date(y, 10, 1), 'BW BY NW RP SL'],
            ['Buß- und Bettag', repentanceDay(y), 'SN'],
            ['1. Weihnachtstag', new Date(y, 11, 25), '*'],
            ['2. Weihnachtstag', new Date(y, 11, 26), '*']
        ];
    }

    // The 16 states by name, with the codes used in year() above.
    var STATES = [
        ['BW', 'Baden-Württemberg'], ['BY', 'Bayern'], ['BE', 'Berlin'], ['BB', 'Brandenburg'],
        ['HB', 'Bremen'], ['HH', 'Hamburg'], ['HE', 'Hessen'], ['MV', 'Mecklenburg-Vorpommern'],
        ['NI', 'Niedersachsen'], ['NW', 'Nordrhein-Westfalen'], ['RP', 'Rheinland-Pfalz'], ['SL', 'Saarland'],
        ['SN', 'Sachsen'], ['ST', 'Sachsen-Anhalt'], ['SH', 'Schleswig-Holstein'], ['TH', 'Thüringen']
    ].map(function (s) { return { key: s[0], label: s[1] }; });

    // A choice made on the TV wins over config, including "nationwide only" (empty string).
    function state() {
        var p = window.Prefs && Prefs.get().holidays;
        if (p && typeof p.state === 'string') return p.state || null;
        var c = window.LAUNCHER_CONFIG && window.LAUNCHER_CONFIG.holidays;
        return (c && c.state) || null;
    }

    // code: a state code, or null for nationwide holidays only.
    function setState(code) {
        Prefs.get().holidays.state = code || '';
        Prefs.save();
    }

    function stateLabel() {
        var s = state();
        var found = STATES.find(function (x) { return x.key === s; });
        return found ? found.label : 'Nur bundesweit';
    }

    function applies(h, s) {
        return h[2] === '*' || (s && h[2].split(' ').indexOf(s) >= 0);
    }

    // [{ name, date }] for the holidays on the days from `from` up to (not including) `to`, in date
    // order. The same rules as next(): nationwide ones and those of the chosen state.
    function range(from, to) {
        var s = state();
        var start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
        var out = [];
        for (var y = start.getFullYear(); y <= to.getFullYear(); y++) {
            year(y).forEach(function (h) {
                if (applies(h, s) && h[1] >= start && h[1] < to) out.push({ name: h[0], date: h[1] });
            });
        }
        return out.sort(function (a, b) { return a.date - b.date; });
    }

    // { name, date, days } for the next holiday from today (today included), or null.
    function next(now) {
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var s = state();
        var all = year(today.getFullYear()).concat(year(today.getFullYear() + 1));
        var found = null;
        all.forEach(function (h) {
            if (!applies(h, s) || h[1] < today) return;
            if (!found || h[1] < found.date) found = { name: h[0], date: h[1] };
        });
        if (found) found.days = Math.round((found.date - today) / 86400000);
        return found;
    }

    // "Allerheiligen · in 7 Tagen", "… · morgen", "… · am 25. Dezember".
    function label(h) {
        if (!h) return '';
        var when = h.days === 0 ? 'heute' : h.days === 1 ? 'morgen' : h.days <= 7 ? 'in ' + h.days + ' Tagen' :
            'am ' + h.date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
        return h.name + ' · ' + when;
    }

    window.Holidays = {
        next: next,
        range: range,
        label: label,
        states: STATES,
        state: state,
        setState: setState,
        stateLabel: stateLabel
    };
})();

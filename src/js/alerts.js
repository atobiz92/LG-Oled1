/*
 * The two highlighted lines above the appointments, on Home (home.js), in the screen saver
 * (screensaver.js) and, for the warning, in the week view (week.js): an official weather warning
 * (js/warnings.js) and the waste collection of the next morning (js/calendar.js waste()).
 * Only the picking and drawing is here, so all three places show them the same way.
 */
(function () {
    'use strict';

    // Stroke icons like the rest of the launcher: a warning triangle and a bin.
    var ICONS = {
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5L2.8 19.5h18.4L12 3.5z"/>' +
            '<path d="M12 10v4.5M12 17.2h.01"/></svg>',
        waste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>'
    };

    var SOURCE = 'Quelle: Deutscher Wetterdienst';   // required wherever a warning is shown

    // What is highlighted right now: { warning, waste, count, key }. `key` changes when the
    // picture does, so callers redraw only then.
    function state(now) {
        var warning = window.Warnings ? Warnings.current(now) : null;
        var waste = window.Calendar ? Calendar.waste(now) : null;
        return {
            warning: warning,
            waste: waste,
            count: (warning ? 1 : 0) + (waste ? 1 : 0),
            key: JSON.stringify([warning, waste && waste.label])
        };
    }

    function line(classes, icon, text, more, source) {
        var row = UI.el('div', 'alert ' + classes);
        var mark = UI.el('span', 'alert-icon');
        mark.innerHTML = icon;
        row.appendChild(mark);
        var body = UI.el('div', 'alert-body');
        body.appendChild(UI.el('div', 'alert-line', text));
        // Under the text, so a long warning keeps its line: the credit on the left, the rest on the right.
        if (source) {
            var sub = UI.el('div', 'alert-sub');
            sub.appendChild(UI.el('span', 'alert-src', source));
            if (more) sub.appendChild(UI.el('span', 'alert-more', more));
            body.appendChild(sub);
        }
        row.appendChild(body);
        return row;
    }

    // Draws the lines of `st` into `box` (hidden when there are none).
    function fill(box, st) {
        box.innerHTML = '';
        if (st.warning) {
            var w = st.warning;
            box.appendChild(line('warning ' + w.level, ICONS.warning, w.text, w.more ? '+' + w.more + ' weitere' : '', SOURCE));
        }
        if (st.waste) box.appendChild(line('waste', ICONS.waste, st.waste.label));
        box.classList.toggle('hidden', !st.count);
    }

    window.Alerts = {
        state: state,
        fill: fill
    };
})();

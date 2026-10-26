/*
 * UI core: screens ("views"), remote focus, keys, toast, pop-up menu.
 *
 * A view is registered with UI.register(name, def):
 *   el          its root element
 *   rows()      focusable elements as rows: [[a, b, c], [d, e]] (generic arrow navigation)
 *   onShow(opts) called when the view appears (render here); opts.back when returning to it
 *   onHide()    called when another view replaces it (not when an overlay opens over it)
 *   activate(item, el)   OK on an element whose `_item` is set
 *   onKey(code) handle a key first; return true if handled (for custom navigation),
 *               or 'pass' to leave it to the browser (e.g. typing in a text field)
 *   onBack()    return true if Back was handled inside the view
 *   onFocus(el) called after focus moves
 *   overlay     shown on top of the previous view instead of replacing it
 *   hints       remote keys to show along the bottom: [['OK', 'Open'], ['Back', 'Home']].
 *               A function instead of an array is called on every show, for hints that depend
 *               on state. Omit for no bar.
 */
(function () {
    'use strict';

    var KEY = {
        // Back comes from the platform layer (webOS: 461, Tizen: 10009).
        LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: (window.Platform && Platform.KEYS.BACK) || 10009,
        RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
        // Desktop preview equivalents: Esc/Backspace = Back, R/G/Y/B = colour keys
        ESC: 27, BACKSPACE: 8, R: 82, G: 71, Y: 89, B: 66
    };

    var views = {};
    var focus = {};
    var current = null;

    function $(id) { return document.getElementById(id); }

    function el(tag, className, text) {
        var e = document.createElement(tag);
        if (className) e.className = className;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function children(parent) { return Array.prototype.slice.call(parent.children); }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function chunk(items, n) {
        var rows = [];
        for (var i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n));
        return rows;
    }

    function register(name, def) {
        views[name] = def;
        focus[name] = { r: def.startRow || 0, c: 0, last: {} };
    }

    /*
     * The hint bar sits outside the views so it survives view switches. An overlay keeps its own
     * hints if it declares them and otherwise leaves the bar beneath it alone, so a pop-up over
     * Home does not blank Home's shortcuts.
     */
    // Keys drawn as on the Samsung Smart Remote (BN59-01358B): OK is the centre of the navigation
    // ring, Back the curved arrow. Everything else (arrows, words) stays text.
    var KEY_ICONS = {
        'OK': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" ' +
            'stroke-width="2"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>',
        'Zurück': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
            'stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/></svg>'
    };
    KEY_ICONS.Back = KEY_ICONS['Zurück'];
    KEY_ICONS['Links/Rechts'] = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/></svg>';
    KEY_ICONS['Hoch/Runter'] = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M7 9l5-5 5 5M7 15l5 5 5-5"/></svg>';

    function hintKey(name) {
        var key = el('span', 'hint-key');
        if (KEY_ICONS[name]) {
            key.classList.add('round');   // not 'icon': that class is the app-icon image
            key.innerHTML = KEY_ICONS[name];
            key.setAttribute('aria-label', name);
        } else {
            key.textContent = name;
        }
        return key;
    }

    function renderHints(def) {
        var bar = $('hints');
        if (!bar) return;
        var list = typeof def.hints === 'function' ? def.hints() : def.hints;
        if (!list && def.overlay) return;
        bar.innerHTML = '';
        if (!list || !list.length) {
            bar.classList.add('hidden');
            return;
        }
        list.forEach(function (h) {
            var group = el('div', 'hint');
            group.appendChild(hintKey(h[0]));
            group.appendChild(el('span', 'hint-label', h[1]));
            bar.appendChild(group);
        });
        bar.classList.remove('hidden');
    }

    // opts.back: returning to this view (do not remember where we came from)
    function show(name, opts) {
        opts = opts || {};
        var def = views[name];
        // The view that stops being visible (the one under an overlay counts) is told so, e.g. to
        // close a connection only it needed (js/ha-view.js). An overlay on top hides nothing.
        var leaving = current && views[current].overlay ? views[current].from : current;
        if (leaving && leaving !== name && !def.overlay && views[leaving].onHide) views[leaving].onHide();
        if (!opts.back && !def.overlay && current && current !== name) def.from = current;
        // Shown again over itself (a dialog asked twice): keep where it came from, or Back would loop.
        if (def.overlay && current !== name) def.from = current;
        current = name;
        swallowPress();
        Object.keys(views).forEach(function (n) {
            var v = views[n];
            if (!v.el) return;
            var visible = n === name || (def.overlay && n === def.from);
            v.el.classList.toggle('hidden', !visible);
        });
        if (def.onShow) def.onShow(opts);
        // After onShow, so hints that read state see the state this view just rendered.
        renderHints(def);
        refresh();
    }

    function back() {
        var def = views[current];
        if (def.onBack && def.onBack()) return;
        if (def.from) show(def.from, { back: true });
    }

    function rows() {
        var def = views[current];
        return def.rows ? def.rows().filter(function (r) { return r.length; }) : [];
    }

    function focusedEl() {
        var r = rows();
        if (!r.length) return null;
        var f = focus[current];
        f.r = clamp(f.r, 0, r.length - 1);
        f.c = clamp(f.c, 0, r[f.r].length - 1);
        return r[f.r][f.c];
    }

    function setFocus(target) {
        var prev = document.querySelectorAll('.focused');
        for (var i = 0; i < prev.length; i++) prev[i].classList.remove('focused');
        if (!target) return;
        target.classList.add('focused');
        ensureVisible(target);
        var def = views[current];
        if (def.onFocus) def.onFocus(target);
    }

    function refresh() {
        var def = views[current];
        setFocus(def.focusEl ? def.focusEl() : focusedEl());
    }

    // Point generic focus at an element (e.g. after re-rendering).
    function focusOn(target) {
        var r = rows();
        for (var i = 0; i < r.length; i++) {
            var c = r[i].indexOf(target);
            if (c >= 0) {
                focus[current].r = i;
                focus[current].c = c;
            }
        }
        refresh();
    }

    function centerX(e) {
        var b = e.getBoundingClientRect();
        return b.left + b.width / 2;
    }

    function move(dr, dc) {
        var r = rows();
        if (!r.length) return;
        var f = focus[current];
        focusedEl();
        // Remembered so the sound can tell a real move from a clamp at the edge of a row.
        var wasR = f.r;
        var wasC = f.c;
        if (dc) f.c = clamp(f.c + dc, 0, r[f.r].length - 1);
        if (dr) {
            var nr = clamp(f.r + dr, 0, r.length - 1);
            if (nr !== f.r) {
                f.last[f.r] = f.c;
                var best = 0;
                // Leaving a single-item row (e.g. the gear) returns to where we were in the target row.
                if (r[f.r].length === 1 && f.last[nr] !== undefined) {
                    best = clamp(f.last[nr], 0, r[nr].length - 1);
                } else {
                    var x = centerX(r[f.r][f.c]);
                    r[nr].forEach(function (e, i) {
                        if (Math.abs(centerX(e) - x) < Math.abs(centerX(r[nr][best]) - x)) best = i;
                    });
                }
                f.r = nr;
                f.c = best;
            }
        }
        if (window.Sound) Sound.play(f.r === wasR && f.c === wasC ? 'edge' : 'move');
        refresh();
    }

    // Scrolls the focused element's track with a transform (no layout scrolling).
    // Horizontal for .row-track, vertical for .grid and .vtrack.
    function ensureVisible(item) {
        var track = item.parentNode;
        var horizontal = track.classList.contains('row-track');
        var vertical = track.classList.contains('grid') || track.classList.contains('vtrack');
        if (!horizontal && !vertical) return;
        var port = track.parentNode;
        var pad = horizontal ? 0 : getComputedStyle(port);
        // The padding is room for the focus (growth, shadow), not visible track: only the rest scrolls.
        var size = horizontal ? port.clientWidth
            : port.clientHeight - (parseInt(pad.paddingTop, 10) || 0) - (parseInt(pad.paddingBottom, 10) || 0);
        var start = horizontal ? item.offsetLeft : item.offsetTop;
        var len = horizontal ? item.offsetWidth : item.offsetHeight;
        var pos = track._pos || 0;
        if (start < pos) pos = start;
        else if (start + len > pos + size) pos = start + len - size;
        if (pos === track._pos) return;
        track._pos = pos;
        track.style.transform = horizontal ? 'translateX(' + (-pos) + 'px)' : 'translateY(' + (-pos) + 'px)';
    }

    function resetScroll(track) {
        track._pos = 0;
        track.style.transform = '';
    }

    /*
     * OK held down, as on Apple TV: a view with onLongPress(item, el) gets it once OK has been held
     * for HOLD_MS; a shorter press still activates, on keyup. A held remote key auto-repeats, and
     * those repeats are what mark the press as long, so a TV that sends no keyup still activates
     * on a short press (no repeats by the time the timer runs) instead of leaving OK dead.
     */
    var HOLD_MS = 700;
    var hold = null;   // { def, item, el, repeats, timer }
    var keyupSeen = false;   // once the TV has sent an OK keyup, the hold time alone decides

    function startHold(def, el) {
        // Until the keyup, every further keydown is the held key repeating. The TV does send keyups
        // (the runner game depends on them); the repeat count only matters before the first one.
        if (hold) {
            hold.repeats++;
            return;
        }
        hold = { def: def, item: el._item, el: el, repeats: 0 };
        hold.timer = setTimeout(function () {
            var h = hold;
            hold = null;
            if (keyupSeen || h.repeats > 0) h.def.onLongPress(h.item, h.el);
            else h.def.activate(h.item, h.el);
        }, HOLD_MS);
    }

    function endHold(e) {
        if (e.keyCode !== KEY.ENTER) return;
        keyupSeen = true;
        if (released(KEY.ENTER)) {
            // A hold begun before the view changed belongs to the old view: it must not fire later.
            if (hold) {
                clearTimeout(hold.timer);
                hold = null;
            }
            return;
        }
        if (!hold) return;
        clearTimeout(hold.timer);
        var h = hold;
        hold = null;
        h.def.activate(h.item, h.el);
    }

    /*
     * The OK or Back that opens or closes a view must not act in the next one too. The press goes
     * on after the view has changed: its auto-repeats and keyup land in the new view and would pick
     * the first menu entry, close a text field or walk back through several screens at once. So once
     * a view changes while one of these keys is down, that key is swallowed until the press ends:
     * its keyup, or no further repeat for HOLD_MS on a TV that sends no keyup. A view that uses a
     * press for something else (ending typing in the text dialog) can ask for the same (swallowPress).
     */
    var press = { code: null, guard: false, timer: null };

    function guarded(k) {
        return k === KEY.ENTER || k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE;
    }

    function pressed(k) {
        press.code = k;
        clearTimeout(press.timer);
        press.timer = setTimeout(function () {
            press.code = null;
            press.guard = false;
        }, HOLD_MS);
    }

    // True when this keyup ends a swallowed press, so nothing else should act on it.
    function released(k) {
        if (k !== press.code) return false;
        var swallowed = press.guard;
        press.code = null;
        press.guard = false;
        clearTimeout(press.timer);
        return swallowed;
    }

    function swallowPress() {
        if (press.code !== null) press.guard = true;
    }

    var keyHook = null;   // e.g. HDMI shown inside the launcher swallows keys
    var colourKey = null; // global shortcuts

    function onKey(e) {
        var k = e.keyCode;
        if (guarded(k)) {
            if (press.guard && press.code === k) {
                pressed(k);
                e.preventDefault();
                return;
            }
            pressed(k);
        }
        if (keyHook && keyHook(k)) {
            e.preventDefault();
            return;
        }
        var def = views[current];
        var handled = def.onKey ? def.onKey(k) : false;
        if (handled === 'pass') return;
        if (handled) {
            // A view's own OK/Back handling (the app editor) is one step per press too, unless the
            // view reads the repeats itself (Back held on Home, the game).
            if (guarded(k) && !def.keepRepeats) swallowPress();
            e.preventDefault();
            return;
        }
        switch (k) {
            case KEY.UP: move(-1, 0); break;
            case KEY.DOWN: move(1, 0); break;
            case KEY.LEFT: move(0, -1); break;
            case KEY.RIGHT: move(0, 1); break;
            case KEY.ENTER:
                var cur = def.focusEl ? def.focusEl() : focusedEl();
                if (!(cur && cur._item && def.activate)) break;
                if (def.onLongPress) startHold(def, cur);
                else if (!e.repeat) {
                    def.activate(cur._item, cur);
                    // One press, one step: its repeats must not pick on the next step of a list.
                    swallowPress();
                }
                break;
            case KEY.BACK: case KEY.ESC: case KEY.BACKSPACE:
                back();
                swallowPress();   // one press goes back one step, held or not
                break;
            default:
                if (!(colourKey && colourKey(k, current))) return;
        }
        e.preventDefault();
    }

    var toastTimer = null;
    function toast(msg) {
        $('toast').textContent = msg;
        $('toast').classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { $('toast').classList.remove('visible'); }, 3500);
    }

    // Small pop-up list over the current view. options: [{ label, run, checked }]
    function menu(title, options) {
        $('menu-title').textContent = title;
        var list = $('menu-list');
        list.innerHTML = '';
        options.forEach(function (o) {
            var li = el('li', o.checked ? 'checked' : '', o.label);
            li._item = o;
            list.appendChild(li);
        });
        focus.menu = { r: 0, c: 0, last: {} };
        show('menu');
    }

    function init() {
        register('menu', {
            el: $('menu'),
            overlay: true,
            hints: [['OK', 'Auswählen'], ['Zurück', 'Schließen']],
            rows: function () { return children($('menu-list')).map(function (li) { return [li]; }); },
            activate: function (o) {
                show(views.menu.from, { back: true });
                if (o.run) o.run();
            }
        });
        document.addEventListener('keydown', onKey);
        document.addEventListener('keyup', endHold);
        document.addEventListener('keyup', function (e) { if (e.keyCode !== KEY.ENTER) released(e.keyCode); });

        // Mouse wheel and trackpad (desktop preview, pointer remotes): one notch moves one step,
        // so every list and grid scrolls the same way the arrow keys do.
        var wheelAt = 0;
        document.addEventListener('wheel', function (e) {
            var dx = e.deltaX;
            var dy = e.deltaY;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 4 || Date.now() - wheelAt < 160) return;
            wheelAt = Date.now();
            if (!current) return;
            // Through onKey, so hooks (HDMI in the launcher, the game) and views see it as an arrow key.
            var code = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? KEY.DOWN : KEY.UP) : (dx > 0 ? KEY.RIGHT : KEY.LEFT);
            onKey({ keyCode: code, preventDefault: function () {} });
        }, { passive: true });
    }

    window.UI = {
        KEY: KEY,
        $: $,
        el: el,
        children: children,
        clamp: clamp,
        chunk: chunk,
        register: register,
        show: show,
        back: back,
        refresh: refresh,
        setFocus: setFocus,
        focusOn: focusOn,
        resetScroll: resetScroll,
        // For state changes that redraw hints without switching view.
        refreshHints: function () { renderHints(views[current]); },
        toast: toast,
        menu: menu,
        init: init,
        current: function () { return current; },
        isVisible: function (name) { return current === name; },
        swallowPress: swallowPress,
        setKeyHook: function (fn) { keyHook = fn; },
        setColourKey: function (fn) { colourKey = fn; }
    };
})();

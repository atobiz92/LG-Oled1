/*
 * Settings, laid out like tvOS: every page has a stage on the left (the focused entry's icon, name
 * and one or two sentences, or on Darstellung a live preview of Home) and a grouped list on the
 * right. A choice opens its own list with a check mark (the shared view "pick"), yes/no is a switch.
 * One renderer draws every page (renderPage); a page only describes its groups.
 * Special views keep their own mechanics: the app editor, the wallpaper grid, the Lab, the text dialog.
 */
(function () {
    'use strict';

    var $ = UI.$;
    var el = UI.el;
    var KEY = UI.KEY;
    var THUMB_COLS = 9;   // must match .thumbs in style.css; 27 photos fit in three rows

    // Samsung's on-screen keyboard (IME) sends these for its Done / Cancel buttons.
    var IME_DONE = 65376;
    var IME_CANCEL = 65385;

    // Samsung's own home screen (Smart Hub); TV settings are one press away from there.
    // Opening com.samsung.tv.coba.setting directly does not work on the Q70B: a plain launch
    // fails (UnknownError) and app controls are accepted but show nothing.
    var SAMSUNG_HOME = 'com.samsung.tv.csfs';

    var LOGOS = [
        { key: 'playstation', label: 'PlayStation' },
        { key: 'xbox', label: 'Xbox' },
        { key: 'switch', label: 'Nintendo Switch' },
        { key: '', label: 'Keine' }
    ];

    var METHODS = [
        { key: 'switch+viewer', label: 'TV-Eingang', hint: 'Spielmodus möglich' },
        { key: 'inapp', label: 'Im Launcher', hint: 'Zurück kehrt hierher' }
    ];

    // ---------- Pages: stage left, grouped list right
    //
    // page: { name, title, crumb, icon, color, text, preview, groups() } (title and text may be functions)
    // group: { head, rows, foot }
    // row: { label, value, icon, color, text, kind, on, checked, warn, danger, mini, font, key, run, preview }
    //   kind: 'nav' (own page or list: chevron), 'toggle' (switch), 'check' (option in a list),
    //   'action' (does something here), 'external' (leaves the launcher), 'info' (only shows a value).
    //   text: the stage's explanation while the row has focus; preview: values the Home preview shows.

    var pages = {};

    function val(v) { return typeof v === 'function' ? v() : v; }

    function rowKey(r) { return r.key !== undefined ? r.key : r.label; }

    function iconStyle() {
        return Prefs.get().appearance.iconStyle || 'ordiscale';
    }

    // The icon style lives on each page (not on <html>), so the Symbolstil list can show a style
    // while it has focus without changing anything else.
    function setStyleClass(view, style) {
        ['ordiscale', 'plain', 'color'].forEach(function (s) { view.classList.toggle('st-' + s, s === style); });
    }

    function svgSpan(cls, name) {
        var s = el('span', cls);
        s.innerHTML = Icons.svg(name);
        return s;
    }

    function rowEl(r) {
        var row = el('div', 'gl-row' + (r.danger ? ' danger' : ''));
        if (r.mini) {
            row.classList.add('with-mini');
            row.appendChild(r.mini);
        } else if (r.icon) {
            row.appendChild(svgSpan('gl-ic ' + (r.color || 'c-gray'), r.icon));
        } else {
            row.classList.add('noicon');
        }
        var label = el('span', 'gl-label', r.label);
        if (r.font) label.style.fontFamily = r.font;
        row.appendChild(label);
        if (r.value) row.appendChild(el('span', 'gl-value' + (r.warn ? ' warn' : ''), r.value));
        if (r.kind === 'toggle') row.appendChild(el('span', 'gl-switch' + (r.on ? ' on' : '')));
        if (r.kind === 'check') {
            var mark = svgSpan('gl-check', 'check');
            if (!r.checked) mark.style.visibility = 'hidden';   // keeps the value column in place
            row.appendChild(mark);
        }
        if (r.kind === 'nav') row.appendChild(svgSpan('gl-end', 'chevron-right'));
        if (r.kind === 'external') row.appendChild(svgSpan('gl-end', 'square-arrow-out-up-right'));
        row._item = r;
        return row;
    }

    function rowEls(page) {
        return Array.prototype.slice.call(page.track.querySelectorAll('.gl-row'));
    }

    // Built once per view: head (crumb and title), stage, and the port the list scrolls in.
    function skeleton(page) {
        var view = page.el;
        view.classList.add('split');
        view.innerHTML = '';
        var head = el('header', 'split-head');
        page.crumbEl = head.appendChild(el('div', 'crumb'));
        page.titleEl = head.appendChild(el('h1', ''));
        view.appendChild(head);
        page.stage = view.appendChild(el('div', 'stage'));
        page.art = page.stage.appendChild(el('div', 'stage-art'));
        page.stageTitle = page.stage.appendChild(el('h3', 'stage-title'));
        page.stageText = page.stage.appendChild(el('p', 'stage-text'));
        page.port = view.appendChild(el('div', 'gl-port'));
        page.track = page.port.appendChild(el('div', 'gl-track'));
    }

    function renderPage(page) {
        var view = page.el;
        setStyleClass(view, page.style ? page.style() : iconStyle());
        var crumb = val(page.crumb) || '';
        page.crumbEl.textContent = crumb;
        page.crumbEl.parentNode.classList.toggle('has-crumb', !!crumb);
        page.titleEl.textContent = val(page.title);
        var track = page.track;
        track.innerHTML = '';
        page.groups().forEach(function (g) {
            if (!g.rows.length) return;
            var wrap = el('div', 'gl-group');
            if (g.head) wrap.appendChild(el('div', 'gl-head', g.head));
            var box = el('div', 'gl-box');
            g.rows.forEach(function (r) { box.appendChild(rowEl(r)); });
            wrap.appendChild(box);
            if (g.foot) wrap.appendChild(el('div', 'gl-foot', g.foot));
            track.appendChild(wrap);
        });
        page.stageKey = null;
        if (val(page.preview)) Preview.fill();
    }

    function resetScroll(page) {
        page.track._pos = 0;
        page.track.style.transform = '';
    }

    /*
     * Keeps the focused row inside the port with a transform (no layout scrolling). The first row of a
     * group brings its heading along and the last its footnote, so neither is left cut off.
     */
    function scrollToRow(page, row) {
        var track = page.track;
        var box = row.parentNode;
        var wrap = box.parentNode;
        var top = row === box.firstChild ? wrap.offsetTop : row.offsetTop;
        var bottom = row === box.lastChild ? wrap.offsetTop + wrap.offsetHeight : row.offsetTop + row.offsetHeight;
        var style = getComputedStyle(page.port);
        var size = page.port.clientHeight - (parseInt(style.paddingTop, 10) || 0) - (parseInt(style.paddingBottom, 10) || 0);
        var pos = track._pos || 0;
        if (top < pos) pos = top;
        else if (bottom > pos + size) pos = bottom - size;
        pos = Math.max(0, Math.min(pos, track.offsetHeight - size));
        if (pos === (track._pos || 0)) return;
        track._pos = pos;
        track.style.transform = pos ? 'translateY(' + (-pos) + 'px)' : '';
    }

    // The stage follows the focus: a row with its own explanation shows itself, otherwise the page.
    function updateStage(page, r) {
        if (val(page.preview)) {
            Preview.show(page.art, r.preview);
            page.stage.classList.add('with-preview');
            page.stageTitle.textContent = '';
            page.stageText.textContent = r.text || val(page.text) || '';
            return;
        }
        page.stage.classList.remove('with-preview');
        var own = r.icon && r.text && !page.stageFixed;
        var icon = own ? r.icon : val(page.icon);
        var color = own ? r.color : val(page.color);
        var key = icon + '|' + color;
        if (key !== page.stageKey) {
            page.stageKey = key;
            page.art.innerHTML = '';
            page.art.appendChild(svgSpan('stage-icon ' + (color || 'c-gray'), icon));
        }
        page.stageTitle.textContent = own ? r.label : val(page.title);
        page.stageText.textContent = (own ? r.text : r.text || val(page.text)) || '';
    }

    function focusRow(page, row) {
        var r = row._item;
        page.lastKey = rowKey(r);
        scrollToRow(page, row);
        updateStage(page, r);
        if (page.onFocusRow) page.onFocusRow(r);
    }

    function findRow(page, key) {
        return rowEls(page).find(function (row) { return rowKey(row._item) === key; });
    }

    function registerPage(page) {
        pages[page.name] = page;
        page.el = $(page.name);
        skeleton(page);
        UI.register(page.name, {
            el: page.el,
            rows: function () { return rowEls(page).map(function (row) { return [row]; }); },
            onShow: function (opts) {
                renderPage(page);
                var target = null;
                if (opts.back) target = findRow(page, page.lastKey);
                else {
                    resetScroll(page);
                    if (page.startKey) target = findRow(page, page.startKey());
                    target = target || rowEls(page)[0];
                }
                if (target) UI.focusOn(target);
            },
            onFocus: function (row) { if (row._item) focusRow(page, row); },
            activate: function (r) { if (r.run) r.run(); },
            hints: function () {
                return [['OK', 'Auswählen'], ['Zurück', val(page.crumb) || 'Home']];
            }
        });
    }

    // Redraws the page on screen after a change, keeping the focused row (by its name, so a row
    // that appears or disappears above it does not move the focus).
    function redraw() {
        var page = pages[UI.current()];
        if (!page) return;
        renderPage(page);
        var row = findRow(page, page.lastKey);
        if (row) UI.focusOn(row);
        else UI.refresh();
    }

    function toggleRow(r) {
        r.kind = 'toggle';
        r.value = '';
        var flip = r.flip;
        r.run = function () {
            flip();
            redraw();
        };
        return r;
    }

    // ---------- Choice lists ("pick"): one view for every choice, refilled per use
    //
    // spec: { title, crumb, icon, color, text, foot, options: [{ value, label, font, text }],
    //         current, choose(value), previewKey, styleKey }
    // Focus starts on the current value. Focus alone changes nothing except the stage (the Home
    // preview or the icon style shows the focused option); OK takes it and goes back one level.

    var pick = { spec: null };

    function openPicker(spec) {
        pick.spec = spec;
        UI.show('pick');
    }

    function choose(o) {
        var spec = pick.spec;
        UI.back();
        if (o.run) o.run();
        else spec.choose(o.value);
        redraw();
    }

    function pickRows() {
        var spec = pick.spec;
        return spec.options.map(function (o) {
            var preview = null;
            if (spec.previewKey) {
                preview = {};
                preview[spec.previewKey] = o.value;
            }
            return {
                key: String(o.value), label: o.label, kind: 'check', checked: o.value === spec.current,
                font: o.font, text: o.text, value: o.note, preview: preview, option: o,
                run: function () { choose(o); }
            };
        });
    }

    // A row that shows the current value and opens its list.
    // def: { label, icon, color, text, options, get(), set(value), previewKey, styleKey, foot, listText }
    function choiceRow(def) {
        var current = def.get();
        var chosen = def.options.find(function (o) { return o.value === current; });
        return {
            label: def.label, icon: def.icon, color: def.color, text: def.text, kind: 'nav',
            value: def.shown ? def.shown() : chosen ? chosen.label : '',
            run: function () {
                openPicker({
                    title: def.label, crumb: val(pages[UI.current()].title), icon: def.icon, color: def.color,
                    text: def.listText || def.text, foot: def.foot, options: def.options, current: current,
                    choose: def.set, previewKey: def.previewKey, styleKey: def.styleKey
                });
            }
        };
    }

    function options(list, labelKey) {
        return list.map(function (o) { return { value: o.key, label: o[labelKey || 'label'] }; });
    }

    // ---------- Live preview of Home (Darstellung and its lists)
    // A small model of Home drawn at 1920x1080 and scaled down once (a static transform): clock, date,
    // appointments, favourites and the next row. Not the real Home: that would mean a second copy of
    // every tile and the clock ticking twice. Values come from the settings, overridden by the option
    // that has focus in a list, so nothing is saved until OK.

    var Preview = (function () {
        var root = null;
        var parts = {};
        var SAMPLE = [['Heute 19:00', 'Termin'], ['Morgen 10:00', 'Termin'], ['Mittwoch 08:30', 'Termin']];

        function build() {
            root = el('div', 'pv');
            var screen = root.appendChild(el('div', 'pv-screen'));
            ['bg', 'dim', 'glow', 'agenda', 'clock', 'gear', 'shelf', 'more'].forEach(function (n) {
                parts[n] = screen.appendChild(el('div', 'pv-' + n));
            });
            parts.time = parts.clock.appendChild(el('div', 'pv-time'));
            parts.tm = parts.time.appendChild(el('span', ''));
            parts.sfx = parts.time.appendChild(el('span', 'pv-sfx'));
            parts.date = parts.clock.appendChild(el('div', 'pv-date'));
            parts.gear.innerHTML = $('gear').innerHTML;
            parts.more.appendChild(el('div', 'pv-h', 'Weitere Apps'));
            parts.row = parts.more.appendChild(el('div', 'pv-row'));
        }

        // Tiles and wallpaper, once per page shown: they do not change while a list has focus.
        function fill() {
            if (!root) build();
            var items = Home.homeItems();
            var listed = {};
            items.forEach(function (i) { listed[i.id] = true; });
            var rest = items.slice(5).concat(Home.otherApps().filter(function (i) { return !listed[i.id]; }));
            parts.shelf.innerHTML = '';
            items.slice(0, 5).forEach(function (item, i) {
                var t = Home.previewTile(item);
                if (i === 0) t.classList.add('pv-focus');
                parts.shelf.appendChild(t);
            });
            parts.row.innerHTML = '';
            rest.slice(0, 5).forEach(function (item) { parts.row.appendChild(Home.previewTile(item)); });
            parts.more.classList.toggle('hidden', !rest.length);
            parts.bg.style.backgroundImage = $('bg').style.backgroundImage;
        }

        function pad(n) { return (n < 10 ? '0' : '') + n; }

        function agenda(o, now) {
            var layout = o.homeLayout === 'column' ? { max: 2, larger: 1 } : { max: 3, larger: 2 };
            var max = o.textSize === 'larger' ? layout.larger : layout.max;
            var rows = [];
            if (window.Calendar) {
                Calendar.next(now, max).forEach(function (it) {
                    var p = Calendar.parts(it, now);
                    rows.push([p.when, p.what]);
                });
            }
            // No appointments: neutral lines, so the font and size still show.
            if (!rows.length) rows = SAMPLE.slice(0, max);
            parts.agenda.innerHTML = '';
            rows.forEach(function (r) {
                parts.agenda.appendChild(el('span', 'when', r[0]));
                parts.agenda.appendChild(el('span', 'what', r[1]));
            });
        }

        function render(overrides) {
            var o = {};
            var a = Prefs.get().appearance;
            Object.keys(a).forEach(function (k) { o[k] = a[k]; });
            Object.keys(overrides || {}).forEach(function (k) { o[k] = overrides[k]; });
            var now = new Date();
            root.style.fontFamily = Appearance.fontStack(o.font);
            root.style.setProperty('--ts', Appearance.textScale(o.textSize));
            root.classList.toggle('layout-column', o.homeLayout === 'column');
            root.classList.toggle('names-focused', o.names === 'focused');
            root.classList.toggle('names-never', o.names === 'never');
            root.classList.toggle('no-date', !o.showDate);
            // From the time, not from the saved mode: focusing "Automatisch" while "Aus" is saved shows the night.
            root.classList.toggle('pv-night', o.night === 'auto' && Appearance.darkOutside(now));
            root.classList.toggle('glow', (o.iconStyle || 'ordiscale') === 'ordiscale');
            if (o.clock === '12h') {
                parts.tm.textContent = (now.getHours() % 12 || 12) + ':' + pad(now.getMinutes());
                parts.sfx.textContent = now.getHours() < 12 ? 'AM' : 'PM';
            } else {
                parts.tm.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
                parts.sfx.textContent = '';
            }
            parts.date.textContent = Appearance.date(now, o.locale);
            agenda(o, now);
        }

        return {
            fill: fill,
            show: function (art, overrides) {
                if (!root) build();
                if (root.parentNode !== art) {
                    art.innerHTML = '';
                    art.appendChild(root);
                }
                render(overrides);
            }
        };
    })();

    // ---------- Samsung's home screen (TV settings)

    var opening = false;
    function openSamsungHome() {
        if (opening) return;
        opening = true;
        DevLog.log('Open Samsung Home');
        Apps.launch(SAMSUNG_HOME).catch(function (err) {
            DevLog.log('Samsung Home failed: ' + DevLog.errorText(err));
            UI.toast('Samsung Home ließ sich nicht öffnen: ' + DevLog.errorText(err));
        }).then(function () { opening = false; });
    }

    // ---------- Kalender: calendars set up on the TV, plus the switches for Home.
    // A link is long, so it is pasted rather than typed: the SmartThings app on a phone has a
    // keyboard for the TV that takes the clipboard. Links stay in the TV's settings and are shown
    // only by their host, never whole.

    function calendarPrefs() {
        return Prefs.get().calendar;
    }

    function calendarsChanged(key) {
        Prefs.save();
        if (key) Calendar.forget(key);
        Calendar.refresh(true);
        Home.updateClock();
        redraw();
    }

    function validLink(url) {
        return /^(https|webcal):\/\/[^\s]+$/i.test(url);
    }

    function askLink(current, done) {
        UI.toast('Link am Handy kopieren, dann über die Tastatur der SmartThings-App einfügen');
        rename(current, function (url) {
            if (!validLink(url)) {
                UI.toast('Bitte einen Link mit https:// oder webcal:// einfügen');
                return;
            }
            done(url);
        }, 'Kalender-Link (iCal)', 2000);
    }

    // done: optional, called after the calendar is saved (the first-run assistant redraws its step).
    function addCalendar(done) {
        rename('', function (name) {
            askLink('', function (url) {
                calendarPrefs().list.push({ id: String(Date.now()), name: name, url: url });
                calendarsChanged();
                UI.toast(name + ' hinzugefügt');
                if (typeof done === 'function') done();
            });
        }, 'Name des Kalenders');
    }

    // Calendars installed from the Mac: renamed and removed on the TV as well. The link itself
    // stays in the Mac's Keychain, so "Entfernen" hides it here and can be undone.
    function macCalendarMenu(c) {
        var mac = calendarPrefs().mac;
        // Own properties only: a calendar named "constructor" must not reach Object.prototype.
        function entry() {
            if (!Object.prototype.hasOwnProperty.call(mac, c.macName) || typeof mac[c.macName] !== 'object') mac[c.macName] = {};
            return mac[c.macName];
        }
        UI.menu(c.name, [
            {
                label: 'Umbenennen', run: function () {
                    rename(c.name, function (name) { entry().name = name; calendarsChanged(); }, 'Name des Kalenders');
                }
            },
            {
                label: 'Entfernen', run: function () {
                    UI.menu(c.name + ' entfernen?', [
                        { label: 'Entfernen', run: function () { entry().hidden = true; calendarsChanged(c.key); } },
                        { label: 'Abbrechen' }
                    ]);
                }
            },
            { label: 'Abbrechen' }
        ]);
    }

    function calendarMenu(c) {
        if (!c.onTv) {
            macCalendarMenu(c);
            return;
        }
        var list = calendarPrefs().list;
        function index() { return list.findIndex(function (x) { return x.id === c.id; }); }
        UI.menu(c.name, [
            {
                label: 'Umbenennen', run: function () {
                    rename(c.name, function (name) {
                        var i = index();
                        if (i >= 0) list[i].name = name;
                        calendarsChanged();
                    }, 'Name des Kalenders');
                }
            },
            {
                label: 'Link ändern', run: function () {
                    askLink('', function (url) {
                        var i = index();
                        if (i >= 0) list[i].url = url;
                        calendarsChanged(c.key);
                    });
                }
            },
            {
                label: 'Entfernen', run: function () {
                    UI.menu(c.name + ' entfernen?', [
                        {
                            label: 'Entfernen', run: function () {
                                var i = index();
                                if (i >= 0) list.splice(i, 1);
                                calendarsChanged(c.key);
                            }
                        },
                        { label: 'Abbrechen' }
                    ]);
                }
            },
            { label: 'Abbrechen' }
        ]);
    }

    function calendarGroups() {
        var p = calendarPrefs();
        var rows = Calendar.list().map(function (c) {
            return {
                key: 'cal:' + c.key, label: c.name, icon: 'calendar', color: 'c-red', kind: 'nav',
                value: c.state + ' · ' + c.host + (c.onTv ? '' : ' (vom Mac)'),
                run: function () { calendarMenu(c); }
            };
        });
        Calendar.hiddenMac().forEach(function (name) {
            rows.push({
                key: 'hidden:' + name, label: name, icon: 'calendar', color: 'c-gray', kind: 'action',
                value: 'entfernt · wiederherstellen',
                run: function () {
                    calendarPrefs().mac[name].hidden = false;
                    calendarsChanged();
                }
            });
        });
        rows.push({
            label: 'Kalender hinzufügen', icon: 'plus', color: 'c-green', kind: 'action',
            text: 'Erst einen Namen, dann den iCal-Link: am Handy kopieren und über die Tastatur der SmartThings-App einfügen.',
            run: addCalendar
        });
        return [
            {
                head: 'Startseite', rows: [
                    toggleRow({
                        label: 'Termine auf Home', icon: 'calendar-check', color: 'c-red', on: p.enabled,
                        text: 'Die nächsten Termine stehen oben links auf der Startseite und im Bildschirmschoner.',
                        flip: function () { p.enabled = !p.enabled; calendarsChanged(); }
                    }),
                    toggleRow({
                        label: 'Titel anzeigen', icon: 'eye', color: 'c-blue', on: p.titles,
                        text: 'Aus: statt des Titels steht nur „Termin“ da, etwa wenn Gäste im Raum sind.',
                        flip: function () { p.titles = !p.titles; calendarsChanged(); }
                    })
                ]
            },
            { head: 'Kalender', rows: rows, foot: 'Links bleiben auf dem TV; angezeigt wird nur der Server.' }
        ];
    }

    // ---------- Feiertage and Home Assistant (System)

    function holidayPicker() {
        var current = Holidays.state() || '';
        var opts = Holidays.states.map(function (s) { return { value: s.key, label: s.label }; });
        opts.push({ value: '', label: 'Nur bundesweite Feiertage' });
        openPicker({
            title: 'Feiertage', crumb: 'Einstellungen', icon: 'flag', color: 'c-orange',
            text: 'Bundesland für den nächsten gesetzlichen Feiertag unter dem Datum. Berechnet auf dem TV, ohne Internetdienst.',
            options: opts, current: current,
            choose: function (code) {
                Holidays.setState(code || null);
                Home.updateClock();
            }
        });
    }

    // Host and port only. The path and query of an address can carry a secret (a token in a link).
    function haHost(url) {
        var m = /^https?:\/\/(?:[^@\/?#]*@)?([^\/?#]+)/i.exec(url || '');
        return m ? m[1] : '';
    }

    function haConfigured() {
        var ha = Prefs.get().homeAssistant;
        return !!(ha && ha.url);
    }

    var HA_PORT = 8123;     // Home Assistant's own port, for a bare local address

    // In the home network: private IPv4 ranges, localhost, names without a dot or with a local suffix.
    function localHost(host) {
        // [fd00::1], [fe80::…], [::1]: unique-local, link-local and loopback IPv6
        if (host.charAt(0) === '[') return /^\[(f[cd]|fe[89ab]|::1\])/i.test(host);
        var ip = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
        if (ip) {
            var a = +ip[1], b = +ip[2];
            return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) ||
                (a === 169 && b === 254);
        }
        return host === 'localhost' || host.indexOf('.') < 0 || /\.(local|lan|home\.arpa|fritz\.box)$/i.test(host);
    }

    // Typing "192.168.193.225:8123" is enough: a local address gets http:// (and port 8123 when none is
    // given), anything else https://, as a Cloudflare address needs. A typed scheme is kept.
    // Returns the full address, or null when it is not one.
    function haUrl(input) {
        var text = String(input || '').trim().replace(/\/+$/, '');
        // With its own scheme the address is taken as typed, as before.
        if (/^https?:\/\//i.test(text)) return /^https?:\/\/[^\s\/?#]+[^\s]*$/i.test(text) ? text : null;
        var m = /^([a-z0-9.-]+|\[[0-9a-f:.]+\])(?::(\d{1,5}))?([\/?#][^\s]*)?$/i.exec(text);
        if (!m || !/[a-z0-9\]]$/i.test(m[1]) || (m[2] && (+m[2] < 1 || +m[2] > 65535))) return null;
        var host = m[1].toLowerCase();
        var local = localHost(host);
        var port = m[2] || (local ? String(HA_PORT) : '');
        return (local ? 'http' : 'https') + '://' + host + (port ? ':' + port : '') + (m[3] || '');
    }

    // Typed with the remote; the current address is not put into the field, so it never shows in full.
    // A sign-in already stored stays with the new address (the same Home Assistant, e.g. by IP or by
    // its Cloudflare name).
    function askHomeAssistant(done) {
        UI.toast('IP-Adresse mit Port, z. B. 192.168.193.225:8123');
        rename('', function (typed) {
            var url = haUrl(typed);
            if (!url) {
                UI.toast('Bitte eine Adresse wie 192.168.193.225:8123 eingeben');
                return;
            }
            var old = Prefs.get().homeAssistant || {};
            var ha = { url: url.replace(/\/+$/, '') };
            ['token', 'refresh', 'client', 'user', 'auth', 'expired'].forEach(function (k) {
                if (old[k]) ha[k] = old[k];
            });
            Prefs.get().homeAssistant = ha;
            haChanged();
            UI.toast('Home Assistant: ' + haHost(url));
            if (typeof done === 'function') done();
        }, 'Home Assistant-Adresse', 200);
    }

    // After any change to address or sign-in: save, start the connection over, show or hide the tile.
    // fresh: the access token a sign-in just brought (js/homeassistant.js reset).
    function haChanged(fresh) {
        Prefs.save();
        haCheck = '';
        HA.reset(fresh);
        Home.render();
    }

    function haToken() {
        return HA.method() === 'token';
    }

    function noop() {}

    // Forgets the sign-in by pairing or by user name and password on the TV (not in Home Assistant:
    // see haSignOut).
    function clearLogin(ha) {
        delete ha.refresh;
        delete ha.client;
        delete ha.user;
        delete ha.expired;
        if (ha.auth === 'login' || ha.auth === 'pair') delete ha.auth;
    }

    // The text dialog as a promise; rejects with { code: 'cancelled' } on Abbrechen or Zurück.
    function ask(title, maxLength, secret) {
        return new Promise(function (resolve, reject) {
            rename('', resolve, title, maxLength, secret, function () { reject({ code: 'cancelled' }); });
        });
    }

    /*
     * The long-lived token, pasted from the phone through the SmartThings app's keyboard. The field
     * starts empty (the stored token is never shown) and masks what is pasted. Stored on the TV only
     * (Prefs.homeAssistant.token); the log and the export never contain it (redacted below).
     * It replaces a sign-in with user name and password, which is signed out in Home Assistant.
     */
    function askToken(done) {
        UI.menu('In Home Assistant: Profil → Sicherheit → Langzeit-Zugangstoken erstellen. Am besten für einen eigenen TV-Benutzer ohne Admin-Rechte.', [
            { label: 'Token einfügen', run: function () { pasteToken(done); } },
            { label: 'Abbrechen' }
        ]);
    }

    function pasteToken(done) {
        UI.toast('Token am Handy kopieren, dann über die Tastatur der SmartThings-App einfügen');
        rename('', function (typed) {
            // A pasted token can pick up line breaks or spaces; a real one has none.
            var token = typed.replace(/\s+/g, '');
            if (token.length < 20 || !/^[\x21-\x7e]+$/.test(token)) {
                UI.toast('Das sieht nicht nach einem Token aus');
                return;
            }
            var ha = Prefs.get().homeAssistant;
            var oldRefresh = ha.refresh;
            var base = HA.base();
            nextAuthOp();
            clearLogin(ha);
            ha.token = token;
            ha.auth = 'token';
            haChanged();
            if (oldRefresh) HAAuth.revoke(base, oldRefresh).catch(noop);
            UI.toast('Zugangsschlüssel gespeichert');
            if (typeof done === 'function') done();
        }, 'Langzeit-Token aus deinem Home-Assistant-Profil', 512, true);
    }

    // What the sign-in asks on the way (js/ha-auth.js signIn): a second factor's code, or which one.
    function askSignInStep(q) {
        if (q.kind === 'module') {
            return new Promise(function (resolve, reject) {
                var options = (q.options || []).map(function (o) {
                    var id = Array.isArray(o) ? o[0] : o;
                    var name = Array.isArray(o) ? o[1] : o;
                    return { label: String(name), run: function () { resolve(id); } };
                });
                options.push({ label: 'Abbrechen', run: function () { reject({ code: 'cancelled' }); } });
                UI.menu('Zweiter Faktor', options);
            });
        }
        UI.toast(q.retry ? 'Code falsch – bitte den aktuellen Code eingeben' : 'Zweiter Faktor: aktuellen Code eingeben' + (q.module ? ' (' + q.module + ')' : ''));
        return ask('Code (Zwei-Faktor-Anmeldung)', 12).then(function (code) { return code.replace(/\s+/g, ''); });
    }

    function signInError(err, done) {
        var code = err && err.code;
        if (code === 'cancelled') return;
        if (code === 'blocked') {
            // Fetch failed while the WebSocket answers: the sign-in page refused this app (CORS).
            UI.menu('Anmeldung vom TV aus nicht möglich: Home Assistant lässt die Anmeldeseite für diese App nicht zu. Bitte den Token-Weg nutzen.', [
                { label: 'Token einfügen', run: function () { pasteToken(done); } },
                { label: 'Schließen' }
            ]);
            return;
        }
        UI.toast({
            invalid_auth: 'Benutzername oder Passwort falsch',
            unreachable: 'Home Assistant nicht erreichbar – Adresse und Netz prüfen',
            no_provider: 'Anmeldung mit Passwort ist in diesem Home Assistant nicht aktiv – bitte Token nutzen',
            flow_gone: 'Anmeldung abgelaufen – bitte neu beginnen',
            too_slow: 'Zu lange gewartet – bitte neu anmelden',
            too_many: 'Zu viele falsche Codes – bitte neu anmelden',
            denied: 'Home Assistant hat die Anmeldung abgelehnt (Benutzer gesperrt oder nicht erlaubt)'
        }[code] || 'Anmeldung fehlgeschlagen (' + (err && err.status ? 'HTTP ' + err.status : code) + ')');
    }

    /*
     * Sign-in with user name and password: three text dialogs (name, masked password, a second
     * factor's code if the user has one), then "Verbinde …" and the result. Kept: the refresh token
     * (Prefs.homeAssistant.refresh) and the name; the password goes to Home Assistant once and the
     * dialog field is emptied right after. A token set up before is removed.
     */
    /*
     * Every sign-in, pairing, token and sign-out takes a new number. A sign-in or pairing that
     * answers late stores nothing when another step came after it (a sign-out above all), so a
     * confirmed sign-out cannot be undone by a reply that was still on its way.
     */
    var authOp = 0;

    function nextAuthOp() {
        authOp += 1;
        return authOp;
    }

    function askLogin(done) {
        var base = HA.base();
        if (!base) return;
        // From the first dialog on: a sign-in still running from before may not ask anything now.
        var op = nextAuthOp();
        var username = '';
        UI.toast('Benutzername und Passwort deines Home-Assistant-Kontos');
        ask('Home Assistant: Benutzername', 64).then(function (name) {
            username = name;
            return ask('Passwort für ' + name, 128, true);
        }).then(function (password) {
            UI.toast('Melde an bei ' + haHost(Prefs.get().homeAssistant.url) + ' …');
            if (op !== authOp) throw { code: 'cancelled' };
            return HAAuth.signIn(base, username, password, function (q) {
                // A second factor's question from a sign-in that was overtaken is not shown.
                return op === authOp ? askSignInStep(q) : Promise.reject({ code: 'cancelled' });
            });
        }).then(function (r) {
            var ha = Prefs.get().homeAssistant;
            // Signed out, signed in otherwise or the address changed while it ran: not for this one.
            if (!ha || HA.base() !== base || op !== authOp) {
                HAAuth.revoke(base, r.refresh).catch(noop);
                return;
            }
            var oldRefresh = ha.refresh;
            delete ha.token;
            delete ha.expired;
            delete ha.client;   // a paired TV's client_id; the password sign-in has the default one
            ha.refresh = r.refresh;
            ha.user = username;
            ha.auth = 'login';
            haChanged(r);
            // A second sign-in replaces the first; the old session is closed in Home Assistant too.
            if (oldRefresh && oldRefresh !== r.refresh) HAAuth.revoke(base, oldRefresh).catch(noop);
            DevLog.log('Home Assistant: signed in with user name and password');
            if (typeof done === 'function') done();
            checkConnection();
        }).catch(function (err) {
            signInError(err, done);
        });
    }

    /*
     * Pairing with the phone (js/ha-pair.js): QR code and code on the TV, approval in Home Assistant.
     * The TV keeps the refresh token and the client_id it was issued to (Prefs.homeAssistant.refresh,
     * .client); a token or an earlier sign-in is removed (the sign-in also ended in Home Assistant).
     * origin: { done } after the view is left with Fertig, as for the other ways.
     */
    function askPair(done) {
        var base = HA.base();
        if (!base) return;
        var op = nextAuthOp();
        HAPair.open({
            base: base,
            host: haHost(Prefs.get().homeAssistant.url),
            apply: function (r) { return applyPair(base, r, op); },
            login: function () { askLogin(done); },
            token: function () { askToken(done); },
            address: function () { askHomeAssistant(done); },
            done: function () { if (typeof done === 'function') done(); }
        });
    }

    // Stores what the approval brought, then connects once: { status, text } for the view.
    function applyPair(base, r, op) {
        var ha = Prefs.get().homeAssistant;
        // The address changed or was removed, or the TV was signed in or out otherwise meanwhile:
        // the new access is not for this one, and Home Assistant forgets it again.
        if (!ha || HA.base() !== base || op !== authOp) {
            HAAuth.revoke(base, r.refresh).catch(noop);
            return Promise.resolve({ status: 'aus', text: ha && HA.base() === base ? 'Inzwischen anders angemeldet' : 'Adresse geändert' });
        }
        var oldRefresh = ha.refresh;
        delete ha.token;
        delete ha.expired;
        delete ha.user;     // read from Home Assistant once connected (auth/current_user)
        ha.refresh = r.refresh;
        ha.client = r.clientId;
        ha.auth = 'pair';
        haChanged(r.access ? { access: r.access, expiresIn: r.expiresIn } : null);
        if (oldRefresh && oldRefresh !== r.refresh) HAAuth.revoke(base, oldRefresh).catch(noop);
        DevLog.log('Home Assistant: paired with the phone');
        return HA.check().then(function (c) {
            haCheck = checkText(c);
            return { status: c.status === 'verbunden' && c.info.ready ? 'verbunden' : c.status, text: haCheck };
        });
    }

    // Signs the TV out in Home Assistant (revokes the refresh token), then forgets it here. When Home
    // Assistant cannot be asked, it is forgotten all the same and the viewer is told where to end it.
    function haSignOut(done) {
        var ha = Prefs.get().homeAssistant;
        var paired = HA.method() === 'pair';
        var refresh = ha.refresh;
        var base = HA.base();
        // Forgotten here at once, and every sign-in still on its way is void: a late answer of
        // either kind can neither bring this sign-in back nor clear one made after it.
        nextAuthOp();
        clearLogin(ha);
        haChanged();
        if (typeof done === 'function') done();
        UI.toast(paired ? 'Entkopple …' : 'Melde ab …');
        HAAuth.revoke(base, refresh).then(function () { return true; }, function () { return false; }).then(function (ok) {
            if (paired) UI.toast(ok ? 'Entkoppelt' : 'Auf dem TV entkoppelt; Home Assistant war nicht erreichbar – den Zugang dort unter Ordiscale TV → Konfigurieren widerrufen');
            else UI.toast(ok ? 'Abgemeldet' : 'Auf dem TV abgemeldet; Home Assistant war nicht erreichbar – die Sitzung dort unter Profil → Sicherheit löschen');
        });
    }

    var haCheck = '';   // result of the last "Verbindung prüfen", shown until something changes

    function checkText(r) {
        if (r.status === 'Token ungültig') return 'Token ungültig';
        if (r.status === 'Anmeldung abgelaufen') return 'Anmeldung abgelaufen';
        if (r.status !== 'verbunden' || !r.info.ready) return r.status === 'aus' ? 'nicht verbunden' : 'nicht erreichbar';
        if (!r.info.count && !r.info.labelsReadable) return 'verbunden · Label „TV“ nicht lesbar';
        return 'verbunden · ' + r.info.count + (r.info.count === 1 ? ' Gerät' : ' Geräte') + ' ausgewählt';
    }

    function checkConnection() {
        UI.toast('Verbinde mit ' + haHost(Prefs.get().homeAssistant.url) + ' …');
        HA.check().then(function (r) {
            haCheck = checkText(r);
            UI.toast(haCheck);
            // The result shows as the row's value, unless the viewer moved on.
            if (UI.isVisible('ha-settings')) redraw();
        });
    }

    // How the TV is signed in, for the export and the log: never a key, only whether there is one.
    function haSignInText(ha) {
        var how = HA.methodOf(ha);
        if (how === 'pair') return 'gekoppelt als ' + (ha.user || 'unbekannt');
        if (how === 'login') return 'angemeldet als ' + (ha.user || 'unbekannt');
        if (how === 'token') return 'Token hinterlegt';
        return ha && ha.expired ? 'Anmeldung abgelaufen' : 'fehlt';
    }

    function haGroups() {
        var on = haConfigured();
        var ha = Prefs.get().homeAssistant;
        var how = HA.method();
        var conn = [{
            label: 'Adresse', icon: 'server', color: 'c-blue', kind: 'nav',
            value: on ? haHost(ha.url) : 'Nicht eingerichtet',
            text: 'IP-Adresse mit Port, z. B. 192.168.193.225:8123, oder deine Cloudflare-Adresse. Angezeigt wird nur der Server.',
            run: function () { askHomeAssistant(redraw); }
        }];
        if (on && how) {
            conn.push({
                label: 'Verbindung prüfen', icon: 'plug-zap', color: 'c-green', kind: 'action', value: haCheck,
                text: 'Verbindet sich einmal und zählt die ausgewählten Geräte (Label „TV“ und einbezogene Integrationen).',
                run: checkConnection
            });
        }
        var login = [];
        if (on) {
            var viaRefresh = how === 'login' || how === 'pair';
            var refused = viaRefresh && HA.status() === 'Anmeldung abgelaufen';
            var lapsed = !!(ha.expired && !how);
            if (viaRefresh) {
                login.push({
                    label: (how === 'pair' ? 'Gekoppelt als ' : 'Angemeldet als ') + (ha.user || 'Home-Assistant-Benutzer'),
                    icon: 'circle-user-round', color: 'c-teal',
                    kind: refused ? 'nav' : 'info', value: refused ? 'abgelehnt' : '', warn: refused,
                    text: refused
                        ? 'Home Assistant nimmt den Zugang nicht mehr an. OK koppelt neu.'
                        : how === 'pair'
                            ? 'Auf dem TV liegt nur ein Zugangsschlüssel. Widerrufen lässt er sich in Home Assistant unter Ordiscale TV → Konfigurieren.'
                            : 'Auf dem TV liegt nur ein Anmeldeschlüssel, nie das Passwort. In Home Assistant steht die Sitzung unter Profil → Sicherheit als ' + HAAuth.CLIENT_ID,
                    run: refused ? function () { askPair(redraw); } : null
                });
            }
            var replaces = how === 'token' ? ' Der Token wird dabei vom TV entfernt.' : viaRefresh ? ' Der bisherige Zugang wird dabei beendet.' : '';
            login.push({
                label: 'Mit dem Handy koppeln', icon: 'smartphone', color: 'c-teal', kind: 'nav',
                value: lapsed ? 'Anmeldung abgelaufen' : how === 'pair' ? '' : 'Empfohlen', warn: lapsed,
                text: (lapsed ? 'Home Assistant nimmt die letzte Anmeldung nicht mehr an. ' : '') +
                    'QR-Code mit dem Handy scannen, den Code vom TV eingeben und freigeben. Braucht die Integration „Ordiscale TV“ in Home Assistant.' + replaces,
                run: function () { askPair(redraw); }
            });
            login.push({
                label: 'Mit Benutzername und Passwort', icon: 'log-in', color: 'c-green', kind: 'nav',
                text: 'Mit deinem Home-Assistant-Konto anmelden. Auf dem TV bleibt nur ein Anmeldeschlüssel, nie das Passwort.' +
                    (how === 'token' ? ' Der Token wird dabei entfernt.' : viaRefresh ? ' Der bisherige Zugang wird dabei beendet.' : ''),
                run: function () { askLogin(redraw); }
            });
            login.push({
                label: how === 'token' ? 'Zugangsschlüssel (Token)' : 'Token einfügen', icon: 'key-round', color: 'c-orange',
                kind: 'nav', value: how === 'token' ? 'hinterlegt' : '',
                text: 'Langzeit-Token aus deinem Home-Assistant-Profil. Er bleibt auf dem TV und erscheint nirgends.' +
                    (viaRefresh ? ' Der bisherige Zugang wird dabei beendet.' : ''),
                run: function () { askToken(redraw); }
            });
            if (viaRefresh) {
                login.push({
                    label: how === 'pair' ? 'Entkoppeln' : 'Abmelden', icon: 'log-out', color: 'c-red', kind: 'action', danger: true,
                    text: how === 'pair'
                        ? 'Widerruft den Zugang dieses TV in Home Assistant und löscht ihn hier.'
                        : 'Meldet den TV bei Home Assistant ab und löscht den Anmeldeschlüssel.',
                    run: function () { haSignOut(redraw); }
                });
            }
            if (how === 'token') {
                login.push({
                    label: 'Token entfernen', icon: 'trash-2', color: 'c-red', kind: 'action', danger: true,
                    text: 'Löscht den Token auf dem TV. In Home Assistant bleibt er gültig, bis du ihn dort löschst.',
                    run: function () {
                        delete Prefs.get().homeAssistant.token;
                        delete Prefs.get().homeAssistant.auth;
                        haChanged();
                        redraw();
                        UI.toast('Zugangsschlüssel entfernt');
                    }
                });
            }
        }
        var view = [];
        if (on && how) {
            var hv = Prefs.get().haView;
            var picked = hv.integrations.length;
            view.push({
                label: 'Integrationen einbeziehen', icon: 'layers-2', color: 'c-indigo', kind: 'nav',
                value: picked ? picked + ' gewählt' : 'Keine',
                text: 'Ganze Integrationen zeigen, z. B. UniFi Protect mit allen Kameras, ohne jedes Gerät mit dem Label „TV“ zu versehen. Diagnose-, Konfigurations- und ausgeblendete Entitäten bleiben weg.',
                run: openIntegrations
            });
            view.push(choiceRow({
                label: 'Kamera im Vollbild', icon: 'video', color: 'c-red',
                text: 'Flüssig: Live-Bild vom mittleren Kanal der Kamera, wenn er in Home Assistant aktiviert ist (UniFi Protect: „Medium Resolution Channel“). Höchste Auflösung: der beste Kanal, kann auf dem TV ruckeln.',
                options: [{ value: 'smooth', label: 'Flüssig (Standard)' }, { value: 'max', label: 'Höchste Auflösung' }],
                get: function () { return hv.fullCamera; },
                set: function (v) {
                    hv.fullCamera = v;
                    Prefs.save();
                }
            }));
            view.push(toggleRow({
                label: 'Beim Start Sicherheit zeigen', icon: 'shield', color: 'c-teal', on: hv.startup,
                text: 'Der Launcher öffnet beim Start gleich „Sicherheit“, etwa für einen TV, der nur als Anzeige dient. Zurück führt zur Startseite.',
                flip: function () {
                    hv.startup = !hv.startup;
                    Prefs.save();
                }
            }));
        }
        var remove = [];
        if (on) {
            remove.push({
                label: 'Adresse entfernen', icon: 'trash-2', color: 'c-red', kind: 'action', danger: true,
                text: 'Entfernt Adresse und Anmeldung; die Kachel „Home Assistant“ verschwindet.',
                run: function () {
                    // The sign-in belongs to this address: it goes with it (and is ended in Home Assistant).
                    if (ha.refresh) HAAuth.revoke(HA.base(), ha.refresh).catch(noop);
                    nextAuthOp();
                    Prefs.get().homeAssistant = null;
                    haChanged();
                    redraw();
                    UI.toast('Home Assistant entfernt');
                }
            });
        }
        return [
            { head: 'Verbindung', rows: conn },
            { head: 'Anmeldung', rows: login, foot: 'Am besten ein eigener Home-Assistant-Benutzer ohne Admin-Rechte.' },
            { head: 'Sicherheit', rows: view, foot: 'Außerdem: Label „TV“ an einem Bereich, Gerät oder einer Entität in Home Assistant.' },
            { rows: remove }
        ];
    }

    // ---------- Home Assistant → Integrationen einbeziehen
    // The integrations (`platform` in the entity registry) with their main entities, as switches.
    // The list comes from the last connection; opening the page connects once to bring it up to date.

    var PLATFORM_NAMES = {
        unifiprotect: 'UniFi Protect', unifi_access: 'UniFi Access', unifi: 'UniFi Network', hue: 'Philips Hue',
        zha: 'Zigbee (ZHA)', mqtt: 'MQTT', shelly: 'Shelly', esphome: 'ESPHome', tasmota: 'Tasmota',
        homematicip_cloud: 'Homematic IP', homematic: 'Homematic', sonos: 'Sonos', cast: 'Google Cast',
        tado: 'tado°', netatmo: 'Netatmo', reolink: 'Reolink', ring: 'Ring', nuki: 'Nuki', fritz: 'FRITZ!Box',
        fritzbox: 'FRITZ!SmartHome', zwave_js: 'Z-Wave', matter: 'Matter', homekit_controller: 'HomeKit',
        template: 'Vorlagen', group: 'Gruppen', mobile_app: 'Mobile App', ordiscale_tv: 'Ordiscale TV',
        tibber: 'Tibber', bosch_shc: 'Bosch Smart Home', synology_dsm: 'Synology DSM', frigate: 'Frigate',
        homeassistant: 'Szenen', input_boolean: 'Helfer (Schalter)', script: 'Skripte', automation: 'Automationen',
        mock: 'Simulator'
    };

    function platformName(p) {
        return PLATFORM_NAMES[p] || p.split('_').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
    }

    var integrationsLoading = false;

    function openIntegrations() {
        UI.show('ha-integrations');
        if (!HA.configured()) return;
        integrationsLoading = !HA.platforms().length;
        if (integrationsLoading) redraw();
        HA.check().then(function () {
            integrationsLoading = false;
            if (UI.isVisible('ha-integrations')) redraw();
        });
    }

    function integrationGroups() {
        var hv = Prefs.get().haView;
        var list = HA.platforms();
        if (!list.length) {
            return [{
                rows: [{
                    label: integrationsLoading ? 'Lese Integrationen …' : 'Keine Integrationen gefunden', icon: 'layers-2', color: 'c-gray', kind: 'info',
                    text: integrationsLoading ? 'Der TV verbindet sich einmal mit Home Assistant.' : 'Home Assistant ist nicht erreichbar oder gibt die Geräteliste nicht heraus.'
                }]
            }];
        }
        var rows = list.map(function (x) {
            return toggleRow({
                key: 'int:' + x.platform, label: platformName(x.platform) + ' · ' + x.count,
                icon: 'layers-2', color: 'c-indigo', on: hv.integrations.indexOf(x.platform) >= 0,
                text: 'Alle ' + x.count + ' Hauptentitäten von „' + platformName(x.platform) + '“ zeigen (ohne Diagnose, Konfiguration, ausgeblendete und deaktivierte).',
                flip: function () {
                    var i = hv.integrations.indexOf(x.platform);
                    if (i >= 0) hv.integrations.splice(i, 1);
                    else hv.integrations.push(x.platform);
                    Prefs.save();
                    HA.reload();
                }
            });
        });
        return [{ head: 'Integrationen', rows: rows, foot: 'Zusätzlich zu allem mit dem Label „TV“. Anzahl = Hauptentitäten, die die Ansicht zeigen kann.' }];
    }

    // ---------- Wetter
    // Weather place by town name. Nothing leaves the TV before the viewer agrees: the name goes
    // to Open-Meteo's geocoding, the rounded coordinates to its forecast.
    // Where the weather flow was started: Settings, or the first-run assistant (js/setup.js), which
    // gets control back through `done` and whose view must still be the one showing.
    var SETTINGS_ORIGIN = {
        view: 'weather',
        done: function () { redraw(); }
    };

    function weatherGroups() {
        var on = Weather.configured();
        var warnings = {
            label: 'Unwetterwarnungen', icon: 'triangle-alert', color: 'c-orange',
            text: 'Amtliche Warnungen des Deutschen Wetterdienstes oben links. Beim Einschalten geht der Ort (ca. 1 km) einmalig an den DWD.'
        };
        if (on) {
            warnings.on = Warnings.enabled();
            // Turning them on sends the place to a second service: its own yes, as before.
            warnings.flip = function () {
                if (Warnings.enabled()) {
                    Warnings.setEnabled(false);
                    UI.toast('Unwetterwarnungen aus');
                } else {
                    askWarningsConsent(SETTINGS_ORIGIN);
                }
            };
            warnings = toggleRow(warnings);
        } else {
            warnings.kind = 'info';
            warnings.value = Warnings.summary();
        }
        var rows = [{
            label: 'Ort', icon: 'map-pin', color: 'c-blue', kind: 'nav',
            value: on ? Weather.placeName() : 'Nicht eingerichtet',
            text: 'Ortsname an Open-Meteo, der gerundete Ort (ca. 1 km) für die Vorhersage. Vorher wirst du gefragt.',
            run: function () { askWeatherConsent(); }
        }, warnings];
        var off = [];
        if (on) {
            off.push({
                label: 'Wetter ausschalten', icon: 'cloud-off', color: 'c-gray', kind: 'action', danger: true,
                text: 'Entfernt den Ort; Wetter, Sonnenzeiten und Warnungen verschwinden.',
                run: function () {
                    Weather.setPlace(null);
                    redraw();
                    UI.toast('Wetter ausgeschaltet');
                }
            });
        }
        return [{ head: 'Wetter', rows: rows, foot: 'Quelle der Warnungen: Deutscher Wetterdienst.' }, { rows: off }];
    }

    // Turning warnings on sends the place to a second service, so it gets its own yes.
    function askWarningsConsent(origin) {
        UI.menu('Ort (ca. 1 km) einmalig an den Deutschen Wetterdienst, danach nur die Kreiskennung', [
            {
                label: 'Freigeben', run: function () {
                    Warnings.setEnabled(true);
                    origin.done();
                    UI.toast('Unwetterwarnungen an');
                }
            },
            { label: 'Abbrechen' }
        ]);
    }

    function askWeatherConsent(origin) {
        origin = origin || SETTINGS_ORIGIN;
        UI.menu('Ortsname an Open-Meteo, Ort (ca. 1 km) an den Deutschen Wetterdienst', [
            { label: 'Freigeben und Ort eingeben', run: function () { askTown(origin); } },
            { label: 'Abbrechen' }
        ]);
    }

    function askTown(origin) {
        var p = Prefs.get().weather;
        rename((p && p.name) || '', function (value) {
            if (value.length < 2) {
                UI.toast('Bitte einen Ortsnamen eingeben');
                return;
            }
            var stamp = origin.stamp ? origin.stamp() : null;
            Weather.geocode(value).then(function (place) {
                // The viewer may have moved on while the lookup ran; do not open a menu over that.
                if (UI.current() !== origin.view || (origin.stamp && origin.stamp() !== stamp)) {
                    DevLog.log('Geocoding answer dropped: view changed');
                    return;
                }
                UI.menu(place.name + (place.region ? ' (' + place.region + ')' : '') + ' übernehmen?', [
                    {
                        label: 'Ja, übernehmen', run: function () {
                            Weather.setPlace(place);
                            // The question before the place named the DWD too, so this yes covers warnings.
                            Warnings.setEnabled(true);
                            origin.done();
                            UI.toast('Wetter für ' + place.name);
                        }
                    },
                    { label: 'Abbrechen' }
                ]);
            }, function (err) {
                DevLog.log('Geocoding failed: ' + DevLog.errorText(err));
                UI.toast(value + ' nicht gefunden');
            });
        }, 'Ort (Stadt oder Gemeinde)');
    }

    // ---------- Netzwerk: status only; changing Wi-Fi or Bluetooth is "TV-Einstellungen".

    function networkGroups() {
        var s = Network.status();
        var rows = [{ label: 'Verbindung', icon: s && s.type === 'ethernet' ? 'network' : 'wifi', color: 'c-blue', kind: 'info', value: Network.summary(s) }];
        if (s && s.type !== 'offline') {
            if (s.type === 'wifi' && s.level) rows.push({ label: 'Signal', icon: 'signal', color: 'c-green', kind: 'info', value: s.level + ' von 5' });
            if (s.ip) rows.push({ label: 'IP-Adresse', icon: 'network', color: 'c-gray', kind: 'info', value: s.ip });
            rows.push({ label: 'Router', icon: 'router', color: 'c-gray', kind: 'info', value: s.online ? 'erreichbar' : 'nicht erreichbar' });
        }
        return [{
            head: 'Status', rows: rows,
            foot: s ? 'WLAN und Bluetooth schaltest du in den TV-Einstellungen.' : 'Dieser TV meldet sein Netzwerk nicht an Apps.'
        }];
    }

    // ---------- Overview

    function wallpaperSummary() {
        var p = Prefs.get().wallpaper;
        if (p.mode === 'off') return 'Aus';
        if (p.mode === 'rotate') return 'Wechsel · ' + Wallpaper.interval(p.interval).label;
        var w = Wallpaper.find(p.photo);
        return w ? w.title : 'Foto';
    }

    function show(name) { return function () { UI.show(name); }; }

    function overviewGroups() {
        var a = Prefs.get().appearance;
        var cert = certStatus(new Date());
        return [
            // "Startseite" (what Home shows) and "System"; every function appears exactly once.
            {
                head: 'Startseite', rows: [
                    {
                        label: 'Apps & Favoriten', icon: 'layout-grid', color: 'c-blue', kind: 'nav',
                        value: Math.min(5, Home.homeItems().length) + ' Favoriten', run: show('homeapps'),
                        text: 'Welche Apps auf der Startseite stehen und in welcher Reihenfolge. Die ersten fünf bilden die Favoritenleiste.'
                    },
                    {
                        label: 'Konsolen & HDMI', icon: 'gamepad-2', color: 'c-indigo', kind: 'nav',
                        value: Home.homeInputs().length + ' verbunden', run: show('consoles'),
                        text: 'Namen und Logos für die HDMI-Anschlüsse, dazu die Kachel für Kabel, Satellit und Antenne.'
                    },
                    {
                        label: 'Hintergrund', icon: 'image', color: 'c-teal', kind: 'nav',
                        value: wallpaperSummary(), run: show('bg'),
                        text: 'Ein festes Foto, wechselnde Fotos oder ein ruhiger dunkler Hintergrund.'
                    },
                    {
                        label: 'Darstellung', icon: 'type', color: 'c-purple', kind: 'nav',
                        value: Appearance.font(a.font).label + ' · ' + Appearance.textSize(a.textSize).label, run: show('appearance'),
                        text: 'Schrift, Schriftgröße, Uhr, Symbolstil und wie die Startseite oben aussieht, mit Vorschau.'
                    },
                    {
                        label: 'Bildschirmschoner', icon: 'monitor-play', color: 'c-indigo', kind: 'nav',
                        value: screensaverSummary(), run: show('screensaver-settings'),
                        text: 'Wann er startet, wie oft das Foto wechselt, wann er abdunkelt und welcher Text unten links steht.'
                    },
                    {
                        label: 'Kalender', icon: 'calendar', color: 'c-red', kind: 'nav',
                        value: Calendar.summary(), run: show('calendars'),
                        text: 'Private Kalender per iCal-Link. Die nächsten Termine stehen oben links auf der Startseite.'
                    }
                ]
            },
            {
                head: 'System', rows: [
                    {
                        label: 'Wetter', icon: 'cloud-sun', color: 'c-blue', kind: 'nav',
                        value: Weather.configured() ? Weather.placeName() : 'Aus', run: show('weather'),
                        text: 'Ort für Wetter und Sonnenzeiten, dazu amtliche Unwetterwarnungen des Deutschen Wetterdienstes.'
                    },
                    {
                        label: 'Feiertage', icon: 'flag', color: 'c-orange', kind: 'nav',
                        value: Holidays.stateLabel(), run: holidayPicker,
                        text: 'Bundesland für den nächsten gesetzlichen Feiertag unter dem Datum.'
                    },
                    {
                        label: 'Home Assistant', icon: 'house', color: 'c-teal', kind: 'nav',
                        value: haConfigured() ? haHost(Prefs.get().homeAssistant.url) + (HA.hasAuth() ? '' : HA.loginExpired() ? ' · Anmeldung abgelaufen' : ' · nicht angemeldet') : 'Nicht eingerichtet',
                        warn: haConfigured() && HA.loginExpired(),
                        run: show('ha-settings'),
                        text: 'Verbindung zu deinem Home Assistant. Kameras, Türen und Geräte mit dem Label „TV“ oder aus einbezogenen Integrationen erscheinen in „Sicherheit“.'
                    },
                    {
                        label: 'Netzwerk', icon: 'wifi', color: 'c-blue', kind: 'nav',
                        value: Network.summary(Network.status()), run: show('network'),
                        text: 'Wie der TV verbunden ist. Nur zur Anzeige.'
                    },
                    {
                        label: 'Navigationston', icon: 'volume-2', color: 'c-pink', kind: 'nav',
                        value: soundSummary(), run: show('sound-settings'),
                        text: 'Ein leiser Klang bei jedem Schritt mit der Fernbedienung.'
                    },
                    {
                        label: 'TV-Einstellungen', icon: 'tv', color: 'c-gray', kind: 'external', run: openSamsungHome,
                        text: 'Öffnet LGs Startseite: von dort sind WLAN, Bluetooth, Bild und Ton einen Schritt entfernt. Auf der Startseite geht das auch mit 2 Sekunden Zurück.'
                    },
                    // The certificate warning is the only place the overview mentions it: a quiet amber
                    // value from 30 days before expiry, no pop-up.
                    {
                        label: 'Erweitert', icon: 'sliders-horizontal', color: 'c-gray', kind: 'nav',
                        value: cert.warn ? cert.overview : '', warn: cert.warn, run: show('advanced'),
                        text: 'App-Liste aktualisieren, Startzeiten, Installationszertifikat, Ersteinrichtung, Zurücksetzen und Lab.'
                    }
                ]
            }
        ];
    }

    // ---------- Darstellung

    function setAppearance(key, value) {
        Prefs.get().appearance[key] = value;
        if (key === 'font') Prefs.get().appearance.fontPicked = true;
        Prefs.save();
        Appearance.apply();
        Home.updateClock();
    }

    function appearanceRow(def) {
        def.get = function () { return Prefs.get().appearance[def.key]; };
        def.set = function (value) { setAppearance(def.key, value); };
        def.previewKey = def.key;
        return choiceRow(def);
    }

    function appearanceGroups() {
        var a = Prefs.get().appearance;
        return [
            {
                head: 'Startseite', rows: [
                    appearanceRow({
                        key: 'homeLayout', label: 'Uhr und Termine', icon: 'panels-top-left', color: 'c-indigo',
                        text: 'Uhr rechts mit den Terminen links daneben, oder Uhr, Datum und Termine in einer Spalte links.',
                        options: [{ value: 'standard', label: 'Uhr rechts' }, { value: 'column', label: 'Uhr links' }]
                    }),
                    appearanceRow({
                        key: 'names', label: 'App-Namen', icon: 'tag', color: 'c-gray',
                        text: 'Der Name unter den Kacheln: immer, nur unter der gewählten Kachel oder nie.',
                        options: [{ value: 'always', label: 'Immer' }, { value: 'focused', label: 'Bei Auswahl' }, { value: 'never', label: 'Nie' }]
                    }),
                    appearanceRow({
                        key: 'iconStyle', label: 'Symbolstil', icon: 'shapes', color: 'c-purple', styleKey: true,
                        text: 'Wie die Symbole in den Einstellungen aussehen. Ordiscale lässt die gewählte Kachel auf der Startseite leicht türkis leuchten.',
                        options: Appearance.ICON_STYLES.map(function (s) { return { value: s.key, label: s.label, text: s.text }; })
                    })
                ]
            },
            {
                head: 'Text', rows: [
                    appearanceRow({
                        key: 'font', label: 'Schrift', icon: 'type', color: 'c-blue',
                        text: 'Schrift der ganzen Oberfläche. Die Vorschau zeigt sie, sobald sie ausgewählt ist.',
                        foot: 'Barlow ist die Ordiscale-Hausschrift.',
                        options: Appearance.FONTS.map(function (f) { return { value: f.key, label: f.label, font: f.family }; })
                    }),
                    appearanceRow({
                        key: 'textSize', label: 'Schriftgröße', icon: 'a-large-small', color: 'c-blue',
                        text: 'Größere Schrift für Termine, Namen und Listen. Die Uhr bleibt gleich groß.',
                        options: options(Appearance.TEXT_SIZES)
                    })
                ]
            },
            {
                head: 'Uhr und Datum', rows: [
                    appearanceRow({
                        key: 'clock', label: 'Uhr', icon: 'clock-3', color: 'c-orange',
                        text: '24 Stunden oder 12 Stunden mit AM und PM.',
                        options: [{ value: '24h', label: '24 Std.' }, { value: '12h', label: '12 Std.' }]
                    }),
                    toggleRow({
                        label: 'Datum anzeigen', icon: 'calendar-days', color: 'c-red', on: a.showDate,
                        text: 'Das Datum unter der Uhr.',
                        flip: function () { setAppearance('showDate', !Prefs.get().appearance.showDate); }
                    }),
                    appearanceRow({
                        key: 'locale', label: 'Datumssprache', icon: 'languages', color: 'c-teal',
                        text: 'Sprache von Wochentag und Monat.',
                        options: options(Appearance.LOCALES)
                    })
                ]
            },
            {
                head: 'Nacht', rows: [
                    appearanceRow({
                        key: 'night', label: 'Nachtmodus', icon: 'moon-star', color: 'c-indigo',
                        text: 'Von Sonnenuntergang bis Sonnenaufgang wird der Hintergrund gedimmt, ohne Wetterort von 20 bis 7 Uhr.',
                        options: [{ value: 'auto', label: 'Automatisch' }, { value: 'off', label: 'Aus' }]
                    })
                ],
                foot: 'Nachts dunkelt auch der Bildschirmschoner früher ab.'
            }
        ];
    }

    // ---------- Navigationston

    function soundSummary() {
        var p = Prefs.get().sound;
        return p.enabled ? 'An · ' + Sound.presetLabel() : 'Aus';
    }

    function soundGroups() {
        var p = Prefs.get().sound;
        return [{
            head: 'Ton', rows: [
                toggleRow({
                    label: 'Navigationston', icon: 'volume-2', color: 'c-pink', on: p.enabled,
                    flip: function () {
                        p.enabled = !p.enabled;
                        Prefs.save();
                        if (p.enabled) Sound.preview();
                    }
                }),
                choiceRow({
                    label: 'Klang', icon: 'music-2', color: 'c-pink',
                    text: 'Wie der Schritt klingt. Nach der Wahl hörst du ihn einmal.',
                    options: options(Sound.presetOptions()),
                    get: function () { return p.preset; },
                    set: function (value) {
                        p.preset = value;
                        Prefs.save();
                        Sound.preview();
                    }
                }),
                { label: 'Gewählten Ton anhören', icon: 'play', color: 'c-green', kind: 'action', run: function () { Sound.preview(); } }
            ]
        }];
    }

    // ---------- Bildschirmschoner

    function screensaverSummary() {
        var p = Prefs.get().screensaver;
        return p.enabled ? 'Nach ' + Screensaver.delay().label : 'Aus';
    }

    function saverSet(key) {
        return function (value) {
            Prefs.get().screensaver[key] = value;
            Prefs.save();
            // Otherwise a countdown that began before the change could fire straight away.
            Screensaver.poke();
        };
    }

    function saverRow(def) {
        def.get = function () { return Prefs.get().screensaver[def.key]; };
        def.set = saverSet(def.key);
        return choiceRow(def);
    }

    // The text bottom left in the screen saver: brand, the photo's name, an own text, or none.
    function captionRow() {
        var p = Prefs.get().screensaver;
        return choiceRow({
            label: 'Text unten links', icon: 'text-quote', color: 'c-gray',
            text: 'Ordiscale, der Name des Bildes, ein eigener Text (bis 24 Zeichen) oder nichts.',
            shown: function () { return Screensaver.captionLabel(); },
            get: function () { return Screensaver.captionKind().key; },
            set: saverSet('caption'),
            options: Screensaver.CAPTIONS.map(function (c) {
                if (c.key !== 'custom') return { value: c.key, label: c.label };
                return {
                    value: c.key, label: 'Eigener Text…',
                    run: function () {
                        rename(p.captionText || '', function (value) {
                            p.caption = 'custom';
                            p.captionText = value.slice(0, Screensaver.CAPTION_MAX);
                            Prefs.save();
                            Screensaver.poke();
                            redraw();
                        }, 'Text im Bildschirmschoner', Screensaver.CAPTION_MAX);
                    }
                };
            })
        });
    }

    /*
     * "Foto wechseln alle" only means something while the Background is on Rotate: with a single
     * photo the screen saver holds it, exactly as Home does.
     */
    function screensaverGroups() {
        var p = Prefs.get().screensaver;
        var rows = [
            toggleRow({
                label: 'Bildschirmschoner', icon: 'monitor-play', color: 'c-indigo', on: p.enabled,
                flip: function () { saverSet('enabled')(!p.enabled); }
            }),
            saverRow({
                key: 'delay', label: 'Starten nach', icon: 'timer', color: 'c-orange',
                text: 'Wie lange nach der letzten Taste er startet.', options: options(Screensaver.DELAYS)
            })
        ];
        if (Prefs.get().wallpaper.mode === 'rotate') {
            rows.push(saverRow({
                key: 'photoEvery', label: 'Foto wechseln alle', icon: 'images', color: 'c-teal',
                text: 'Gilt, solange der Hintergrund auf „Wechsel“ steht.', options: options(Screensaver.PHOTO_EVERY)
            }));
        }
        rows.push(saverRow({
            key: 'dark', label: 'Abdunkeln nach', icon: 'moon', color: 'c-indigo',
            text: 'Danach wird das Bild schwarz, um den Bildschirm zu schonen.', options: options(Screensaver.DARK_AFTER)
        }));
        return [
            { head: 'Bildschirmschoner', rows: rows, foot: 'Nachts wird er nach spätestens 15 Minuten dunkel.' },
            { head: 'Anzeige', rows: [captionRow()] },
            { rows: [{ label: 'Jetzt anzeigen', icon: 'play', color: 'c-green', kind: 'action', run: function () { Screensaver.open(); } }] }
        ];
    }

    // ---------- Chips (Background)

    function chip(label, on, item) {
        var c = el('div', 'chip' + (on ? ' on' : ''), label);
        c._item = item;
        return c;
    }

    function chipRows(container) {
        var rows = [];
        UI.children(container).forEach(function (block) {
            if (block.classList.contains('hidden')) return;
            var chips = block.querySelector('.chips, .thumbs');
            if (!chips) return;
            if (chips.classList.contains('thumbs')) rows = rows.concat(UI.chunk(UI.children(chips), THUMB_COLS));
            else rows.push(UI.children(chips));
        });
        return rows;
    }

    // ---------- Background

    function renderBackground() {
        var p = Prefs.get().wallpaper;

        var modes = $('bg-mode');
        modes.innerHTML = '';
        [['off', 'Aus'], ['photo', 'Foto'], ['rotate', 'Wechsel']].forEach(function (m) {
            modes.appendChild(chip(m[1], p.mode === m[0], { kind: 'mode', key: m[0] }));
        });

        var intervals = $('bg-interval');
        intervals.innerHTML = '';
        Wallpaper.INTERVALS.forEach(function (i) {
            intervals.appendChild(chip(i.label, p.interval === i.key, { kind: 'interval', key: i.key }));
        });
        $('bg-interval-block').classList.toggle('hidden', p.mode !== 'rotate');

        var photos = $('bg-photos');
        photos.innerHTML = '';
        Wallpaper.list().forEach(function (w) {
            var t = el('div', 'thumb' + (p.photo === w.key ? ' on' : ''));
            var img = new Image();
            img.src = w.thumb;
            t.appendChild(img);
            t.appendChild(el('div', 'thumb-title', w.title));
            t._item = { kind: 'photo', key: w.key };
            photos.appendChild(t);
        });
        $('bg-photos-block').classList.toggle('hidden', p.mode !== 'photo');
    }

    function activateBackground(item) {
        var p = Prefs.get().wallpaper;
        if (item.kind === 'mode') {
            p.mode = item.key;
            if (item.key === 'rotate') p.lastChange = Date.now();
        } else if (item.kind === 'interval') {
            p.interval = item.key;
            p.lastChange = Date.now();
        } else if (item.kind === 'photo') {
            p.photo = item.key;
        }
        Prefs.save();
        Wallpaper.apply();
        renderBackground();
        UI.refresh();
    }

    // ---------- Apps on Home editor (two columns, custom navigation)

    var ed = { col: 0, idx: [0, 0], moving: -1, snapshot: null, items: [], others: [] };

    function edLoad() {
        ed.items = Home.homeItems().slice();
        var onHome = {};
        ed.items.forEach(function (i) { onHome[i.id] = true; });
        ed.others = Home.otherApps().filter(function (a) { return !onHome[a.id]; });
    }

    // The first FAVORITES entries form Home's favourites row; the star says which ones.
    // Icons are drawn SVG, never emoji or symbol characters.
    var STAR_ICON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8-4.3-4.1 5.9-.9z"/></svg>';
    var MOVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
        'stroke-linejoin="round"><path d="M7 9l5-5 5 5M7 15l5 5 5-5"/></svg>';

    function icon(cls, svg, label) {
        var span = el('span', cls);
        span.innerHTML = svg;
        span.setAttribute('aria-label', label);
        return span;
    }
    var FAVORITES = 5;

    function edRow(item, moving, favourite) {
        var row = el('div', 'ed-item' + (moving ? ' moving' : ''));
        row.appendChild(Home.miniTile(item));
        row.appendChild(el('span', 'ed-label', item.label));
        if (favourite && !moving) row.appendChild(icon('ed-fav', STAR_ICON, 'Favorit'));
        if (moving) row.appendChild(icon('ed-move', MOVE_ICON, 'Wird verschoben'));
        return row;
    }

    function edRender() {
        var home = $('ed-home');
        home.innerHTML = '';
        ed.items.forEach(function (item, i) { home.appendChild(edRow(item, i === ed.moving, i < FAVORITES)); });
        var other = $('ed-other');
        other.innerHTML = '';
        ed.others.forEach(function (item) { other.appendChild(edRow(item, false)); });
        $('ed-home-title').textContent = 'Reihenfolge · die ersten 5 sind Favoriten';
        $('ed-other-title').textContent = 'Apps hinzufügen · ' + ed.others.length;
        if (!ed.others.length) ed.col = 0;
    }

    function edFocusEl() {
        var list = [$('ed-home'), $('ed-other')][ed.col];
        if (!list.children.length) return null;
        ed.idx[ed.col] = UI.clamp(ed.idx[ed.col], 0, list.children.length - 1);
        return list.children[ed.idx[ed.col]];
    }

    function edSave() {
        Home.setHomeItems(ed.items);
        edLoad();
    }

    /*
     * Focus plus hints, but the hint bar is only rebuilt when its content would actually differ.
     * Arrowing through the list is the hot path on this screen and should not churn the DOM.
     */
    function edRefresh() {
        var sig = ed.col + '/' + (ed.moving >= 0);
        if (sig !== ed.hintSig) {
            ed.hintSig = sig;
            UI.refreshHints();
        }
        UI.refresh();
    }

    function edKey(k) {
        var moving = ed.moving >= 0;
        if (k === KEY.UP || k === KEY.DOWN) {
            var d = k === KEY.UP ? -1 : 1;
            if (moving) {
                var to = ed.moving + d;
                if (to < 0 || to >= ed.items.length) return true;
                var tmp = ed.items[to];
                ed.items[to] = ed.items[ed.moving];
                ed.items[ed.moving] = tmp;
                ed.moving = to;
                ed.idx[0] = to;
                edRender();
            } else {
                ed.idx[ed.col] += d;
            }
            edRefresh();
            return true;
        }
        if (k === KEY.LEFT || k === KEY.RIGHT) {
            if (!moving) {
                var col = k === KEY.LEFT ? 0 : 1;
                if ([$('ed-home'), $('ed-other')][col].children.length) ed.col = col;
                edRefresh();
            }
            return true;
        }
        if (k === KEY.ENTER) {
            if (ed.col === 0) {
                if (moving) {
                    ed.moving = -1;
                    ed.snapshot = null;
                    edSave();
                    edRender();
                } else {
                    edMenu();
                }
            } else if (ed.others.length) {
                var added = ed.others[ed.idx[1]];
                ed.items.push(added);
                edSave();
                edRender();
                UI.toast(added.label + ' zu Home hinzugefügt');
            }
            edRefresh();
            return true;
        }
        return false;
    }

    function edMenu() {
        var i = ed.idx[0];
        var item = ed.items[i];
        if (!item) return;
        UI.menu(item.label, [
            {
                label: 'Verschieben', run: function () {
                    ed.moving = i;
                    ed.snapshot = ed.items.slice();
                    edRender();
                    UI.refresh();
                }
            },
            {
                label: 'Von Home entfernen', run: function () {
                    if (ed.items.length <= 1) {
                        UI.toast('Home braucht mindestens eine App');
                        return;
                    }
                    ed.items.splice(i, 1);
                    edSave();
                    edRender();
                    UI.refresh();
                }
            },
            { label: 'Abbrechen' }
        ]);
    }

    function edBack() {
        if (ed.moving < 0) return false;
        ed.items = ed.snapshot;
        ed.moving = -1;
        ed.snapshot = null;
        edRender();
        UI.refresh();
        return true;
    }

    // ---------- Consoles

    function methodOf(input) {
        var key = input.method || window.LAUNCHER_CONFIG.inputMethod;
        return METHODS.find(function (m) { return m.key === key; }) || METHODS[0];
    }

    function logoOf(input) {
        return LOGOS.find(function (l) { return l.key === (input.brand || ''); }) || LOGOS[3];
    }

    function consoleGroups() {
        var tunerOn = Prefs.get().tuner.enabled !== false;
        var rows = Home.inputs().map(function (input, i) {
            return {
                key: 'input:' + i + ':' + input.label, label: input.label, kind: 'nav',
                value: input.hidden ? 'Ausgeblendet' : 'HDMI ' + input.hdmi + ' · ' + methodOf(input).label,
                mini: Home.miniInputTile(input),
                run: function () { consoleMenu(i); }
            };
        });
        rows.push({
            label: 'Konsole hinzufügen', icon: 'plus', color: 'c-green', kind: 'action',
            text: 'Legt einen Eintrag auf dem nächsten freien HDMI-Anschluss an; danach Name, Logo und Anschluss wählen.',
            run: addConsole
        });
        return [
            {
                head: 'Fernsehen', rows: [toggleRow({
                    label: 'Fernsehen-Kachel', icon: 'tv', color: 'c-blue', on: tunerOn,
                    text: 'Schaltet auf Kabel, Satellit oder Antenne. Unter den ersten fünf Apps ist sie Favorit, sonst die erste Konsolen-Kachel.',
                    flip: toggleTuner
                })],
                foot: tunerOn && !Home.tunerSupported() ? 'Der TV meldet keine TV-Quelle; die Kachel erscheint erst mit einer.' : ''
            },
            { head: 'HDMI-Geräte', rows: rows, foot: 'Auf der Startseite erscheinen nur angeschlossene Geräte.' }
        ];
    }

    function toggleTuner() {
        var p = Prefs.get().tuner;
        p.enabled = p.enabled === false;
        Prefs.save();
        Home.render();
    }

    function editInputs(change) {
        var list = Home.inputs().map(function (i) { return Object.assign({}, i); });
        change(list);
        Home.setInputs(list);
        redraw();
    }

    function consoleMenu(i) {
        var c = Home.inputs()[i];
        var count = Home.inputs().length;
        var status = Home.hdmiStatus();
        var options = [
            {
                label: 'Umbenennen', run: function () {
                    rename(c.label, function (name) { editInputs(function (l) { l[i].label = name; }); });
                }
            },
            {
                label: 'HDMI-Anschluss · HDMI ' + c.hdmi, run: function () {
                    UI.menu('HDMI-Anschluss', [1, 2, 3, 4].map(function (n) {
                        return {
                            label: 'HDMI ' + n + (status[n] ? ' · verbunden' : ''),
                            checked: n === c.hdmi,
                            run: function () { editInputs(function (l) { l[i].hdmi = n; }); }
                        };
                    }));
                }
            },
            {
                label: 'Logo · ' + logoOf(c).label, run: function () {
                    UI.menu('Logo', LOGOS.map(function (logo) {
                        return {
                            label: logo.label,
                            checked: logo.key === (c.brand || ''),
                            run: function () { editInputs(function (l) { l[i].brand = logo.key; }); }
                        };
                    }));
                }
            },
            {
                label: 'Öffnet · ' + methodOf(c).label, run: function () {
                    UI.menu('Öffnet', METHODS.map(function (m) {
                        return {
                            label: m.label + ' · ' + m.hint,
                            checked: m.key === methodOf(c).key,
                            run: function () { editInputs(function (l) { l[i].method = m.key; }); }
                        };
                    }));
                }
            },
            {
                label: c.hidden ? 'Auf Home zeigen' : 'Auf Home ausblenden',
                run: function () { editInputs(function (l) { l[i].hidden = !c.hidden; }); }
            }
        ];
        if (i > 0) {
            options.push({ label: 'Früher', run: function () { editInputs(function (l) { l.splice(i - 1, 0, l.splice(i, 1)[0]); }); } });
        }
        if (i < count - 1) {
            options.push({ label: 'Später', run: function () { editInputs(function (l) { l.splice(i + 1, 0, l.splice(i, 1)[0]); }); } });
        }
        options.push({
            label: 'Entfernen', run: function () {
                UI.menu(c.label + ' entfernen?', [
                    { label: 'Entfernen', run: function () { editInputs(function (l) { l.splice(i, 1); }); } },
                    { label: 'Abbrechen' }
                ]);
            }
        });
        options.push({ label: 'Abbrechen' });
        UI.menu(c.label, options);
    }

    function addConsole() {
        var used = {};
        Home.inputs().forEach(function (i) { used[i.hdmi] = true; });
        var port = [1, 2, 3, 4].find(function (n) { return !used[n]; }) || 1;
        editInputs(function (l) { l.push({ hdmi: port, label: 'Konsole', brand: '' }); });
        var index = Home.inputs().length - 1;
        rename('Konsole', function (name) { editInputs(function (l) { l[index].label = name; }); });
    }

    // ---------- Rename dialog (uses Samsung's on-screen keyboard)

    var renameDone = null;

    var renameOpen = false;

    // secret: the field shows dots instead of the text (a token or a password typed in front of the
    // room), and the text is taken as typed, without trimming. cancelled (optional): called when the
    // dialog closes without a value.
    var renameCancelled = null;
    var renameSecret = false;

    function rename(current, done, title, maxLength, secret, cancelled) {
        renameDone = done;
        renameCancelled = cancelled || null;
        renameSecret = !!secret;
        renameOpen = true;
        $('rename-title').textContent = title || 'Name';
        $('rename-input').maxLength = maxLength || 28;
        $('rename-input').classList.toggle('secret', !!secret);
        $('rename-input').value = current;
        UI.show('rename');
    }

    function closeRename(save) {
        var input = $('rename-input');
        var value = renameSecret ? input.value : input.value.trim();
        var done = renameDone;
        var cancelled = renameCancelled;
        renameDone = null;
        renameCancelled = null;
        renameOpen = false;     // before UI.back, which asks onBack again
        input.blur();
        UI.back();
        // A token or a password must not stay in the page longer than needed.
        input.value = '';
        if (save && value.trim() && done) done(value);
        else if (cancelled) cancelled();
    }

    // Settings for the log without secrets: calendar links and the Home Assistant address appear by
    // host only, the Home Assistant sign-in only as how and as whom (never a token or a password).
    function redacted(prefs) {
        var copy = JSON.parse(JSON.stringify(prefs));
        if (copy.homeAssistant) copy.homeAssistant = { host: haHost(copy.homeAssistant.url), anmeldung: haSignInText(copy.homeAssistant) };
        if (copy.calendar && copy.calendar.list) {
            copy.calendar.list = copy.calendar.list.map(function (c) { return { name: c.name, host: Calendar.host(c.url) }; });
        }
        return copy;
    }

    // ---------- Installation certificate
    // The Samsung certificate the app was signed with decides how long new versions can still be
    // installed (the installed app keeps running). Its last valid day comes from config.local.js.

    var CERT_WARN_DAYS = 30;
    var DAY_MS = 86400000;

    // now is passed in so the states can be checked with a shifted date.
    function certStatus(now) {
        var c = window.LAUNCHER_CONFIG.certificate;
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((c && c.expires) || '');
        if (!m) return { value: 'Ablaufdatum nicht hinterlegt', warn: false, lines: ['Das Ablaufdatum steht nicht in der Konfiguration (certificate.expires).'] };
        var date = m[3] + '.' + m[2] + '.' + m[1];
        var last = new Date(+m[1], +m[2] - 1, +m[3]);
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var days = Math.round((last - today) / DAY_MS);
        if (days < 0) {
            return {
                value: 'abgelaufen am ' + date, warn: true, overview: 'Zertifikat abgelaufen – bitte erneuern',
                lines: ['Zertifikat abgelaufen – neue Versionen lassen sich erst nach Erneuerung installieren']
            };
        }
        if (days <= CERT_WARN_DAYS) {
            var inDays = days === 0 ? 'heute' : days === 1 ? 'morgen' : 'in ' + days + ' Tagen';
            return {
                value: 'läuft ' + inDays + ' ab', warn: true, overview: 'Zertifikat läuft ' + inDays + ' ab',
                lines: ['Gültig bis ' + date, 'Danach lassen sich neue Versionen erst nach Erneuerung installieren']
            };
        }
        return { value: 'gültig bis ' + date, warn: false, lines: ['Gültig bis ' + date] };
    }

    function showCertificate() {
        var lines = certStatus(new Date()).lines.map(function (text) { return { label: text }; });
        lines.push({ label: 'Schließen' });
        UI.menu('Installationszertifikat', lines);
    }

    // ---------- Startzeiten der Apps (measurements: js/launchtimes.js)

    function plural(n, one, many) {
        return n + ' ' + (n === 1 ? one : many);
    }

    function launchSummaryText() {
        var st = LaunchTimes.stats();
        if (st.apps.length) return plural(st.apps.length, 'App', 'Apps') + ' gemessen';
        return st.launcher ? 'Nur der Launcher gemessen' : 'Noch keine Messung';
    }

    // The stage line: fastest and slowest app once there are two.
    function launchHeadline() {
        var apps = LaunchTimes.stats().apps;
        var sec = LaunchTimes.seconds;
        return apps.length > 1
            ? 'Schnellste: ' + apps[apps.length - 1].label + ' ' + sec(apps[apps.length - 1].median) + ' s. Langsamste: ' + apps[0].label + ' ' + sec(apps[0].median) + ' s.'
            : 'Median der letzten Messungen, langsamste App zuerst. Gemessen von OK bis der Launcher verdeckt ist.';
    }

    // Rows only carry text; they are focusable so the list scrolls with the remote.
    function launchGroups() {
        var st = LaunchTimes.stats();
        var sec = LaunchTimes.seconds;
        var apps = st.apps.map(function (a) {
            return { key: 'app:' + a.label, label: a.label, kind: 'info', value: sec(a.median) + ' s · ' + plural(a.count, 'Messung', 'Messungen') };
        });
        return [
            {
                head: 'Launcher', rows: [{
                    label: 'Launcher', icon: 'rocket', color: 'c-blue', kind: 'info',
                    value: st.launcher ? sec(st.launcher.median) + ' s (Median aus ' + plural(st.launcher.count, 'Start', 'Starts') + ')' : 'Noch keine Messung'
                }]
            },
            { head: 'Apps', rows: apps },
            { rows: [{ label: 'Messungen löschen', icon: 'trash-2', color: 'c-red', kind: 'action', danger: true, run: askClearLaunchTimes }] }
        ];
    }

    function askClearLaunchTimes() {
        if (!LaunchTimes.apps().length && !LaunchTimes.stats().launcher) {
            UI.toast('Es gibt noch keine Messungen');
            return;
        }
        UI.menu('Alle Messungen löschen?', [
            {
                label: 'Löschen', run: function () {
                    LaunchTimes.clear();
                    DevLog.log('Launch times cleared');
                    // The list is short again: without this it stays scrolled past its first rows.
                    resetScroll(pages.launchtimes);
                    redraw();
                    UI.toast('Messungen gelöscht');
                }
            },
            { label: 'Abbrechen' }
        ]);
    }

    // ---------- Advanced

    function advancedGroups() {
        var apps = [
            {
                label: 'App-Liste aktualisieren', icon: 'refresh-cw', color: 'c-blue', kind: 'action',
                text: 'Nach dem Installieren oder Löschen einer App: liest die Liste vom TV neu.',
                run: function () {
                    UI.toast('App-Liste wird aktualisiert …');
                    Home.reloadApps().then(function () { UI.toast('App-Liste aktualisiert'); });
                }
            },
            {
                label: 'Startzeiten der Apps', icon: 'timer', color: 'c-orange', kind: 'nav', value: launchSummaryText(),
                text: 'Wie lange der TV von OK bis zum Start jeder App braucht. Grundlage für jede Optimierung.',
                run: show('launchtimes')
            }
        ];
        var cert = certStatus(new Date());
        var install = [{
            label: 'Installationszertifikat', icon: 'shield-check', color: 'c-green', kind: 'nav', value: cert.value, warn: cert.warn,
            text: 'Bis zu diesem Tag lassen sich neue Versionen installieren; die installierte läuft weiter.',
            run: showCertificate
        }];
        if (window.LAUNCHER_CONFIG.devLogUrl) {
            install.push({
                label: 'Einstellungen exportieren', icon: 'upload', color: 'c-gray', kind: 'action', value: 'ans Mac-Log',
                text: 'Sendet die Einstellungen ans Mac-Log, ohne Kalender-Links und ohne Zugangsschlüssel.',
                run: function () {
                    DevLog.log('Settings export', redacted(Prefs.get()));
                    UI.toast('Einstellungen ans Mac-Log gesendet');
                }
            });
        }
        return [
            { head: 'Apps', rows: apps },
            { head: 'Installation', rows: install },
            {
                head: 'Neu beginnen', rows: [
                    {
                        label: 'Ersteinrichtung erneut starten', icon: 'wand-sparkles', color: 'c-purple', kind: 'action',
                        text: 'Fernsehen, Bundesland, Wetter, Kalender und Home Assistant, jeder Schritt überspringbar.',
                        run: function () { Setup.open(); }
                    },
                    {
                        label: 'Alle Einstellungen zurücksetzen', icon: 'rotate-ccw', color: 'c-red', kind: 'action', danger: true,
                        text: 'Alles zurück auf Standard, nach einer Rückfrage. Die Startzeiten bleiben.',
                        run: function () {
                            UI.menu('Alle Einstellungen zurücksetzen?', [
                                {
                                    label: 'Zurücksetzen', run: function () {
                                        Prefs.reset();
                                        location.reload();
                                    }
                                },
                                { label: 'Abbrechen' }
                            ]);
                        }
                    }
                ]
            },
            {
                head: 'Entwicklung', rows: [{
                    label: 'Lab', icon: 'flask-conical', color: 'c-gray', kind: 'nav', value: 'Entwicklertests',
                    text: 'Tests für den TV; die Ergebnisse gehen ins Log.', run: show('lab')
                }]
            }
        ];
    }

    // ---------- Registration

    function init() {
        // The signed-in name arrives after connecting, a refused sign-in at any time: the page shows both.
        HA.onUpdate(function (what) {
            if ((what === 'user' || (what === 'status' && HA.status() === 'Anmeldung abgelaufen')) && UI.isVisible('ha-settings')) redraw();
        });
        registerPage({
            name: 'settings', title: 'Einstellungen', icon: 'sliders-horizontal', groups: overviewGroups
        });
        registerPage({
            name: 'consoles', title: 'Konsolen & HDMI', crumb: 'Einstellungen', icon: 'gamepad-2', color: 'c-indigo',
            text: 'Name, Logo und Anschluss je Gerät; OK öffnet die Optionen.', groups: consoleGroups
        });
        registerPage({
            name: 'appearance', title: 'Darstellung', crumb: 'Einstellungen', icon: 'type', color: 'c-purple',
            preview: true, text: 'So sieht deine Startseite aus.', groups: appearanceGroups
        });
        registerPage({
            name: 'screensaver-settings', title: 'Bildschirmschoner', crumb: 'Einstellungen', icon: 'monitor-play', color: 'c-indigo',
            text: 'Fotos aus dem Hintergrund, mit Uhr, Wetter und den nächsten Terminen.', groups: screensaverGroups
        });
        registerPage({
            name: 'calendars', title: 'Kalender', crumb: 'Einstellungen', icon: 'calendar', color: 'c-red',
            text: 'Private Kalender per iCal-Link. OK auf einem Kalender: umbenennen, Link ändern oder entfernen.', groups: calendarGroups
        });
        registerPage({
            name: 'weather', title: 'Wetter', crumb: 'Einstellungen', icon: 'cloud-sun', color: 'c-blue',
            text: 'Wetter und Sonnenzeiten für deinen Ort.', groups: weatherGroups
        });
        registerPage({
            name: 'ha-settings', title: 'Home Assistant', crumb: 'Einstellungen', icon: 'house', color: 'c-teal',
            text: 'Mit Adresse und Anmeldung erscheint die Kachel „Home Assistant“.', groups: haGroups
        });
        registerPage({
            name: 'ha-integrations', title: 'Integrationen einbeziehen', crumb: 'Home Assistant', icon: 'layers-2', color: 'c-indigo',
            text: 'Ganze Integrationen in „Sicherheit“ zeigen.', groups: integrationGroups
        });
        registerPage({
            name: 'network', title: 'Netzwerk', crumb: 'Einstellungen', icon: 'wifi', color: 'c-blue', stageFixed: true,
            text: 'Wie der TV verbunden ist. Nur zur Anzeige.', groups: networkGroups
        });
        registerPage({
            name: 'sound-settings', title: 'Navigationston', crumb: 'Einstellungen', icon: 'volume-2', color: 'c-pink',
            text: 'Ein leiser Klang bei jedem Schritt mit der Fernbedienung.', groups: soundGroups
        });
        registerPage({
            name: 'advanced', title: 'Erweitert', crumb: 'Einstellungen', icon: 'sliders-horizontal', color: 'c-gray',
            text: 'Werkzeuge für Pflege und Fehlersuche.', groups: advancedGroups
        });
        registerPage({
            name: 'launchtimes', title: 'Startzeiten der Apps', crumb: 'Erweitert', icon: 'timer', color: 'c-orange',
            stageFixed: true, text: launchHeadline, groups: launchGroups
        });
        registerPage({
            name: 'pick',
            title: function () { return pick.spec.title; },
            crumb: function () { return pick.spec.crumb; },
            icon: function () { return pick.spec.icon; },
            color: function () { return pick.spec.color; },
            text: function () { return pick.spec.text; },
            preview: function () { return !!pick.spec.previewKey && !pick.spec.styleKey; },
            stageFixed: true,
            startKey: function () { return String(pick.spec.current); },
            groups: function () { return [{ rows: pickRows(), foot: pick.spec.foot }]; },
            // Symbolstil: the list itself shows the focused style.
            style: function () { return pick.spec.styleKey ? pick.spec.current : iconStyle(); },
            onFocusRow: function (r) {
                if (pick.spec.styleKey && r.option) setStyleClass(pages.pick.el, r.option.value);
            }
        });
        // A fetch finishing (or failing) while the page is open updates each calendar's state.
        Calendar.onUpdate(function () {
            if (UI.isVisible('calendars')) redraw();
        });

        UI.register('bg', {
            el: $('bg-settings'),
            rows: function () { return chipRows($('bg-body')); },
            onShow: renderBackground,
            activate: activateBackground,
            hints: [['OK', 'Auswählen'], ['Zurück', 'Einstellungen']]
        });

        UI.register('homeapps', {
            el: $('homeapps'),
            onShow: function (opts) {
                if (!opts.back) {
                    ed.col = 0;
                    ed.idx = [0, 0];
                    ed.moving = -1;
                }
                edLoad();
                edRender();
            },
            focusEl: edFocusEl,
            onKey: edKey,
            onBack: edBack,
            hints: function () {
                if (ed.moving >= 0) {
                    return [['Hoch/Runter', 'Sortieren'], ['OK', 'Ablegen'], ['Zurück', 'Abbrechen']];
                }
                return [
                    ['OK', ed.col === 0 ? 'Optionen' : 'Zu Home'],
                    ['Links/Rechts', 'Spalte wechseln'],
                    ['Zurück', 'Einstellungen']
                ];
            }
        });

        /*
         * Text dialog. Typing happens in Samsung's keyboard or the SmartThings app on the phone, and
         * both send Done/Cancel on their own (the phone's when the keyboard is dismissed or the app
         * is left to copy something). So those only end typing; the dialog closes on its own
         * Speichern / Abbrechen, or on Back once typing has ended.
         */
        var renameInput = $('rename-input');
        var renameActions = UI.children($('rename-actions'));
        renameInput._item = { act: 'type' };
        renameActions[0]._item = { act: 'save' };
        renameActions[1]._item = { act: 'cancel' };
        UI.register('rename', {
            el: $('rename'),
            overlay: true,
            rows: function () { return [[renameInput], renameActions]; },
            hints: [['OK', 'Auswählen'], ['Zurück', 'Abbrechen']],
            onShow: function () {
                setTimeout(function () {
                    UI.focusOn(renameInput);
                    renameInput.focus();
                    renameInput.setSelectionRange(renameInput.value.length, renameInput.value.length);
                }, 0);
            },
            activate: function (item) {
                if (item.act === 'type') renameInput.focus();
                else closeRename(item.act === 'save');
            },
            onBack: function () {
                if (!renameOpen) return false;
                closeRename(false);
                return true;
            },
            onKey: function (k) {
                var typing = document.activeElement === renameInput;
                // Key codes only, never the text: shows on the TV which key ended a dialog.
                if (k === KEY.ENTER || k === IME_DONE || k === IME_CANCEL || k === KEY.BACK) {
                    DevLog.log('Text dialog key ' + k + (typing ? ' while typing' : ''));
                }
                if (!typing) return k === IME_DONE || k === IME_CANCEL;   // late keyboard keys: ignored
                // The press that ends typing ends there: its repeats must not save or close as well.
                if (k === KEY.ENTER || k === IME_DONE) {
                    UI.swallowPress();
                    renameInput.blur();
                    UI.focusOn(renameActions[0]);
                    return true;
                }
                if (k === KEY.BACK || k === KEY.ESC || k === IME_CANCEL) {
                    UI.swallowPress();
                    renameInput.blur();
                    UI.focusOn(renameInput);
                    return true;
                }
                return 'pass';
            }
        });

        Home.onAppsChanged(function () {
            if (UI.isVisible('homeapps') && ed.moving < 0) {
                edLoad();
                edRender();
                UI.refresh();
            }
        });
    }

    window.Settings = {
        init: init,
        openSamsungHome: openSamsungHome,
        openIntegrations: openIntegrations,
        // Existing flows the first-run assistant (js/setup.js) reuses instead of rebuilding them.
        flows: {
            askWeather: askWeatherConsent,
            addCalendar: addCalendar,
            askHomeAssistant: askHomeAssistant,
            askLogin: askLogin,
            askToken: askToken,
            askPair: askPair,
            haHost: haHost,
            haConfigured: haConfigured,
            haToken: haToken,
            haUser: function () { return HA.viaRefresh() ? HA.user() : ''; },
            haMethod: function () { return HA.method(); }
        }
    };
})();

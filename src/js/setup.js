/*
 * First-run assistant: one question per step, as a list to pick from. It opens once on a TV whose
 * Prefs.setup is not 'done' (so existing installs see it a single time) and again from
 * Settings → Erweitert. Every step can be skipped; Back goes one step back, and Back on the first
 * step closes the assistant. Either way it counts as done, so it does not return at every start.
 *
 * The steps reuse what Settings already has: the weather lookup with its consent question, adding a
 * calendar, the text input. Nothing is rebuilt here.
 */
(function () {
    'use strict';

    var $ = UI.$;
    var el = UI.el;
    var flows = Settings.flows;

    // How the household watches TV. `match` finds the app by name like config.js does (the store
    // ids differ by region); `tuner` is the TV's own tuner (the virtual app tv-tuner).
    var TV_CHOICES = [
        { label: 'Kabel, Satellit oder Antenne', tuner: true },
        { label: 'MagentaTV', match: 'magenta' },
        { label: 'waipu.tv', match: 'waipu' },
        { label: 'Zattoo', match: 'zattoo' },
        { label: 'Joyn', match: 'joyn' },
        { label: 'Anderer Weg / keiner' }
    ];

    var step = 0;

    function list() {
        return $('setup').querySelector('ul');
    }

    // Redraws the current step after something changed behind a pop-up or the text input.
    function redraw() {
        render();
        UI.refresh();
    }

    // The same origin object the weather flow in settings.js expects.
    // `stamp` changes with every step shown, so a place lookup that answers after the viewer
    // skipped ahead does not pop its question over the next step (settings.js askTown).
    var ORIGIN = { view: 'setup', done: redraw, stamp: function () { return shown; } };
    var shown = 0;

    function findTvApp(choice) {
        return Apps.curated(Home.apps(), { apps: [{ match: choice.match, label: choice.label }] })[0] || null;
    }

    function chooseTv(choice) {
        if (choice.tuner) {
            if (!Home.tunerSupported()) {
                UI.toast('Der TV meldet keine TV-Quelle');
                return;
            }
            // Choosing it here also switches the tile back on if it was off in Settings.
            Prefs.get().tuner.enabled = true;
            Prefs.save();
            Home.placeFirst(Home.tunerItem());
        } else if (choice.match) {
            var app = findTvApp(choice);
            if (!app) {
                UI.toast(choice.label + ' ist auf diesem TV nicht installiert');
                return;
            }
            // Television comes through the app, so the tuner tile would only be in the way. It can be
            // switched back on under Konsolen & HDMI.
            Prefs.get().tuner.enabled = false;
            Prefs.save();
            Home.placeFirst(app);
        }
        next();
    }

    function tvEntries() {
        return TV_CHOICES.map(function (c) {
            var value = '';
            if (c.tuner && !Home.tunerSupported()) value = 'Der TV meldet keine TV-Quelle';
            else if (c.match && !findTvApp(c)) value = 'Nicht installiert';
            return { label: c.label, value: value, run: function () { chooseTv(c); } };
        });
    }

    function chooseState(code) {
        Holidays.setState(code);
        Home.updateClock();
        next();
    }

    function stateEntries() {
        var current = Holidays.state();
        var entries = Holidays.states.map(function (s) {
            return { label: s.label, value: s.key === current ? 'Aktuell' : '', run: function () { chooseState(s.key); } };
        });
        entries.push({ label: 'Nur bundesweite Feiertage', value: current ? '' : 'Aktuell', run: function () { chooseState(null); } });
        return entries;
    }

    function weatherEntries() {
        var on = Weather.configured();
        return [{
            label: on ? 'Ort ändern' : 'Ort eingeben',
            value: on ? Weather.placeName() : '',
            run: function () { flows.askWeather(ORIGIN); }
        }];
    }

    function calendarEntries() {
        var count = Calendar.list().length;
        return [{
            label: 'Kalender hinzufügen',
            value: count ? count + ' eingerichtet' : '',
            run: function () { flows.addCalendar(redraw); }
        }];
    }

    // After the address: pair with the phone (first choice: scan, type six characters, approve), sign
    // in with user name and password, or paste a token. All optional here: with the address alone
    // nothing connects yet.
    function homeAssistantEntries() {
        var on = flows.haConfigured();
        var entries = [{
            label: on ? 'Adresse ändern' : 'Adresse eingeben',
            value: on ? flows.haHost(Prefs.get().homeAssistant.url) : '',
            run: function () { flows.askHomeAssistant(redraw); }
        }];
        if (on) {
            var user = flows.haUser();
            var how = flows.haMethod();
            entries.push({
                label: 'Mit dem Handy koppeln',
                value: how === 'pair' ? 'gekoppelt' + (user ? ' als ' + user : '') : 'Empfohlen',
                run: function () { flows.askPair(redraw); }
            });
            entries.push({
                label: how === 'login' ? 'Neu anmelden' : 'Anmelden (Benutzername und Passwort)',
                value: how === 'login' && user ? 'angemeldet als ' + user : '',
                run: function () { flows.askLogin(redraw); }
            });
            entries.push({
                label: flows.haToken() ? 'Token ändern' : 'Token einfügen',
                value: flows.haToken() ? 'hinterlegt' : '',
                run: function () { flows.askToken(redraw); }
            });
        }
        return entries;
    }

    // `done` (optional): the step already has a value, so the last row reads "Weiter" and not "Überspringen".
    var STEPS = [
        { title: 'Wie schaust du fern?', hint: 'Die Wahl steht danach an erster Stelle auf der Startseite.', entries: tvEntries },
        { title: 'Bundesland', hint: 'Für den nächsten Feiertag unter dem Datum.', entries: stateEntries },
        {
            title: 'Wetter', hint: 'Der Ortsname geht an Open-Meteo, der ungefähre Ort (ca. 1 km) für Unwetterwarnungen an den Deutschen Wetterdienst. Vorher wirst du gefragt.',
            entries: weatherEntries, done: function () { return Weather.configured(); }
        },
        {
            title: 'Kalender', hint: 'Private iCal-Links; die Termine erscheinen oben links auf der Startseite.',
            entries: calendarEntries, done: function () { return Calendar.list().length > 0; }
        },
        {
            title: 'Home Assistant', hint: 'IP-Adresse mit Port, z. B. 192.168.193.225:8123, oder deine Cloudflare-Adresse. Danach mit dem Handy koppeln (oder anmelden bzw. einen Token einfügen); dann erscheint die Kachel „Home Assistant“ für Geräte mit Label „TV“.',
            entries: homeAssistantEntries, done: function () { return flows.haConfigured(); }
        }
    ];

    // The closing screen after the last step; not counted in "Schritt n von 5".
    var FINISH = {
        title: 'Fertig',
        hint: 'Alles lässt sich später ändern. Die Ersteinrichtung startet unter Einstellungen → Erweitert neu.',
        entries: function () { return [{ label: 'Zur Startseite', value: '', run: finish }]; }
    };

    function current() {
        return STEPS[step] || FINISH;
    }

    function render() {
        var def = current();
        $('setup-title').textContent = def.title;
        $('setup-step').textContent = step < STEPS.length ? 'Schritt ' + (step + 1) + ' von ' + STEPS.length : '';
        $('setup-hint').textContent = def.hint;
        var entries = def.entries();
        if (step < STEPS.length) {
            entries.push({ label: def.done && def.done() ? 'Weiter' : 'Überspringen', value: '', run: next });
        }
        var ul = list();
        ul.innerHTML = '';
        entries.forEach(function (e) {
            var li = el('li', 'setting-row');
            li.appendChild(el('span', 'setting-label', e.label));
            li.appendChild(el('span', 'setting-value', e.value));
            li._item = e;
            ul.appendChild(li);
        });
    }

    // A new step starts at the top of its list, with the first row selected.
    function setStep(n) {
        step = n;
        shown++;
        render();
        UI.refreshHints();   // "Zurück" reads Beenden on the first step only
        UI.resetScroll(list());
        UI.focusOn(list().firstChild);
    }

    function next() {
        setStep(step + 1);
    }

    // Back from the first step ends the assistant (and counts as done).
    function back() {
        if (step === 0) finish();
        else setStep(step - 1);
    }

    function finish() {
        Prefs.get().setup = 'done';
        Prefs.save();
        Home.focusFirstFavourite();
    }

    function open() {
        step = 0;
        UI.show('setup');
        UI.resetScroll(list());
        UI.focusOn(list().firstChild);
    }

    // The first run waits until Home knows the installed apps and the TV's sources: step 1 offers
    // only what is there. Without an app list after a while it starts anyway.
    function startWhenReady() {
        var started = false;
        function go() {
            if (started) return;
            started = true;
            Home.refreshInputStatus().then(function () {
                // Not over a screen the viewer has already moved on to (Settings, a running app).
                if (UI.isVisible('home')) open();
            });
        }
        if (Home.apps().length) go();
        else {
            Home.onAppsChanged(go);
            setTimeout(go, 10000);
        }
    }

    function init() {
        UI.register('setup', {
            el: $('setup'),
            rows: function () { return UI.children(list()).map(function (li) { return [li]; }); },
            onShow: render,
            activate: function (item) { item.run(); },
            onBack: function () {
                back();
                return true;
            },
            hints: function () {
                return [['OK', 'Auswählen'], ['Zurück', step === 0 ? 'Beenden' : 'Schritt zurück']];
            }
        });
        // The signed-in name arrives once connected; the Home Assistant step shows it.
        HA.onUpdate(function (what) {
            if (what === 'user' && UI.isVisible('setup')) redraw();
        });
        if (Prefs.get().setup !== 'done') startWhenReady();
    }

    window.Setup = { init: init, open: open };
})();

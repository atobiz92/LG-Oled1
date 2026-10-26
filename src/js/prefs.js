/*
 * User settings, stored on the TV (localStorage). js/config.js only provides the defaults.
 * They survive restarts and in-place updates, but not an uninstall.
 */
(function () {
    'use strict';

    var KEY = 'arn0.prefs.v1';
    var LEGACY_WALLPAPER_KEY = 'arn0.wallpaper';

    function defaults() {
        var cfg = window.LAUNCHER_CONFIG || {};
        var theme = cfg.theme || {};
        return {
            sound: {
                enabled: cfg.sound ? cfg.sound.enabled !== false : true,
                preset: cfg.sound && cfg.sound.preset || 'soft'
            },
            wallpaper: {
                mode: theme.wallpaper ? 'photo' : 'off',   // 'off' | 'photo' | 'rotate'
                photo: theme.wallpaper || 'forest',
                interval: '15m',        // see Wallpaper.INTERVALS
                lastChange: 0
            },
            screensaver: {
                enabled: true,
                delay: '5m',            // see Screensaver.DELAYS
                photoEvery: '75s',      // see Screensaver.PHOTO_EVERY
                dark: '1h',             // see Screensaver.DARK_AFTER
                caption: 'brand',       // text bottom left: 'brand' | 'photo' | 'custom' | 'none'; see Screensaver.CAPTIONS
                captionText: ''         // the 'custom' text, at most 24 characters
            },
            appearance: {
                clock: '24h',           // '24h' | '12h'
                showDate: true,
                locale: cfg.locale || 'en-GB',
                font: 'barlow',         // see Appearance.FONTS
                fontPicked: false,      // true once chosen in Darstellung; see the migration in load()
                textSize: 'default',    // see Appearance.TEXT_SIZES
                names: 'focused',     // app names under tiles: 'always' | 'focused' | 'never'
                night: 'auto',          // 'auto' (from sunset to sunrise) | 'off'; see Appearance.isNight
                homeLayout: 'standard', // top of Home: 'standard' (clock right) | 'column' (clock left)
                iconStyle: 'ordiscale'  // 'ordiscale' | 'plain' | 'color'; see Appearance.ICON_STYLES
            },
            weather: null,              // { enabled, name, latitude, longitude } once set on the TV
            // Official weather warnings (js/warnings.js). Off until the viewer agrees: the place goes to
            // the DWD, a second service next to Open-Meteo, so neither a stored place nor config turns it on.
            warnings: { enabled: false },
            calendar: {
                enabled: true,          // appointments on Home (js/calendar.js)
                titles: true,           // false: "Termin" instead of the title, for guests in the room
                list: [],               // [{ id, name, url }] set up on the TV (Settings → Kalender)
                mac: {}                 // { <installed name>: { name, hidden } } TV-side changes to Mac calendars
            },
            home: null,                // [{ id, label, brand }] once edited; null = config.js apps
            inputs: null,               // [{ hdmi, label, brand, method, hidden }] once edited; null = config.js
            tuner: { enabled: true, checked: false },   // "Fernsehen" tile (TV source) on Home; see home.js tunerAvailable
            holidays: { state: null },  // state code for regional holidays; null = config.js, '' = nationwide only
            // { url, token | refresh, client, user, auth, expired } once entered (js/homeassistant.js,
            // js/ha-auth.js, js/ha-pair.js): token = long-lived token, refresh = refresh token from pairing
            // with the phone or from signing in with user name and password (the password is never stored),
            // client = the client_id a paired TV's refresh token belongs to (none: HAAuth.CLIENT_ID),
            // user = the name shown, auth = 'pair' | 'login' | 'token' (set up last), expired = Home
            // Assistant refused the sign-in. Keys stay on the TV: never shown, logged or exported
            // (settings.js redacted).
            homeAssistant: null,
            // The view "Sicherheit" (js/ha-view.js): integrations taken in as a whole (their main
            // entities, besides the label "TV"), opened at launcher start (a TV used as a dashboard),
            // and which stream the full-screen camera uses: 'smooth' (medium channel when there is one)
            // or 'max' (highest resolution).
            haView: { integrations: [], startup: false, fullCamera: 'smooth' },
            setup: null                 // 'done' once the first-run assistant (js/setup.js) was finished or closed
        };
    }

    function merge(target, saved) {
        if (!saved) return;
        Object.keys(target).forEach(function (k) {
            if (saved[k] !== undefined) target[k] = saved[k];
        });
    }

    function load() {
        var prefs = defaults();
        try {
            var saved = JSON.parse(localStorage.getItem(KEY));
            if (saved) {
                merge(prefs.sound, saved.sound);
                merge(prefs.wallpaper, saved.wallpaper);
                merge(prefs.screensaver, saved.screensaver);
                merge(prefs.appearance, saved.appearance);
                // Inter was the default before Barlow; a font nobody picked follows the new default.
                if (!prefs.appearance.fontPicked && prefs.appearance.font === 'inter') prefs.appearance.font = 'barlow';
                merge(prefs.calendar, saved.calendar);
                merge(prefs.tuner, saved.tuner);
                // 0.9.0 left the tuner tile on after a TV app was chosen in the first-run assistant.
                // Once: that choice put the app first, so an app of that kind first means no tuner.
                if (saved.setup === 'done' && !prefs.tuner.checked && Array.isArray(saved.home) && saved.home[0] &&
                        ['MagentaTV', 'waipu.tv', 'Zattoo', 'Joyn'].indexOf(saved.home[0].label) >= 0) {
                    prefs.tuner.enabled = false;
                }
                prefs.tuner.checked = true;
                merge(prefs.warnings, saved.warnings);
                merge(prefs.holidays, saved.holidays);
                if (Array.isArray(saved.home) && saved.home.length) prefs.home = saved.home;
                if (Array.isArray(saved.inputs)) prefs.inputs = saved.inputs;
                if (saved.weather) prefs.weather = saved.weather;
                var ha = saved.homeAssistant;
                if (ha && typeof ha.url === 'string') {
                    prefs.homeAssistant = { url: ha.url };
                    ['token', 'refresh', 'client', 'user', 'auth'].forEach(function (k) {
                        if (typeof ha[k] === 'string' && ha[k]) prefs.homeAssistant[k] = ha[k];
                    });
                    if (ha.expired === true) prefs.homeAssistant.expired = true;
                }
                var hv = saved.haView;
                if (hv) {
                    if (Array.isArray(hv.integrations)) {
                        prefs.haView.integrations = hv.integrations.filter(function (x) { return typeof x === 'string' && x; });
                    }
                    prefs.haView.startup = hv.startup === true;
                    if (hv.fullCamera === 'max') prefs.haView.fullCamera = 'max';
                }
                if (saved.setup === 'done') prefs.setup = 'done';
            } else {
                var legacy = localStorage.getItem(LEGACY_WALLPAPER_KEY);
                if (legacy) prefs.wallpaper.photo = legacy;
            }
        } catch (e) {
            // Unreadable storage: run with defaults.
        }
        // "Midnight" used to be a photo; it is now what Off shows.
        if (prefs.wallpaper.photo === 'midnight') {
            if (prefs.wallpaper.mode === 'photo') prefs.wallpaper.mode = 'off';
            prefs.wallpaper.photo = 'forest';
        }
        return prefs;
    }

    var prefs = load();

    function save() {
        try {
            localStorage.setItem(KEY, JSON.stringify(prefs));
            return true;
        } catch (e) {
            DevLog.log('Could not save settings: ' + DevLog.errorText(e));
            return false;
        }
    }

    function reset() {
        try {
            localStorage.removeItem(KEY);
            localStorage.removeItem(LEGACY_WALLPAPER_KEY);
        } catch (e) {
            // Nothing stored, nothing to clear.
        }
        prefs = defaults();
    }

    window.Prefs = {
        get: function () { return prefs; },
        save: save,
        reset: reset
    };
})();

/*
 * Home screen content.
 *
 * apps: each entry picks the first installed app matching it:
 *   { id: 'netflix' }                 exact app id (most reliable; see "All apps", the id of
 *                                     the focused app is shown at the bottom)
 *   { match: 'netflix' }              case-insensitive regex on id or name
 *   label                             optional display name
 *   brand                             optional key from js/brands.js (otherwise guessed from the name)
 * Entries that match nothing are skipped.
 *
 * inputs: HDMI ports shown in the second row. Set `hdmi` to the port each device is plugged into.
 */
window.LAUNCHER_CONFIG = {
    apps: [
        // German line-up. Matched by name because store ids differ by region; apps that are not
        // installed are skipped. Pin exact ids from "Alle Apps" once they are known.
        { match: 'youtube', label: 'YouTube', brand: 'youtube' },
        { id: 'netflix', label: 'Netflix' },
        { match: 'prime ?video', label: 'Prime Video' },
        { match: 'disney', label: 'Disney+' },
        { match: 'ard ?mediathek', label: 'ARD', brand: 'ard' },
        { match: 'zdf', label: 'ZDF' },
        { match: 'joyn', label: 'Joyn' },
        { match: 'rtl ?(\\+|plus)|tvnow', label: 'RTL+' },
        { match: 'waipu', label: 'waipu.tv' },
        { match: 'magenta', label: 'MagentaTV' },
        // App id still unknown: found by name; pin the exact id from "Alle Apps" once it is known.
        { match: 'zattoo', label: 'Zattoo' },
        { match: 'dazn', label: 'DAZN' },
        { match: 'apple ?tv|aria-video', label: 'Apple TV' },
        { match: 'spotify', label: 'Spotify' },
        { match: 'plex', label: 'Plex' }
    ],

    // Names and logos per HDMI port, e.g. { hdmi: 2, label: 'PlayStation 5', brand: 'playstation' }.
    // Empty: Home shows a tile only for ports with something plugged in (home.js homeInputs), as
    // "Neues Gerät" until it is named in Settings → Konsolen & HDMI.
    inputs: [],

    // How an input tile switches the TV. See README "HDMI inputs".
    //   'switch+viewer'  set the TV source, then open Samsung's TV viewer (default)
    //   'switch'         only set the TV source
    //   'inapp'          show the input full screen inside the launcher (Back returns)
    inputMethod: 'switch+viewer',

    locale: 'de-DE',

    theme: {
        // Starting wallpaper (key from js/wallpapers.js), or null for none (plain gradient).
        // Changed from Settings → Background; the TV remembers the choice.
        wallpaper: 'kontur'
    },

    /*
     * Weather shown in the screen saver's corner, from Open-Meteo. No API key and nothing to
     * keep secret, so this is the whole setup: put your own coordinates here (two decimals is
     * plenty, and is also about as precise as you want a public request to be). Leave them null
     * and the widget never appears.
     *
     * There is no Settings page for this on purpose — the TV does not move, and coordinates are
     * not something you type with a remote.
     */
    // Upcoming appointments on Home (js/calendar.js). Calendars are named in config.local.js:
    //   sources: [{ name: 'Privat', keychain: 'ordiscale-launcher-kalender-privat' }, …]
    // The links themselves are secrets: they live in the Mac's Keychain under those entry names and
    // only scripts/install-tv.sh puts them into the build. Empty: no calendar.
    calendar: {
        sources: []
    },

    // Next public holiday under the date (js/holidays.js, computed on the TV). state: German state
    // code for regional holidays ('NW', 'BY', …), set in config.local.js; null = nationwide only.
    holidays: {
        state: null
    },

    // Samsung certificate this build is signed with (Settings → Erweitert warns 30 days before it
    // expires). expires: 'YYYY-MM-DD', the last valid day; set in config.local.js. null = unknown
    // (someone else's installation), shown as such without a warning.
    certificate: {
        expires: null
    },

    // Pairing with Home Assistant (Settings → Home Assistant → Mit dem Handy koppeln): the name this TV
    // gets there ("Ordiscale TV · <name>", at most 40 characters). null = "Fernseher".
    homeAssistant: {
        tvName: null
    },

    weather: {
        latitude: null,
        longitude: null,
        unit: 'celsius'         // 'celsius' | 'fahrenheit'
    },

    /*
     * EXPERIMENTAL navigation sound. Synthesised, so there is no audio file. `move` plays when
     * focus changes, `edge` when it cannot (the end of a row). Tune by ear in the browser
     * preview; `volume` is 0–1 and sits on top of the TV's own volume.
     *
     * Whether this is worth keeping depends on the TV's audio latency: run
     * "Sound: report audio latency" in the Lab screen. Set enabled to false to silence it.
     */
    sound: {
        enabled: true,
        preset: 'soft',
        volume: 0.08,
        minGapMs: 45,
        presets: {
            soft: { label: 'Soft', freq: 620, ms: 30, type: 'sine' },
            warm: { label: 'Warm', freq: 520, ms: 44, type: 'triangle' },
            bright: { label: 'Bright', freq: 1040, ms: 30, type: 'triangle' }
        },
        move: { freq: 880, ms: 38, type: 'triangle' },
        edge: { freq: 200, ms: 70, type: 'sine' },
        select: { freq: 1320, ms: 55, type: 'triangle' }
    },

    // Development only: where the Lab screen sends its logs (npm run devlog on your computer).
    // null disables it; set it to http://<your-computer-ip>:8099/log while debugging.
    devLogUrl: null
};

/*
 * Local overrides from js/config.local.js, which is gitignored and loaded just before this file.
 * That is where values specific to one TV belong — coordinates, a devlog address — so this file
 * can stay in the repository with nulls in it. Nothing to strip before a push, nothing to put
 * back before a build, and the overlay reaches the browser preview and the .wgt alike.
 *
 * Merged one level deep, so a local file can set weather.latitude without restating the rest of
 * the block. Arrays (apps, inputs) and plain values replace the default outright.
 */
(function () {
    'use strict';

    var local = window.LAUNCHER_LOCAL;
    if (!local) return;

    function plainObject(v) {
        return v && typeof v === 'object' && !Array.isArray(v);
    }

    Object.keys(local).forEach(function (key) {
        if (plainObject(local[key]) && plainObject(window.LAUNCHER_CONFIG[key])) {
            Object.keys(local[key]).forEach(function (inner) {
                window.LAUNCHER_CONFIG[key][inner] = local[key][inner];
            });
        } else {
            window.LAUNCHER_CONFIG[key] = local[key];
        }
    });
})();

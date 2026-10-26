/*
 * App listing, filtering and launching on LG webOS (luna://com.webos.applicationManager).
 * Same interface as the Tizen version of the UI kit, so home.js, settings.js and setup.js stay as they are.
 *
 * Listing: listLaunchPoints, the list behind LG's own app bar (id, title, icon). webOS refuses it to
 * apps that are not LG's or a partner's (LG developer forum: "Denied method call"), so the same list is then read
 * through LG Connect Apps (js/ssap.js; the TV asks once). Only if that is off or declined do the apps
 * LG ships under these ids stand in (KNOWN below). Starting goes the same two ways.
 */
(function () {
    'use strict';

    var AM = 'luna://com.webos.applicationManager/';

    // LG's own apps and services that are not something to put on Home. Apps from the LG Content Store
    // have plain ids (netflix, youtube.leanback.v4, amazon, …); LG's own carry these prefixes.
    var SYSTEM = /^(com\.webos\.|com\.palm\.|com\.lge\.|com\.webos\.app\.|webos\.|lge\.)/;
    // LG apps that are still worth a tile.
    var PRELOADED = ['com.webos.app.browser', 'com.webos.app.photovideo', 'com.webos.app.music'];
    var NOISE = /service|worker|plugin|launcher|test|sdk|factory|daemon|dummy|agent|manual|account|privacy|security|update/i;

    // Ids the UI kit uses for Samsung's own apps, and what does the same on webOS.
    var ALIAS = {
        'com.samsung.tv.csfs': 'com.webos.app.home',    // Samsung's home screen → LG's home (app bar)
        'org.tizen.tv-viewer': 'com.webos.app.livetv'   // Samsung's TV viewer → LG's live TV
    };

    // Used when the TV does not hand out its app list: the apps of the default line-up (config.js)
    // with their LG Content Store ids. Not verified on the B8 yet (am TV prüfen).
    var KNOWN = [
        { id: 'youtube.leanback.v4', name: 'YouTube' },
        { id: 'netflix', name: 'Netflix' },
        { id: 'amazon', name: 'Prime Video' },
        { id: 'com.disney.disneyplus-prod', name: 'Disney+' },
        { id: 'de.ard.mediathek', name: 'ARD Mediathek' },
        { id: 'de.zdf.app', name: 'ZDFmediathek' },
        { id: 'de.prosiebensat1digital.joyn', name: 'Joyn' },
        { id: 'de.rtl.tvnow', name: 'RTL+' },
        { id: 'tv.waipu.app.waipu-lg', name: 'waipu.tv' },
        { id: 'de.telekom.magentatv', name: 'MagentaTV' },
        { id: 'com.zattoo.app', name: 'Zattoo' },
        { id: 'com.dazn', name: 'DAZN' },
        { id: 'com.apple.appletv', name: 'Apple TV' },
        { id: 'spotify-beehive', name: 'Spotify' },
        { id: 'cdp-30', name: 'Plex' },
        { id: 'com.webos.app.browser', name: 'Webbrowser' }
    ];

    var source = 'unknown';     // 'tv' | 'ssap' | 'known': where the last list came from (DevLog, Lab)

    function withTimeout(promise, ms, what) {
        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () { reject(new Error(what + ': keine Antwort vom TV')); }, ms);
            promise.then(function (v) { clearTimeout(timer); resolve(v); },
                function (e) { clearTimeout(timer); reject(e); });
        });
    }

    function selfAppId() {
        return Platform.APP_ID;
    }

    function fromLaunchPoint(lp) {
        return {
            id: lp.id,
            name: lp.title || lp.id,
            show: lp.visible !== false,
            iconPath: lp.largeIcon || lp.icon || '',
            packageId: lp.id,
            categories: [],
            version: lp.version || '',
            system: !!lp.systemApp
        };
    }

    function known() {
        return KNOWN.map(function (a) {
            return { id: a.id, name: a.name, show: true, iconPath: '', packageId: a.id, categories: [], version: '', system: false };
        });
    }

    function getInstalledApps() {
        return Platform.call(AM + 'listLaunchPoints', {}, 8000).then(function (res) {
            source = 'tv';
            return (res.launchPoints || []).map(fromLaunchPoint);
        }).catch(function (err) {
            DevLog.log('App list over Luna refused (' + DevLog.errorText(err) + '): asking LG Connect Apps');
            return Ssap.request('ssap://com.webos.applicationManager/listLaunchPoints').then(function (res) {
                source = 'ssap';
                return (res.launchPoints || []).map(fromLaunchPoint);
            });
        }).catch(function (err) {
            source = 'known';
            DevLog.log('App list unavailable (' + DevLog.errorText(err) + '): using the known apps');
            return known();
        });
    }

    function launch(appId) {
        var id = ALIAS[appId] || appId;
        var luna = withTimeout(Platform.call(AM + 'launch', { id: id }, 8000), 8000, 'Start');
        return luna.catch(function (err) {
            // Refused over Luna: start it the way LG's phone app does. Other errors (not installed) stand.
            if (!/denied/i.test(err.message)) throw err;
            return Ssap.request('ssap://system.launcher/launch', { id: id });
        });
    }

    function isConsumer(app) {
        if (PRELOADED.indexOf(app.id) >= 0) return true;
        if (!app.show || app.system || SYSTEM.test(app.id)) return false;
        return !NOISE.test(app.name + ' ' + app.id);
    }

    // Everything launchable with a name, minus ourselves. Curated entries match against this,
    // so any app can still be pinned by id even if the consumer filter hides it.
    function launchable(apps) {
        var self = selfAppId();
        var seen = {};
        return apps.filter(function (a) {
            if (!a.name || a.id === self || seen[a.id]) return false;
            seen[a.id] = true;
            return true;
        });
    }

    function curated(apps, cfg) {
        var used = {};
        var out = [];
        (cfg.apps || []).forEach(function (entry) {
            // Virtual apps (e.g. the TV tuner) are not installed anywhere: Home hands them in ready-made.
            var virtual = entry.id && cfg.virtual && cfg.virtual[entry.id];
            if (virtual) {
                if (!used[virtual.id]) {
                    used[virtual.id] = true;
                    out.push(virtual);
                }
                return;
            }
            var re = entry.match ? new RegExp(entry.match, 'i') : null;
            var candidates = apps.filter(function (a) {
                if (used[a.id]) return false;
                if (entry.id) return a.id === entry.id;
                return re && (re.test(a.id) || re.test(a.name));
            });
            // Prefer a visible consumer app when several match.
            var app = candidates.find(isConsumer) || candidates[0];
            if (app) {
                used[app.id] = true;
                out.push(toItem(app, entry));
            }
        });
        return out;
    }

    function allSorted(apps, showEverything) {
        return apps
            .filter(function (a) { return showEverything ? a.show : isConsumer(a); })
            .map(function (a) { return toItem(a, {}); })
            .sort(function (x, y) { return x.label.localeCompare(y.label); });
    }

    // Store names often carry a tagline: "Spotify - Music and Podcasts", "TF1+ : Streaming, …"
    function shortName(name) {
        return name.split(/\s+[-:|–]\s+/)[0].trim() || name;
    }

    function toItem(app, entry) {
        return {
            kind: 'app',
            id: app.id,
            label: entry.label || shortName(app.name),
            brand: entry.brand ? findBrand(entry.brand) : findBrand(app),
            iconPath: app.iconPath || ''
        };
    }

    function describe(app) {
        return {
            id: app.id, name: app.name, show: app.show, packageId: app.packageId,
            categories: app.categories || [], iconPath: app.iconPath, version: app.version,
            consumer: isConsumer(app), source: source
        };
    }

    window.Apps = {
        getInstalledApps: getInstalledApps,
        launchable: launchable,
        curated: curated,
        allSorted: allSorted,
        describe: describe,
        launch: launch,
        withTimeout: withTimeout,
        source: function () { return source; }
    };
})();

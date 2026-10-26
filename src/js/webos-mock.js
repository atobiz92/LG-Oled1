/*
 * Simulator of the webOS services the launcher uses, for the browser preview (and the demo page).
 * Does nothing on the TV: there window.PalmServiceBridge exists.
 *
 * It answers the Luna calls of js/platform-webos.js like the B8 would: the app bar's launch points,
 * launching an app, the HDMI ports, the network status. The app ids are the LG Content Store ids as
 * far as known; on the TV the real list comes from the TV itself.
 * Apps without a bundled logo show initials here; on the TV they get their real icon.
 *
 * From the console:
 *   WebOSMock.calls                  every Luna call so far (uri, params)
 *   WebOSMock.denyAppList = true     the TV refuses listLaunchPoints (launcher falls back to known apps)
 *   WebOSMock.denyInputs = true      the TV refuses the input status
 *   WebOSMock.denyLaunch = true      the TV refuses launch over Luna (the launcher starts via LG Connect Apps)
 *   WebOSMock.ssap = 'allow'         LG Connect Apps: 'allow' (prompt answered with Yes), 'decline', 'off'
 *   WebOSMock.asLg('allow')          reload with Luna refused and LG Connect Apps as given (asLg('') undoes)
 *   WebOSMock.network = 'ethernet'   'wifi' (default) | 'ethernet' | 'offline'
 *   WebOSMock.engine53()             reload with the fallbacks of the TV's Chromium 53 forced on
 *
 * Below it, unchanged from the UI kit, the Home Assistant simulator (address "ha.mock").
 */
(function () {
    'use strict';
    if (typeof window.PalmServiceBridge === 'function') return;
    // Kept under the kit's name: boot.js and homeassistant.js ask for it to know they run in the preview.
    window.__TIZEN_MOCK__ = true;
    window.__WEBOS_MOCK__ = true;

    function lp(id, title, systemApp) {
        return { id: id, title: title, icon: '', largeIcon: '', systemApp: !!systemApp, visible: true, removable: !systemApp };
    }

    var launchPoints = [
        lp('com.tobias.launcher', 'Ordiscale Launcher'),
        lp('youtube.leanback.v4', 'YouTube'),
        lp('netflix', 'Netflix'),
        lp('amazon', 'Prime Video'),
        lp('com.disney.disneyplus-prod', 'Disney+'),
        lp('com.apple.appletv', 'Apple TV'),
        lp('spotify-beehive', 'Spotify'),
        lp('com.twitch.tv', 'Twitch'),
        lp('cdp-30', 'Plex'),
        lp('com.dazn', 'DAZN'),
        lp('de.ard.mediathek', 'ARD Mediathek'),
        lp('de.zdf.app', 'ZDFmediathek'),
        lp('de.rtl.tvnow', 'RTL+'),
        lp('tv.waipu.app.waipu-lg', 'waipu.tv - Live TV'),
        lp('de.telekom.magentatv', 'MagentaTV'),
        lp('com.zattoo.app', 'Zattoo'),
        lp('com.webos.app.browser', 'Webbrowser', true),
        lp('de.prosiebensat1digital.joyn', 'Joyn'),
        // LG's own apps that the consumer filter should hide
        lp('com.webos.app.livetv', 'Live TV', true),
        lp('com.webos.app.hdmi1', 'HDMI 1', true),
        lp('com.webos.app.notificationcenter', 'Benachrichtigungen', true),
        lp('com.webos.app.discovery', 'LG Content Store', true),
        lp('com.palm.app.settings', 'Einstellungen', true),
        lp('com.webos.app.customersupport', 'Kundenservice', true)
    ];

    // As in the UI kit's simulator: the tuner, HDMI 2 and 4 with a device, 1 and 3 empty.
    var inputs = [
        { id: 'HDMI_1', appId: 'com.webos.app.hdmi1', connected: false },
        { id: 'HDMI_2', appId: 'com.webos.app.hdmi2', connected: true },
        { id: 'HDMI_3', appId: 'com.webos.app.hdmi3', connected: false },
        { id: 'HDMI_4', appId: 'com.webos.app.hdmi4', connected: true }
    ];

    var WebOSMock = window.WebOSMock = {
        calls: [],
        denyAppList: false,
        denyInputs: false,
        denyLaunch: false,
        ssap: 'allow',
        network: 'wifi',
        // Reload with no-grid and no-flex-gap forced, as on the TV (index.html reads the flag).
        engine53: function (on) {
            try { sessionStorage.setItem('webosmock.engine53', on === false ? '' : '1'); } catch (e) { /* ignore */ }
            location.reload();
        },
        // Reload as a TV that refuses Luna to this app, with LG Connect Apps answering 'allow' |
        // 'decline' | 'off' (the TV's prompt is not simulated); '' = Luna allowed again.
        asLg: function (ssap) {
            try {
                sessionStorage.setItem('webosmock.ssap', ssap || '');
                localStorage.removeItem('arn0.ssap.v1');
            } catch (e) { /* ignore */ }
            location.reload();
        }
    };
    try {
        var asLg = sessionStorage.getItem('webosmock.ssap');
        if (asLg) {
            WebOSMock.denyAppList = WebOSMock.denyInputs = WebOSMock.denyLaunch = true;
            WebOSMock.ssap = asLg;
        }
    } catch (e) { /* no storage */ }

    var subscribers = [];

    function networkStatus() {
        var n = WebOSMock.network;
        return {
            returnValue: true,
            isInternetConnectionAvailable: n !== 'offline',
            wired: n === 'ethernet' ? { state: 'connected', ipAddress: '192.168.1.42' } : { state: 'disconnected' },
            wifi: n === 'wifi' ? { state: 'connected', ssid: 'Home Wi-Fi', ipAddress: '192.168.1.42' } : { state: 'disconnected' }
        };
    }

    var handlers = {
        'luna://com.webos.applicationManager/listLaunchPoints': function () {
            if (WebOSMock.denyAppList) return { returnValue: false, errorCode: -1, errorText: 'Denied method call "listLaunchPoints"' };
            return { returnValue: true, launchPoints: launchPoints.slice() };
        },
        'luna://com.webos.applicationManager/launch': function (p) {
            if (WebOSMock.denyLaunch) return { returnValue: false, errorCode: -1, errorText: 'Denied method call "launch"' };
            console.log('[webos-mock] launch', p.id);
            // As in the kit's simulator, one app fails to start, to show the message.
            if (p.id === 'spotify-beehive') return { returnValue: false, errorCode: -101, errorText: 'Simulierter Startfehler' };
            return { returnValue: true, processId: '1001' };
        },
        'luna://com.webos.service.eim/getAllInputStatus': function () {
            if (WebOSMock.denyInputs) return { returnValue: false, errorCode: -1, errorText: 'Denied method call "getAllInputStatus"' };
            return { returnValue: true, devices: inputs.slice() };
        },
        'luna://com.palm.connectionmanager/getStatus': function () {
            return networkStatus();
        }
    };

    function Bridge() {
        this.onservicecallback = null;
        this.cancelled = false;
    }
    Bridge.prototype.call = function (uri, json) {
        var self = this;
        var params = {};
        try { params = JSON.parse(json || '{}'); } catch (e) { /* empty */ }
        WebOSMock.calls.push({ uri: uri, params: params });
        if (window.parent && window.parent !== window) {
            try { window.parent.postMessage({ type: 'webos-luna', uri: uri, params: params }, '*'); } catch (e) { /* ignore */ }
        }
        var handler = handlers[uri];
        var res = handler ? handler(params) : { returnValue: false, errorCode: -1, errorText: 'Unknown method "' + uri + '"' };
        if (params.subscribe) subscribers.push({ bridge: self, uri: uri, params: params });
        setTimeout(function () {
            if (!self.cancelled && self.onservicecallback) self.onservicecallback(JSON.stringify(res));
        }, 60);
    };
    Bridge.prototype.cancel = function () {
        this.cancelled = true;
    };
    window.PalmServiceBridge = Bridge;

    // LG Connect Apps (js/ssap.js) on ws://127.0.0.1:3000; other sockets stay real.
    var NativeWebSocket = window.WebSocket;
    function FakeSsap(url) {
        if (url.indexOf('ws://127.0.0.1:3000') !== 0) return new NativeWebSocket(url);
        var self = this;
        setTimeout(function () {
            if (WebOSMock.ssap === 'off') { if (self.onerror) self.onerror({}); return; }
            if (self.onopen) self.onopen({});
        }, 30);
    }
    FakeSsap.prototype.send = function (raw) {
        var self = this;
        var msg = JSON.parse(raw);
        var reply = function (o) { setTimeout(function () { if (self.onmessage) self.onmessage({ data: JSON.stringify(o) }); }, 80); };
        if (window.parent && window.parent !== window) {
            try { window.parent.postMessage({ type: 'webos-luna', uri: msg.uri || 'ssap register', params: msg.uri ? msg.payload : {} }, '*'); } catch (e) { /* ignore */ }
        }
        if (msg.type === 'register') {
            if (WebOSMock.ssap === 'decline') { reply({ type: 'error', id: msg.id, error: '403 User rejected pairing' }); return; }
            reply({ type: 'response', id: msg.id, payload: { pairingType: 'PROMPT', returnValue: true } });
            reply({ type: 'registered', id: msg.id, payload: { 'client-key': 'mock-key' } });
            return;
        }
        var uri = msg.uri;
        var res;
        if (uri === 'ssap://com.webos.applicationManager/listLaunchPoints') res = { returnValue: true, launchPoints: launchPoints.slice() };
        else if (uri === 'ssap://system.launcher/launch') res = { returnValue: true, id: msg.payload.id };
        else if (uri === 'ssap://tv/getExternalInputList') res = { returnValue: true, devices: inputs.slice() };
        else res = { returnValue: false, errorText: 'Unknown method' };
        reply({ type: 'response', id: msg.id, payload: res });
    };
    FakeSsap.prototype.close = function () {};
    window.WebSocket = FakeSsap;

    // Re-send subscribed answers, e.g. after WebOSMock.network changed: WebOSMock.notify().
    WebOSMock.notify = function () {
        subscribers.forEach(function (s) {
            if (s.bridge.cancelled || !s.bridge.onservicecallback) return;
            var h = handlers[s.uri];
            if (h) s.bridge.onservicecallback(JSON.stringify(h(s.params)));
        });
    };

    /*
     * Home Assistant simulator, preview only (this file returns early on the TV, see the top).
     * Address "ha.mock" in Settings → Home Assistant, any token. It answers the WebSocket API like
     * Home Assistant does for the commands js/homeassistant.js sends. Other cases from the console:
     *   HAMock.scenario = 'invalid'      token refused (auth_invalid)
     *   HAMock.scenario = 'unreachable'  nothing answers
     *   HAMock.scenario = 'nolabel'      no label "TV" and no group.tv
     *   HAMock.scenario = 'noregistry'   registries refused (unauthorized), no group.tv
     *   HAMock.scenario = 'group'        registries refused, but a YAML group group.tv
     *   HAMock.scenario = 'ok'           back to normal
     *   HAMock.scenario = 'nologbook'    logbook/event_stream unknown: "Zuletzt" falls back to history
     * then close and reopen the view (or "Verbindung prüfen"). HAMock.drop() cuts an open connection.
     *
     * The view "Sicherheit" (js/ha-view.js): areas Eingang and Terrasse carry the label "TV"; UniFi
     * Protect (doorbell "Klingel" with high channel, disabled medium channel and package camera;
     * Einfahrt with an enabled medium channel; Garten; Terrasse), UniFi Access (Haustür: door sensor,
     * opener button, doorbell), Zigbee contacts, garage door, alarm, outside light. Garten only with
     * Settings → Home Assistant → Integrationen einbeziehen → UniFi Protect. From the console:
     *   HAMock.ring(), HAMock.open(id), HAMock.close(id), HAMock.motion(id), HAMock.alarm(state)
     *   HAMock.extraCameras = 2          Carport and Hof as well (6 cameras with UniFi Protect)
     *   HAMock.onlyCameras = 1           only the first n cameras (layouts for 1 and 2)
     *   HAMock.labelPackage = true       the package camera carries the label (a tile of its own)
     *   HAMock.streamUrl = '…'           camera/stream answers with this URL (default: refused, so the
     *                                    full screen falls back to stills; real HLS only on the TV)
     *   HAMock.images, HAMock.calls      pictures made (size, bytes) and service calls received
     * Camera pictures are JPEGs in the camera's shape (garden: 180 degrees, 32:9), made on a canvas.
     *
     * Sign-in with user name and password (js/ha-auth.js): fetch to ha.mock/auth/* is answered here.
     * User "test", password "test-passwort" (anything else: wrong password). Further switches:
     *   HAMock.mfa = true                second factor, code 123456 (three wrong codes end the flow)
     *   HAMock.accessLife = 90           seconds an access token lives: short, so the renewal shows
     *   HAMock.scenario = 'cors'         the sign-in page is refused by the browser, the WebSocket answers
     *   HAMock.scenario = 'expired'      the stored sign-in is refused (renewal → 400 invalid_grant)
     *   HAMock.scenario = 'unreachable'  also makes every fetch fail
     *   HAMock.revokeAll()               as if the session was deleted in the profile (closes the socket)
     *
     * Pairing with the phone (js/ha-pair.js, integration ordiscale_tv, homeassistant/API.md):
     * /api/ordiscale_tv/pair/start and /poll are answered here. From the console:
     *   HAMock.approvePairing()          approve the newest open pairing, as on the phone (optional: the
     *                                    code; a wrong one counts, three end it as denied)
     *   HAMock.denyPairing()             tap "Ablehnen" on the phone
     *   HAMock.pairLife = 20             seconds a pairing lives (300 in Home Assistant), to see it expire
     *   HAMock.scenario = 'nopair'       integration not installed (start → 404)
     *   HAMock.scenario = 'pairoff'      pairing switched off in its options (start → 503)
     * The tokens handed out are accepted by the WebSocket and token simulators above and below.
     * Only stand-in values: nothing here is a real account or key.
     */
    var RealWebSocket = window.WebSocket;
    var MOCK_HOST = /^ha\.mock(:\d+)?$/i;

    var MIN = 60000;

    function ago(min) {
        return new Date(Date.now() - min * MIN).toISOString();
    }

    function haStates() {
        // Stand-in for the short-lived per-camera key HA puts in a camera's state; not a secret.
        var MOCK_CAMERA = 'mock';
        function st(id, state, attrs, since) {
            var t = ago(since === undefined ? 300 : since);
            return { entity_id: id, state: state, attributes: attrs, last_changed: t, last_updated: t, context: { id: 'x', parent_id: null, user_id: null } };
        }
        function cam(id, name) {
            return st(id, 'idle', { friendly_name: name, access_token: MOCK_CAMERA, supported_features: 2 });
        }
        var list = [
            st('light.decke_wohnzimmer', 'on', { friendly_name: 'Deckenlicht', brightness: 153 }),
            st('light.stehlampe', 'off', { friendly_name: 'Stehlampe' }),
            st('switch.tv_steckdose', 'on', { friendly_name: 'Soundbar-Steckdose' }),
            st('sensor.tv_steckdose_leistung', '42.7', { friendly_name: 'Soundbar-Steckdose Leistung', unit_of_measurement: 'W' }),
            st('fan.ventilator', 'off', { friendly_name: 'Ventilator' }),
            st('input_boolean.kinoabend', 'off', { friendly_name: 'Kinoabend' }),
            st('scene.filmabend', '2026-10-24T20:00:00+00:00', { friendly_name: 'Filmabend' }),
            st('script.gute_nacht', 'off', { friendly_name: 'Gute Nacht' }),
            st('cover.rollladen_wohnzimmer', 'open', { friendly_name: 'Rollladen Wohnzimmer', current_position: 100 }),
            st('climate.wohnzimmer', 'heat', { friendly_name: 'Heizung Wohnzimmer', current_temperature: 21.3, temperature: 21.5, min_temp: 7, max_temp: 30 }),
            st('sensor.temperatur_wohnzimmer', '21.34', { friendly_name: 'Temperatur', unit_of_measurement: '°C' }),
            st('light.kueche', 'on', { friendly_name: 'Küche (ohne Label)' }),
            st('automation.morgens', 'on', { friendly_name: 'Morgens (andere Domain)' }),
            // UniFi Protect: the doorbell with its high channel and the package camera of the second lens
            // (the medium channel exists but is disabled, as Protect ships it), driveway with an enabled
            // medium channel, garden, terrace.
            cam('camera.klingel_high_resolution_channel', 'Klingel High Resolution Channel'),
            cam('camera.klingel_package_camera', 'Klingel Package Camera'),
            st('event.klingel_doorbell', ago(6), { friendly_name: 'Klingel Doorbell', device_class: 'doorbell', event_types: ['ring'], event_type: 'ring' }, 6),
            st('binary_sensor.klingel_motion', 'off', { friendly_name: 'Klingel Motion', device_class: 'motion' }, 7),
            st('sensor.klingel_uptime', '12', { friendly_name: 'Klingel Uptime', unit_of_measurement: 'd' }),
            cam('camera.einfahrt_high_resolution_channel', 'Einfahrt High Resolution Channel'),
            cam('camera.einfahrt_medium_resolution_channel', 'Einfahrt Medium Resolution Channel'),
            st('binary_sensor.einfahrt_motion', 'off', { friendly_name: 'Einfahrt Motion', device_class: 'motion' }, 68),
            cam('camera.garten_high_resolution_channel', 'Garten High Resolution Channel'),
            st('binary_sensor.garten_motion', 'off', { friendly_name: 'Garten Motion', device_class: 'motion' }, 200),
            cam('camera.terrasse_high_resolution_channel', 'Terrasse High Resolution Channel'),
            // UniFi Access: door position, the opener button, its doorbell.
            st('binary_sensor.haustuer_door_position', 'off', { friendly_name: 'Haustür Door Position Sensor', device_class: 'door' }, 127),
            st('button.haustuer_unlock', ago(128), { friendly_name: 'Haustür-DoorHub Unlock' }, 128),
            st('event.haustuer_doorbell', ago(600), { friendly_name: 'Haustür Doorbell', device_class: 'doorbell', event_types: ['ring'] }, 600),
            // Contacts (Zigbee), garage door, alarm, the outside light.
            st('binary_sensor.terrassentuer', 'off', { friendly_name: 'Terrassentür', device_class: 'door' }, 25),
            st('binary_sensor.bad_fenster', 'off', { friendly_name: 'Bad-Fenster', device_class: 'window' }),
            st('binary_sensor.kuechenfenster', 'off', { friendly_name: 'Küchenfenster', device_class: 'window' }),
            st('cover.garagentor', 'closed', { friendly_name: 'Garagentor', device_class: 'garage' }, 130),
            st('alarm_control_panel.alarmanlage', 'armed_home', { friendly_name: 'Alarmanlage', code_arm_required: true }),
            st('light.aussenlicht', 'off', { friendly_name: 'Außenlicht' }),
            // A light group with the label (Settings: "Außenlampen") and a Protect flood light.
            st('light.aussenlampen', 'off', { friendly_name: 'Außenlampen', supported_color_modes: ['color_temp', 'xy'], min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 }),
            st('light.einfahrt_flutlicht', 'off', { friendly_name: 'Einfahrt Flood Light', supported_color_modes: ['brightness'] })
        ];
        // Shown only with HAMock.extraCameras (mockCameraShown).
        list.push(cam('camera.carport_high_resolution_channel', 'Carport High Resolution Channel'));
        list.push(cam('camera.hof_high_resolution_channel', 'Hof High Resolution Channel'));
        return list;
    }

    // Logbook entries of the last hours, as Home Assistant's logbook would give them.
    function haLogbook() {
        var t = function (min) { return (Date.now() - min * MIN) / 1000; };
        return [
            { when: t(130), entity_id: 'cover.garagentor', state: 'closed' },
            { when: t(128), entity_id: 'button.haustuer_unlock', state: ago(128) },
            { when: t(127.8), entity_id: 'binary_sensor.haustuer_door_position', state: 'on' },
            { when: t(127), entity_id: 'binary_sensor.haustuer_door_position', state: 'off' },
            { when: t(75), entity_id: 'binary_sensor.einfahrt_motion', state: 'on' },
            { when: t(74.5), entity_id: 'binary_sensor.einfahrt_motion', state: 'off' },
            { when: t(72), entity_id: 'binary_sensor.einfahrt_motion', state: 'on' },
            { when: t(71.5), entity_id: 'binary_sensor.einfahrt_motion', state: 'off' },
            { when: t(68), entity_id: 'binary_sensor.einfahrt_motion', state: 'on' },
            { when: t(67.5), entity_id: 'binary_sensor.einfahrt_motion', state: 'off' },
            { when: t(40), entity_id: 'binary_sensor.terrassentuer', state: 'on' },
            { when: t(25), entity_id: 'binary_sensor.terrassentuer', state: 'off' },
            { when: t(8), entity_id: 'binary_sensor.klingel_motion', state: 'on' },
            { when: t(7), entity_id: 'binary_sensor.klingel_motion', state: 'off' },
            { when: t(6), entity_id: 'event.klingel_doorbell', state: ago(6) }
        ];
    }

    function haEntity(id, labels, area, device, category, platform, disabled) {
        return {
            entity_id: id, labels: labels, area_id: area || null, device_id: device || null, disabled_by: disabled || null,
            hidden_by: null, entity_category: category || null, name: null, original_name: null, has_entity_name: !!device,
            platform: platform || 'mock'
        };
    }

    // A camera picture as the camera would send it: its own shape (16:9, the garden camera a
    // 180-degree one at 32:9), as large as asked without stretching (like Home Assistant's scaling),
    // or full size without width/height (UniFi Protect's high channel: 4K, the 180-degree 7680x2160).
    // No writing in it: a calm outdoor scene with some texture, so the file size is realistic.
    // HAMock.images keeps size, bytes and the time it took to make, for comparisons.
    function cameraPicture(id, width, height) {
        var wide = /garten/.test(id);
        var aspect = wide ? 32 / 9 : 16 / 9;
        var w = Math.round(width) || (wide ? 7680 : 3840);
        var h = Math.round(height) || Math.round(w / aspect);
        if (w / h > aspect) w = Math.round(h * aspect); else h = Math.round(w / aspect);
        var t0 = performance.now();
        var c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        var g = c.getContext('2d');
        var hue = 0;
        for (var i = 0; i < id.length; i++) hue = (hue * 31 + id.charCodeAt(i)) % 360;
        hue = 80 + hue % 80;   // greens to teal
        var sky = g.createLinearGradient(0, 0, 0, h * 0.45);
        sky.addColorStop(0, '#5d7c99');
        sky.addColorStop(1, '#a9bccb');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, h * 0.45);
        var ground = g.createLinearGradient(0, h * 0.45, 0, h);
        ground.addColorStop(0, 'hsl(' + hue + ', 22%, 34%)');
        ground.addColorStop(1, 'hsl(' + hue + ', 18%, 18%)');
        g.fillStyle = ground;
        g.fillRect(0, h * 0.45, w, h * 0.55);
        var seed = 7;
        function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
        // A house front and a path, then leaves and gravel.
        g.fillStyle = '#c9c2b6';
        g.fillRect(w * 0.08, h * 0.22, w * 0.3, h * 0.33);
        g.fillStyle = '#6b4f3a';
        g.fillRect(w * 0.2, h * 0.34, w * 0.05, h * 0.21);
        g.fillStyle = '#8d8a84';
        g.beginPath();
        g.moveTo(w * 0.21, h * 0.55);
        g.lineTo(w * 0.24, h * 0.55);
        g.lineTo(w * 0.45, h);
        g.lineTo(w * 0.05, h);
        g.closePath();
        g.fill();
        for (var k = 0; k < 1400; k++) {
            var y = h * (0.42 + rnd() * 0.58);
            g.fillStyle = 'hsla(' + Math.round(hue + rnd() * 40 - 20) + ', 28%, ' + Math.round(14 + rnd() * 30) + '%, 0.7)';
            g.fillRect(rnd() * w, y, (0.003 + rnd() * 0.012) * w, (0.004 + rnd() * 0.02) * h);
        }
        var url = c.toDataURL('image/jpeg', 0.8);
        HAMock.images.push({ id: id, w: w, h: h, bytes: Math.round((url.length - 23) * 3 / 4), makeMs: Math.round(performance.now() - t0) });
        if (HAMock.images.length > 200) HAMock.images.shift();
        return url;
    }

    var HAMock = window.HAMock = {
        scenario: 'ok',
        handles: function (host) { return MOCK_HOST.test(host || ''); },
        cameraUrl: function (id, width, height) { return cameraPicture(id, width, height); },
        images: [],
        extraCameras: 0,        // 1 or 2: a carport and a yard camera more (UniFi Protect)
        onlyCameras: 0,         // > 0: only that many cameras in the answers (layouts for 1 and 2)
        labelPackage: false,    // true: the doorbell's package camera carries the label itself
        streamUrl: null,        // camera/stream answers with this URL instead of an error
        calls: [],              // service calls received, newest last
        logbook: null,
        states: null,
        last: null,
        mfa: false,
        accessLife: 90,
        flows: {},
        codes: {},
        // refresh token -> { name, client }; kept across reloads of the preview (sessionStorage), as Home
        // Assistant keeps its sessions across a restart of the launcher
        refreshTokens: (function () {
            try {
                return JSON.parse(sessionStorage.getItem('hamock.refresh')) || {};
            } catch (e) {
                return {};
            }
        })(),
        keep: function () {
            try {
                sessionStorage.setItem('hamock.refresh', JSON.stringify(HAMock.refreshTokens));
            } catch (e) {
                // Private mode: sessions end with the page.
            }
        },
        accessTokens: {},       // access token -> { until, refresh }
        pairLife: 300,
        pairings: {},           // pairing id -> { secret, code, name, until, status, attempts }
        pairStarts: 0,          // start requests, for checking that a closed view stops asking
        pairPolls: 0,           // poll requests, likewise
        // The newest pairing still open, as the approval page on the phone would show it.
        openPairing: function () {
            var ids = Object.keys(HAMock.pairings).filter(function (id) {
                var p = HAMock.pairings[id];
                return p.status === 'pending' && p.until > Date.now();
            });
            return ids.length ? HAMock.pairings[ids[ids.length - 1]] : null;
        },
        approvePairing: function (code) {
            var p = HAMock.openPairing();
            if (!p) return 'not_found';
            if (code !== undefined && String(code).replace(/[\s-]/g, '').toUpperCase() !== p.code) {
                if (--p.attempts <= 0) p.status = 'denied';
                return p.status === 'denied' ? 'denied' : 'invalid_code';
            }
            p.status = 'approved';
            // As in the integration: an approval near the end still gets 30 s to be picked up.
            p.until = Math.max(p.until, Date.now() + 30000);
            return 'approved';
        },
        denyPairing: function () {
            var p = HAMock.openPairing();
            if (!p) return 'not_found';
            p.status = 'denied';
            return 'denied';
        },
        validAccess: function (token) {
            var a = HAMock.accessTokens[token];
            return !!(a && a.until > Date.now() && HAMock.refreshTokens[a.refresh]);
        },
        revokeAll: function () {
            HAMock.refreshTokens = {};
            HAMock.accessTokens = {};
            HAMock.keep();
            var s = HAMock.last;
            if (s && s.refresh && s.readyState === 1) s.close();
        },
        // As if Home Assistant restarted: the open connection goes away without a goodbye.
        drop: function () {
            var s = HAMock.last;
            if (!s || s.readyState !== 1) return false;
            s.readyState = 3;
            if (s.onclose) s.onclose({ code: 1006 });
            return true;
        }
    };

    function dev(id, name, area, labels, maker) {
        return { id: id, area_id: area, labels: labels || [], name: name, name_by_user: null, manufacturer: maker || null };
    }

    // HAMock.onlyCameras: the first n cameras stay, the others are as if not there.
    var CAMERA_ORDER = ['klingel', 'einfahrt', 'terrasse', 'garten', 'carport', 'hof'];

    function mockCameraShown(x) {
        var id = x.entity_id;
        if (!/^camera\./.test(id)) return true;
        var base = id.replace(/^camera\./, '').replace(/_(high|medium|low)_resolution_channel$|_package_camera$/, '');
        var i = CAMERA_ORDER.indexOf(base);
        if (i >= 4 && i - 4 >= HAMock.extraCameras) return false;
        return !HAMock.onlyCameras || i < HAMock.onlyCameras;
    }

    // Events from the console, on the open connection (the cockpit must be open):
    //   HAMock.ring()                         the doorbell (Protect); HAMock.ring('event.haustuer_doorbell')
    //   HAMock.open('binary_sensor.terrassentuer'), HAMock.close(id)   doors, windows, the garage
    //   HAMock.motion('binary_sensor.einfahrt_motion')
    //   HAMock.alarm('triggered' | 'armed_away' | 'disarmed')
    function act(fn) {
        var s = HAMock.last;
        if (!s || s.readyState !== 1) return 'nicht verbunden (Ansicht "Sicherheit" öffnen)';
        fn(s);
        return 'ok';
    }
    HAMock.ring = function (id) {
        return act(function (s) { s.change(id || 'event.klingel_doorbell', new Date().toISOString(), { event_type: 'ring' }); });
    };
    HAMock.open = function (id) {
        return act(function (s) { s.change(id, /^cover\./.test(id) ? 'open' : 'on'); });
    };
    HAMock.close = function (id) {
        return act(function (s) { s.change(id, /^cover\./.test(id) ? 'closed' : 'off'); });
    };
    HAMock.motion = function (id) {
        return act(function (s) {
            s.change(id, 'on');
            setTimeout(function () { s.change(id, 'off'); }, 3000);
        });
    };
    HAMock.alarm = function (state) {
        return act(function (s) { s.change('alarm_control_panel.alarmanlage', state || 'triggered'); });
    };

    function FakeHA(url) {
        var self = this;
        this.url = url;
        this.readyState = 0;
        this.subs = [];
        this.logbookSubs = [];
        var scenario = HAMock.scenario;
        this.scenario = scenario;
        HAMock.last = this;
        if (!HAMock.states) HAMock.states = haStates();
        if (!HAMock.logbook) HAMock.logbook = haLogbook();
        setTimeout(function () {
            if (scenario === 'unreachable') {
                self.readyState = 3;
                if (self.onerror) self.onerror({});
                if (self.onclose) self.onclose({ code: 1006 });
                return;
            }
            self.readyState = 1;
            if (self.onopen) self.onopen({});
            self.reply({ type: 'auth_required', ha_version: '2026.10.0' });
        }, 200);
    }

    FakeHA.prototype.reply = function (msg) {
        var self = this;
        setTimeout(function () {
            if (self.readyState === 1 && self.onmessage) self.onmessage({ data: JSON.stringify(msg) });
        }, 40);
    };

    FakeHA.prototype.close = function () {
        if (this.readyState === 3) return;
        this.readyState = 3;
        var self = this;
        setTimeout(function () { if (self.onclose) self.onclose({ code: 1000 }); }, 0);
    };

    FakeHA.prototype.result = function (id, result) {
        this.reply({ id: id, type: 'result', success: true, result: result });
    };

    FakeHA.prototype.error = function (id, code, message) {
        this.reply({ id: id, type: 'result', success: false, error: { code: code, message: message } });
    };

    FakeHA.prototype.change = function (id, state, attrs) {
        var list = HAMock.states;
        var s = list.find(function (x) { return x.entity_id === id; });
        if (!s) return;
        var self = this;
        var old = JSON.parse(JSON.stringify(s));
        var now = new Date().toISOString();
        if (s.state !== state) {
            s.last_changed = now;
            var entry = { when: Date.now() / 1000, entity_id: id, state: state };
            HAMock.logbook.push(entry);
            this.logbookSubs.forEach(function (sub) {
                if (sub.ids.indexOf(id) >= 0) self.reply({ id: sub.id, type: 'event', event: { events: [entry] } });
            });
        }
        s.last_updated = now;
        s.state = state;
        if (attrs) Object.keys(attrs).forEach(function (k) { s.attributes[k] = attrs[k]; });
        this.subs.forEach(function (sub) {
            self.reply({ id: sub, type: 'event', event: { event_type: 'state_changed', data: { entity_id: id, old_state: old, new_state: JSON.parse(JSON.stringify(s)) }, origin: 'LOCAL', time_fired: new Date().toISOString(), context: { id: 'x', parent_id: null, user_id: null } } });
        });
    };

    FakeHA.prototype.state = function (id) {
        return HAMock.states.find(function (x) { return x.entity_id === id; });
    };

    FakeHA.prototype.service = function (msg) {
        var id = msg.target && msg.target.entity_id;
        var s = this.state(id);
        var self = this;
        if (!s) return 'not_found';
        var svc = msg.domain + '.' + msg.service;
        HAMock.calls.push({ service: svc, entity_id: id, at: Date.now() });
        if (msg.service === 'toggle') {
            var on = s.state !== 'on';
            this.change(id, on ? 'on' : 'off', msg.domain === 'light' ? { brightness: on ? 200 : null } : null);
        } else if (svc === 'light.turn_on' || svc === 'light.turn_off') {
            var d = msg.service_data || {};
            var b = msg.service === 'turn_off' ? null : d.brightness || (d.brightness_pct ? Math.round(d.brightness_pct * 2.55) : s.attributes.brightness || 200);
            this.change(id, msg.service === 'turn_off' ? 'off' : 'on', { brightness: b, color_temp_kelvin: d.color_temp_kelvin || s.attributes.color_temp_kelvin });
        } else if (svc === 'scene.turn_on') {
            this.change(id, new Date().toISOString());
        } else if (svc === 'script.turn_on') {
            this.change(id, 'on');
            setTimeout(function () { self.change(id, 'off'); }, 1500);
        } else if (msg.domain === 'cover') {
            if (msg.service === 'stop_cover') this.change(id, 'open', { current_position: 50 });
            else {
                var opening = msg.service === 'open_cover';
                this.change(id, opening ? 'opening' : 'closing');
                setTimeout(function () { self.change(id, opening ? 'open' : 'closed', { current_position: opening ? 100 : 0 }); }, 1500);
            }
        } else if (svc === 'climate.set_temperature') {
            this.change(id, s.state, { temperature: msg.service_data.temperature });
        } else if (svc === 'button.press') {
            this.change(id, new Date().toISOString());
            // The UniFi Access opener: the door opens for a few seconds.
            if (id === 'button.haustuer_unlock') {
                setTimeout(function () { self.change('binary_sensor.haustuer_door_position', 'on'); }, 1200);
                setTimeout(function () { self.change('binary_sensor.haustuer_door_position', 'off'); }, 6000);
            }
        } else if (svc === 'lock.unlock' || svc === 'lock.lock' || svc === 'lock.open') {
            this.change(id, msg.service === 'lock' ? 'locked' : msg.service === 'open' ? 'open' : 'unlocked');
        } else {
            return 'not_found';
        }
        return null;
    };

    FakeHA.prototype.send = function (text) {
        var msg = JSON.parse(text);
        var scenario = this.scenario;
        var registryRefused = scenario === 'noregistry' || scenario === 'group';
        if (msg.type === 'auth') {
            // Issued by the sign-in below: must be known and not run out. Any other text counts as a
            // long-lived token, as before.
            var issued = /^mock-access-/.test(msg.access_token || '');
            if (issued && HAMock.validAccess(msg.access_token)) {
                this.refresh = HAMock.accessTokens[msg.access_token].refresh;
                this.userName = HAMock.refreshTokens[this.refresh].name;
            } else {
                this.userName = 'TV';
            }
            if (scenario === 'invalid' || !msg.access_token || (issued && !this.refresh)) {
                this.reply({ type: 'auth_invalid', message: 'Invalid access token or password' });
                var self = this;
                setTimeout(function () { self.close(); }, 80);
            } else {
                this.reply({ type: 'auth_ok', ha_version: '2026.10.0' });
            }
            return;
        }
        if (/^config\//.test(msg.type) && registryRefused) {
            this.error(msg.id, 'unauthorized', 'Unauthorized');
            return;
        }
        var tv = scenario === 'nolabel' ? [] : ['tv'];
        switch (msg.type) {
            case 'ping':
                this.reply({ id: msg.id, type: 'pong' });
                return;
            case 'auth/current_user':
                this.result(msg.id, { id: 'mock-user', name: this.userName, is_owner: false, is_admin: false, credentials: [], mfa_modules: [] });
                return;
            case 'get_states':
                var states = HAMock.states.filter(mockCameraShown);
                if (scenario === 'group') {
                    states.push({ entity_id: 'group.tv', state: 'on', attributes: { friendly_name: 'TV', entity_id: ['light.stehlampe', 'scene.filmabend', 'camera.klingel_high_resolution_channel'] } });
                }
                this.result(msg.id, states);
                return;
            case 'camera/stream':
                // Live video only on the TV: here the stream is refused (or a URL that cannot play).
                if (HAMock.streamUrl) this.result(msg.id, { url: HAMock.streamUrl });
                else this.error(msg.id, 'start_stream_failed', 'Stream not available (simulator)');
                return;
            case 'logbook/event_stream':
                if (scenario === 'nologbook') break;
                var since = Date.parse(msg.start_time) / 1000;
                var wanted = msg.entity_ids || [];
                this.result(msg.id, null);
                this.logbookSubs.push({ id: msg.id, ids: wanted });
                this.reply({ id: msg.id, type: 'event', event: {
                    events: HAMock.logbook.filter(function (e) { return e.when >= since && wanted.indexOf(e.entity_id) >= 0; }),
                    start_time: since, end_time: Date.now() / 1000, partial: true
                } });
                return;
            case 'history/history_during_period':
                var from = Date.parse(msg.start_time) / 1000;
                var out = {};
                HAMock.logbook.forEach(function (e) {
                    if (e.when < from || (msg.entity_ids || []).indexOf(e.entity_id) < 0) return;
                    (out[e.entity_id] = out[e.entity_id] || []).push({ s: e.state, lu: e.when });
                });
                this.result(msg.id, out);
                return;
            case 'config/label_registry/list':
                this.result(msg.id, [
                    { label_id: scenario === 'nolabel' ? 'kino' : 'tv', name: scenario === 'nolabel' ? 'Kino' : 'TV', color: null, description: null, icon: null },
                    { label_id: 'kueche', name: 'Küche', color: null, description: null, icon: null }
                ]);
                return;
            case 'config/entity_registry/list':
                var P = 'unifiprotect';
                var A = 'unifi_access';
                this.result(msg.id, [
                    haEntity('light.decke_wohnzimmer', tv, 'wohnzimmer', null, null, 'hue'),
                    haEntity('light.stehlampe', tv, null, 'dev_lampe', null, 'hue'),
                    // The plug carries the label on its device: its switch shows, its power sensor
                    // (diagnostic) does not.
                    haEntity('switch.tv_steckdose', [], null, 'dev_plug', null, 'shelly'),
                    haEntity('sensor.tv_steckdose_leistung', [], null, 'dev_plug', 'diagnostic', 'shelly'),
                    haEntity('fan.ventilator', tv, 'wohnzimmer'),
                    haEntity('input_boolean.kinoabend', tv, null, null, null, 'input_boolean'),
                    haEntity('scene.filmabend', tv, null, null, null, 'homeassistant'),
                    haEntity('script.gute_nacht', tv, null, null, null, 'script'),
                    haEntity('cover.rollladen_wohnzimmer', tv, 'wohnzimmer', null, null, 'shelly'),
                    haEntity('climate.wohnzimmer', tv, 'wohnzimmer', null, null, 'tado'),
                    haEntity('sensor.temperatur_wohnzimmer', tv, 'wohnzimmer', null, null, 'tado'),
                    haEntity('light.kueche', ['kueche'], 'kueche', null, null, 'hue'),
                    haEntity('automation.morgens', tv, null, null, null, 'automation'),
                    haEntity('camera.klingel_high_resolution_channel', [], null, 'dev_klingel', null, P),
                    haEntity('camera.klingel_medium_resolution_channel', [], null, 'dev_klingel', null, P, 'integration'),
                    haEntity('camera.klingel_package_camera', HAMock.labelPackage ? ['tv'] : [], null, 'dev_klingel', null, P),
                    haEntity('event.klingel_doorbell', [], null, 'dev_klingel', null, P),
                    haEntity('binary_sensor.klingel_motion', [], null, 'dev_klingel', null, P),
                    haEntity('sensor.klingel_uptime', [], null, 'dev_klingel', 'diagnostic', P),
                    haEntity('camera.einfahrt_high_resolution_channel', [], null, 'dev_einfahrt', null, P),
                    haEntity('camera.einfahrt_medium_resolution_channel', [], null, 'dev_einfahrt', null, P),
                    haEntity('binary_sensor.einfahrt_motion', [], null, 'dev_einfahrt', null, P),
                    haEntity('camera.garten_high_resolution_channel', [], null, 'dev_garten', null, P),
                    haEntity('binary_sensor.garten_motion', [], null, 'dev_garten', null, P),
                    haEntity('camera.terrasse_high_resolution_channel', [], null, 'dev_terrasse', null, P),
                    haEntity('camera.carport_high_resolution_channel', [], null, 'dev_carport', null, P),
                    haEntity('camera.hof_high_resolution_channel', [], null, 'dev_hof', null, P),
                    haEntity('binary_sensor.haustuer_door_position', [], null, 'dev_access', null, A),
                    haEntity('button.haustuer_unlock', [], null, 'dev_access', null, A),
                    haEntity('event.haustuer_doorbell', [], null, 'dev_access', null, A),
                    haEntity('binary_sensor.terrassentuer', [], 'terrasse', null, null, 'zha'),
                    haEntity('binary_sensor.bad_fenster', tv, 'bad', null, null, 'zha'),
                    haEntity('binary_sensor.kuechenfenster', [], 'kueche', null, null, 'zha'),
                    haEntity('cover.garagentor', tv, 'garage', null, null, 'shelly'),
                    haEntity('alarm_control_panel.alarmanlage', tv, 'flur'),
                    haEntity('light.aussenlicht', [], 'eingang', null, null, 'hue'),
                    haEntity('light.aussenlampen', tv, null, null, null, 'group'),
                    haEntity('light.einfahrt_flutlicht', [], 'eingang', null, null, 'unifiprotect')
                ].filter(function (e) { return mockCameraShown(e); }));
                return;
            case 'config/device_registry/list':
                this.result(msg.id, [
                    dev('dev_lampe', 'Stehlampe', 'wohnzimmer'),
                    dev('dev_plug', 'Steckdose', 'wohnzimmer', tv),
                    dev('dev_klingel', 'Klingel', 'eingang', [], 'Ubiquiti'),
                    dev('dev_einfahrt', 'Einfahrt', 'eingang', [], 'Ubiquiti'),
                    dev('dev_garten', 'Garten', 'garten', [], 'Ubiquiti'),
                    dev('dev_terrasse', 'Terrasse', 'terrasse', [], 'Ubiquiti'),
                    dev('dev_carport', 'Carport', 'garage', [], 'Ubiquiti'),
                    dev('dev_hof', 'Hof', 'garage', [], 'Ubiquiti'),
                    dev('dev_access', 'Haustür', 'eingang', [], 'Ubiquiti')
                ]);
                return;
            case 'config/area_registry/list':
                // The label "TV" on two areas: everything in Eingang and Terrasse shows.
                this.result(msg.id, [
                    { area_id: 'wohnzimmer', name: 'Wohnzimmer', labels: [] }, { area_id: 'flur', name: 'Flur', labels: [] },
                    { area_id: 'garten', name: 'Garten', labels: [] }, { area_id: 'kueche', name: 'Küche', labels: [] },
                    { area_id: 'eingang', name: 'Eingang', labels: tv }, { area_id: 'terrasse', name: 'Terrasse', labels: tv },
                    { area_id: 'garage', name: 'Garage', labels: [] }, { area_id: 'bad', name: 'Bad', labels: [] }
                ]);
                return;
            case 'subscribe_events':
                this.subs.push(msg.id);
                this.result(msg.id, null);
                return;
            case 'unsubscribe_events':
                this.subs = this.subs.filter(function (x) { return x !== msg.subscription; });
                this.logbookSubs = this.logbookSubs.filter(function (x) { return x.id !== msg.subscription; });
                this.result(msg.id, null);
                return;
            case 'call_service':
                var err = this.service(msg);
                if (err) this.error(msg.id, err, 'Service not found');
                else this.result(msg.id, { context: { id: 'x', parent_id: null, user_id: null } });
                return;
        }
        this.error(msg.id, 'unknown_command', 'Unknown command.');
    };

    // ---------- Sign-in endpoints (HTTP), answered like Home Assistant's auth API

    function mockId(kind) {
        return 'mock-' + kind + '-' + Math.random().toString(36).slice(2, 12);
    }

    function sameHost(a, b) {
        var m1 = /^(https?:\/\/[^\/]+)/i.exec(a || '');
        var m2 = /^(https?:\/\/[^\/]+)/i.exec(b || '');
        return !!(m1 && m2 && m1[1].toLowerCase() === m2[1].toLowerCase());
    }

    function formStep(flow, errors) {
        var step = { type: 'form', flow_id: flow.id, handler: ['homeassistant', null], step_id: flow.step, errors: errors || {}, description_placeholders: null, last_step: null, preview: null };
        if (flow.step === 'init') step.data_schema = [{ name: 'username', type: 'string', required: true }, { name: 'password', type: 'string', required: true }];
        else {
            step.data_schema = [{ name: 'code', type: 'string', required: true }];
            step.description_placeholders = { mfa_module_name: 'Authenticator-App', mfa_module_id: 'totp' };
        }
        return { status: 200, body: step };
    }

    function issue(refresh) {
        var access = mockId('access');
        HAMock.accessTokens[access] = { until: Date.now() + HAMock.accessLife * 1000, refresh: refresh };
        return access;
    }

    function revoke(token) {
        if (!HAMock.refreshTokens[token]) return;
        delete HAMock.refreshTokens[token];
        HAMock.keep();
        Object.keys(HAMock.accessTokens).forEach(function (a) {
            if (HAMock.accessTokens[a].refresh === token) delete HAMock.accessTokens[a];
        });
        // Home Assistant closes the connections of a revoked session.
        var s = HAMock.last;
        if (s && s.refresh === token && s.readyState === 1) s.close();
    }

    // ---------- Pairing endpoints (HTTP), answered like the integration ordiscale_tv

    var PAIR_CLIENT = 'https://ordiscale.de/tv-launcher/';
    var PAIR_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

    function pairCode() {
        var c = '';
        for (var i = 0; i < 6; i++) c += PAIR_CHARS.charAt(Math.floor(Math.random() * PAIR_CHARS.length));
        return c;
    }

    function mockRandom(n) {
        var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        var s = '';
        for (var i = 0; i < n; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
        return s;
    }

    function haPair(path, method, text) {
        var scenario = HAMock.scenario;
        if (scenario === 'nopair') return { status: 404, body: null };
        if (method !== 'POST') return { status: 405, body: null };
        var data;
        try {
            data = JSON.parse(text || '{}');
        } catch (e) {
            return { status: 400, body: { error: 'invalid_request' } };
        }
        if (path === '/api/ordiscale_tv/pair/start') {
            HAMock.pairStarts++;
            if (scenario === 'pairoff') return { status: 503, body: { error: 'pairing_disabled' } };
            var id = mockRandom(32);
            HAMock.pairings[id] = {
                secret: mockRandom(43), code: pairCode(), name: String(data.name || '').slice(0, 40),
                until: Date.now() + HAMock.pairLife * 1000, status: 'pending', attempts: 3
            };
            var p = HAMock.pairings[id];
            return { status: 200, body: { pairing_id: id, poll_secret: p.secret, user_code: p.code, approve_url: '/ordiscale-tv-pair/' + id, expires_in: HAMock.pairLife, interval: 2 } };
        }
        if (path === '/api/ordiscale_tv/pair/poll') {
            HAMock.pairPolls++;
            if (!data.pairing_id || !data.poll_secret) return { status: 400, body: { error: 'invalid_request' } };
            var q = HAMock.pairings[data.pairing_id];
            if (!q || q.secret !== data.poll_secret || q.until <= Date.now() || scenario === 'pairoff') {
                if (q && q.until <= Date.now()) delete HAMock.pairings[data.pairing_id];
                return { status: 410, body: { status: 'expired' } };
            }
            if (q.status === 'denied') {
                delete HAMock.pairings[data.pairing_id];
                return { status: 200, body: { status: 'denied' } };
            }
            if (q.status !== 'approved') return { status: 200, body: { status: 'pending' } };
            // Handed out exactly once, then the pairing is gone.
            delete HAMock.pairings[data.pairing_id];
            var refresh = mockId('refresh');
            HAMock.refreshTokens[refresh] = { name: 'Ordiscale TV', client: PAIR_CLIENT };
            HAMock.keep();
            return { status: 200, body: { status: 'approved', client_id: PAIR_CLIENT, refresh_token: refresh, access_token: issue(refresh), token_type: 'Bearer', expires_in: HAMock.accessLife } };
        }
        return { status: 404, body: null };
    }

    // Returns { status, body } or null for a request that fails in the network (as fetch would).
    function haAuth(path, method, text) {
        var scenario = HAMock.scenario;
        if (scenario === 'unreachable') return null;
        if (path.indexOf('/api/ordiscale_tv/') === 0) return haPair(path, method, text);
        var flowMatch = /^\/auth\/login_flow\/([^\/]+)$/.exec(path);
        if (path === '/auth/login_flow' || flowMatch) {
            // Not CORS-enabled in Home Assistant: a browser that enforces CORS gets nothing back.
            if (scenario === 'cors') return null;
            if (method === 'DELETE' && flowMatch) {
                delete HAMock.flows[decodeURIComponent(flowMatch[1])];
                return { status: 200, body: { message: 'Flow aborted' } };
            }
            if (method !== 'POST') return { status: 405, body: null };
            var data = JSON.parse(text || '{}');
            if (!data.client_id || !/^https?:\/\/[a-z]/i.test(data.client_id)) return { status: 400, body: { message: 'Invalid client id' } };
            if (!flowMatch) {
                if (!Array.isArray(data.handler) || data.handler[0] !== 'homeassistant') return { status: 404, body: { message: 'Invalid handler specified' } };
                var created = { id: mockId('flow').replace(/-/g, ''), step: 'init', redirect: data.redirect_uri, tries: 0 };
                HAMock.flows[created.id] = created;
                return formStep(created);
            }
            var flow = HAMock.flows[decodeURIComponent(flowMatch[1])];
            if (!flow) return { status: 404, body: { message: 'Invalid flow specified' } };
            var ok = false;
            if (flow.step === 'init') {
                if (data.username !== 'test' || data.password !== 'test-passwort') return formStep(flow, { base: 'invalid_auth' });
                if (HAMock.mfa) {
                    flow.step = 'mfa';
                    return formStep(flow);
                }
                ok = true;
            } else if (data.code === '123456') {
                ok = true;
            } else if (++flow.tries >= 3) {
                delete HAMock.flows[flow.id];
                return { status: 200, body: { type: 'abort', flow_id: flow.id, handler: ['homeassistant', null], reason: 'too_many_retry', description_placeholders: null } };
            } else {
                return formStep(flow, { base: 'invalid_code' });
            }
            if (ok) {
                // Home Assistant checks the redirect_uri only here (indieauth.verify_redirect_uri).
                if (!sameHost(data.client_id, flow.redirect)) return { status: 403, body: { message: 'Invalid redirect URI' } };
                delete HAMock.flows[flow.id];
                var code = mockId('code');
                HAMock.codes[code] = { client: data.client_id, name: 'Test' };
                return { status: 200, body: { type: 'create_entry', flow_id: flow.id, handler: ['homeassistant', null], result: code, title: '', version: 1, description: null, description_placeholders: null } };
            }
        }
        var form = new URLSearchParams(text || '');
        if (path === '/auth/revoke' || (path === '/auth/token' && form.get('action') === 'revoke')) {
            revoke(form.get('token'));
            return { status: 200, body: undefined };
        }
        if (path === '/auth/token') {
            var grant = form.get('grant_type');
            if (grant === 'authorization_code') {
                var entry = HAMock.codes[form.get('code')];
                delete HAMock.codes[form.get('code')];
                if (!entry || entry.client !== form.get('client_id')) return { status: 400, body: { error: 'invalid_request', error_description: 'Invalid code' } };
                var refresh = mockId('refresh');
                HAMock.refreshTokens[refresh] = { name: entry.name, client: entry.client };
                HAMock.keep();
                return { status: 200, body: { access_token: issue(refresh), token_type: 'Bearer', refresh_token: refresh, expires_in: HAMock.accessLife, ha_auth_provider: 'homeassistant' } };
            }
            if (grant === 'refresh_token') {
                var known = HAMock.refreshTokens[form.get('refresh_token')];
                if (scenario === 'expired' || !known) return { status: 400, body: { error: 'invalid_grant' } };
                if (known.client !== form.get('client_id')) return { status: 400, body: { error: 'invalid_request' } };
                return { status: 200, body: { access_token: issue(form.get('refresh_token')), token_type: 'Bearer', expires_in: HAMock.accessLife } };
            }
            return { status: 400, body: { error: 'unsupported_grant_type' } };
        }
        return { status: 404, body: null };
    }

    var realFetch = window.fetch;
    if (realFetch) {
        window.fetch = function (input, init) {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            var m = /^https?:\/\/([^\/?#]+)([^?#]*)/i.exec(url);
            if (!m || !MOCK_HOST.test(m[1])) return realFetch.apply(this, arguments);
            init = init || {};
            var path = m[2].replace(/^.*?(\/auth\/)/, '/auth/');
            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    var r = haAuth(path, (init.method || 'GET').toUpperCase(), init.body);
                    if (!r) {
                        reject(new TypeError('Failed to fetch'));
                        return;
                    }
                    resolve(new Response(r.body === undefined || r.body === null ? '' : JSON.stringify(r.body), {
                        status: r.status, headers: { 'Content-Type': 'application/json' }
                    }));
                }, 150);
            });
        };
    }

    if (RealWebSocket) {
        window.WebSocket = function (url, protocols) {
            var m = /^wss?:\/\/([^\/]+)\//i.exec(url);
            if (m && MOCK_HOST.test(m[1])) return new FakeHA(url);
            return protocols === undefined ? new RealWebSocket(url) : new RealWebSocket(url, protocols);
        };
    }
})();

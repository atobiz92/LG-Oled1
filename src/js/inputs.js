/*
 * HDMI inputs and the TV tuner on LG webOS. Same interface as the Tizen version of the UI kit.
 *
 * Switching: every input is an app of its own on webOS (com.webos.app.hdmi1 … hdmi4, live TV
 * com.webos.app.livetv); launching it switches the TV, so there is no separate "set source" step and
 * no picture inside the launcher ('inapp' falls back to 'external').
 * Status: luna://com.webos.service.eim/getAllInputStatus reports which ports have a signal; refused to
 * a developer-mode app, the same comes from LG Connect Apps (js/ssap.js, tv/getExternalInputList).
 * Without either, every port of the B8 counts as present but unplugged.
 */
(function () {
    'use strict';

    var EIM = 'luna://com.webos.service.eim/';
    var TUNER_APP = 'com.webos.app.livetv';
    // The OLED55B8PLA has four HDMI ports and a tuner (cable, satellite, antenna).
    var PORTS = [1, 2, 3, 4];

    var currentSrc = null;

    function call(promise, what) {
        return Apps.withTimeout(promise, 8000, what);
    }

    function hdmiApp(n) {
        return 'com.webos.app.hdmi' + n;
    }

    // { connected: [{ type, number }], disconnected: [...] }, as the Tizen version returns it.
    function toSources(devices) {
        var info = { connected: [{ type: 'TV', number: 1 }], disconnected: [] };
        (devices || []).forEach(function (d) {
            var m = /hdmi\D*(\d+)/i.exec(d.id || d.appId || '');
            if (!m) return;
            var s = { type: 'HDMI', number: Number(m[1]) };
            (d.connected || d.activate ? info.connected : info.disconnected).push(s);
        });
        return info;
    }

    function sources() {
        return call(Platform.call(EIM + 'getAllInputStatus', {}, 6000), 'Eingangsliste').then(function (res) {
            return toSources(res.devices);
        }).catch(function (err) {
            DevLog.log('Input status over Luna refused (' + DevLog.errorText(err) + '): asking LG Connect Apps');
            return Ssap.request('ssap://tv/getExternalInputList', {}, 6000).then(function (res) {
                return toSources(res.devices);
            });
        }).catch(function (err) {
            DevLog.log('Input status unavailable (' + DevLog.errorText(err) + '): assuming HDMI 1-4, none plugged in');
            return {
                connected: [{ type: 'TV', number: 1 }],
                disconnected: PORTS.map(function (n) { return { type: 'HDMI', number: n }; })
            };
        });
    }

    function describeSource(s) {
        return s ? s.type + (s.type === 'TV' ? '' : ' ' + s.number) : 'unknown';
    }

    function current() {
        return currentSrc;
    }

    // Returns { 1: true, 2: false, ... } for HDMI ports the TV reports.
    function hdmiStatus() {
        return status().then(function (s) { return s.hdmi; });
    }

    // HDMI ports and the TV's own tuner in one read: the Home tiles need both.
    function status() {
        return sources().then(function (info) {
            var all = (info.connected || []).concat(info.disconnected || []);
            var hdmi = {};
            (info.disconnected || []).forEach(function (s) { if (s.type === 'HDMI') hdmi[s.number] = false; });
            (info.connected || []).forEach(function (s) { if (s.type === 'HDMI') hdmi[s.number] = true; });
            return { hdmi: hdmi, tv: all.some(function (s) { return s.type === 'TV'; }) };
        });
    }

    // Launching the input's app is the switch. 'switch', 'switch+viewer' and 'inapp' all end there.
    function openApp(appId, src, method) {
        if (method === 'inapp') DevLog.log('Input inside the launcher is not possible on webOS: switching instead');
        return Apps.launch(appId).then(function () {
            currentSrc = src;
            return 'external';
        });
    }

    function open(hdmi, method) {
        if (PORTS.indexOf(hdmi) < 0) return Promise.reject(new Error('HDMI ' + hdmi + ' gibt es an diesem TV nicht'));
        return openApp(hdmiApp(hdmi), { type: 'HDMI', number: hdmi }, method);
    }

    function openTuner(method) {
        return openApp(TUNER_APP, { type: 'TV', number: 1 }, method);
    }

    // Nothing is shown inside the launcher on webOS, so there is nothing to hide.
    function hide() {
        return Promise.resolve();
    }

    function openViewer() {
        return Apps.launch(TUNER_APP);
    }

    window.Inputs = {
        sources: sources,
        hdmiStatus: hdmiStatus,
        status: status,
        current: current,
        describeSource: describeSource,
        open: open,
        openTuner: openTuner,
        hide: hide,
        openViewer: openViewer
    };
})();

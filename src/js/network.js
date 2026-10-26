/*
 * Network status on LG webOS (luna://com.palm.connectionmanager/getStatus, read-only).
 * Same interface as the Tizen version of the UI kit; only the reading of the status is new, the
 * texts and icons below are the kit's.
 *
 * The connection manager answers once and then on every change (subscription); status() returns the
 * last answer, so Home can call it with the clock. It reports no Wi-Fi signal strength, so the icon
 * shows full bars while connected (am TV prüfen: whether the B8 adds a signal level).
 * Read-only on purpose: no web API on a consumer TV switches Wi-Fi or Bluetooth.
 */
(function () {
    'use strict';

    var CM = 'luna://com.palm.connectionmanager/getStatus';

    var last = null;        // last status object, null until the TV answered (or never)
    var listeners = [];
    var started = false;

    function fromResponse(res) {
        if (!res || res.returnValue === false) return null;
        var wired = res.wired || {};
        var wifi = res.wifi || {};
        var online = !!res.isInternetConnectionAvailable;
        if (wired.state === 'connected') {
            return { type: 'ethernet', online: online, ssid: '', level: 0, ip: wired.ipAddress || '' };
        }
        if (wifi.state === 'connected') {
            var level = typeof wifi.signalLevel === 'number' ? Math.max(1, Math.min(5, Math.round(wifi.signalLevel))) : 5;
            return { type: 'wifi', online: online, ssid: wifi.ssid || '', level: level, ip: wifi.ipAddress || '' };
        }
        return { type: 'offline', online: false, ssid: '', level: 0, ip: '' };
    }

    function start() {
        if (started || !window.Platform || !Platform.available()) return;
        started = true;
        Platform.subscribe(CM, {}, function (res) {
            var s = fromResponse(res);
            if (!s && res && res.returnValue === false) {
                DevLog.log('Network status refused: ' + (res.errorText || res.errorCode));
            }
            last = s;
            listeners.forEach(function (cb) { cb(); });
        });
    }

    // { type: 'wifi' | 'ethernet' | 'cellular' | 'offline', online, ssid, level (1-5), ip },
    // or null when this TV does not expose the status at all.
    function status() {
        start();
        return last;
    }

    function summary(s) {
        if (!s) return 'Nicht verfügbar';
        if (s.type === 'offline') return 'Nicht verbunden';
        var name = s.type === 'wifi' ? 'WLAN' + (s.ssid ? ' · ' + s.ssid : '') :
            s.type === 'ethernet' ? 'Ethernet' : 'Mobilfunk';
        return s.online ? name : name + ' · kein Internet';
    }

    // Lines for the Settings pop-up.
    function details(s) {
        if (!s) return ['Dieser TV meldet sein Netzwerk nicht an Apps'];
        if (s.type === 'offline') return ['Nicht verbunden'];
        var lines = [summary(s)];
        if (s.type === 'wifi' && s.level) lines.push('Signal ' + s.level + ' von 5');
        if (s.ip) lines.push('IP-Adresse ' + s.ip);
        lines.push(s.online ? 'Router erreichbar' : 'Router nicht erreichbar');
        return lines;
    }

    // Wi-Fi bars lit from the 1-5 level; dimmed arcs keep the icon's size constant.
    function wifiIcon(level) {
        var lit = Math.ceil((level || 0) * 3 / 5);
        var arcs = ['M8.6 15.2a4.8 4.8 0 0 1 6.8 0', 'M5.6 12.2a9 9 0 0 1 12.8 0', 'M2.6 9.2a13.3 13.3 0 0 1 18.8 0'];
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
            '<circle cx="12" cy="18.6" r="1.4" fill="currentColor" stroke="none"/>' +
            arcs.map(function (d, i) {
                return '<path d="' + d + '"' + (i < lit ? '' : ' opacity="0.3"') + '/>';
            }).join('') + '</svg>';
    }

    var ETHERNET_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">' +
        '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/>' +
        '<rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/></svg>';

    var OFFLINE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
        '<circle cx="12" cy="18.6" r="1.4" fill="currentColor" stroke="none"/>' +
        '<path d="M8.6 15.2a4.8 4.8 0 0 1 6.8 0M5.6 12.2a9 9 0 0 1 12.8 0M2.6 9.2a13.3 13.3 0 0 1 18.8 0" opacity="0.3"/>' +
        '<path d="M4 4l16 16"/></svg>';

    // Home's status icon. Only redrawn when something changed, as it is called with the clock.
    var lastKey = null;
    function render(el) {
        var s = status();
        var key = s ? [s.type, s.online, s.level].join() : 'none';
        if (key === lastKey) return;
        lastKey = key;
        el.classList.toggle('hidden', !s);
        if (!s) return;
        el.classList.toggle('offline', !s.online);
        el.innerHTML = !s.online ? OFFLINE_ICON + '<span>Offline</span>' :
            s.type === 'wifi' ? wifiIcon(s.level) : ETHERNET_ICON;
    }

    function watch(cb) {
        start();
        listeners.push(cb);
    }

    window.Network = {
        status: status,
        summary: summary,
        details: details,
        render: render,
        watch: watch
    };
})();

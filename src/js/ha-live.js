/*
 * The live picture of one camera, full screen or in the doorbell popup (js/ha-view.js).
 *
 * Home Assistant hands out an HLS playlist for it (WebSocket camera/stream, HA camera/__init__.py).
 * Played, in this order, by:
 *   1. AVPlay, Samsung's own player (webapis.avplay; Samsung names it the way to adaptive streaming
 *      on its TVs, needs no privilege since the 2015 models). It draws on the video plane under the
 *      page, so the page is made transparent over the picture (html.ha-avplay in tvos.css).
 *   2. <video>, where the engine says it plays HLS itself (canPlayType).
 *   3. Stills: a picture every second, never faster than the last one took to load plus 200 ms,
 *      so a slow camera does not pile up requests.
 * Stills show from the start and stay until a stream has its first frame; whatever is tried gets
 * 8 s, then it is stills; a live picture whose play clock stands for 6 s (stream stalled without
 * an error) falls back to stills too. In the preview there is no AVPlay and the simulator refuses the stream:
 * whether HLS plays is only to be seen on the TV (the DevLog notes the path taken).
 */
(function () {
    'use strict';

    var WAIT_MS = 8000;
    var STILL_MIN = 1000;
    var STILL_PAD = 200;
    var STALL_MS = 6000;        // a live picture whose clock stands this long is given up for stills

    var log = DevLog.log;
    var cur = null;     // { box, opts, run, mode, img loop state }
    var runs = 0;

    function setMode(c, mode) {
        if (c.mode === mode) return;
        c.mode = mode;
        c.box.classList.toggle('is-live', mode === 'live');
        if (c.opts.onMode) c.opts.onMode(mode);
    }

    // ---------- Stills

    function still(c) {
        if (c !== cur || c.loading || document.hidden || c.mode === 'live') return;
        var url = HA.cameraUrl(c.opts.still, c.opts.width, c.opts.height, 'contain');
        if (!url) {
            c.box.classList.add('no-image');
            later(c, STILL_MIN * 2);
            return;
        }
        var img = new Image();
        var t0 = Date.now();
        c.loading = true;
        img.onload = function () {
            if (c !== cur) return;
            c.loading = false;
            c.lastLoad = Date.now() - t0;
            HA.cameraSeen(c.opts.still, img, c.lastLoad);
            img.className = 'ha-cam-img';
            var old = c.box.querySelector('.ha-cam-img');
            if (old) c.box.replaceChild(img, old);
            c.box.classList.remove('no-image');
            if (c.opts.onStill) c.opts.onStill(c.lastLoad);
            later(c, Math.max(STILL_MIN, c.lastLoad + STILL_PAD));
        };
        img.onerror = function () {
            if (c !== cur) return;
            c.loading = false;
            if (c.mode === 'live') return;      // late: the stream plays, no "Kein Bild" over it
            c.box.classList.add('no-image');
            later(c, STILL_MIN * 2);
        };
        img.src = url;
    }

    function later(c, ms) {
        clearTimeout(c.stillTimer);
        c.stillTimer = setTimeout(function () { still(c); }, ms);
    }

    // ---------- Stream

    function avplay() {
        return window.webapis && webapis.avplay && typeof webapis.avplay.open === 'function' ? webapis.avplay : null;
    }

    function nativeHls() {
        var v = document.createElement('video');
        return !!(v.canPlayType && v.canPlayType('application/vnd.apple.mpegurl'));
    }

    function failed(c, why) {
        if (c !== cur || c.mode === 'still') return;
        log('Camera live: ' + why + ', stills every second');
        teardown(c);
        setMode(c, 'still');
        still(c);
    }

    function playing(c, how) {
        if (c !== cur || c.mode === 'live') return;
        clearTimeout(c.waitTimer);
        log('Camera live: playing (' + how + ')');
        c.box.classList.remove('no-image');
        setMode(c, 'live');
        clearTimeout(c.stillTimer);
        watch(c);
    }

    // A stream can stop without an error (the camera sends no more segments, the playlist stays
    // open): the player buffers for ever over the last frame. The play clock tells: when it has not
    // moved for STALL_MS, back to current stills.
    function watch(c) {
        var last = -1;
        var since = Date.now();
        clearInterval(c.watch);
        c.watch = setInterval(function () {
            if (c !== cur || c.mode !== 'live') {
                clearInterval(c.watch);
                return;
            }
            var t = -1;
            try {
                t = c.player ? c.player.getCurrentTime() : c.video ? c.video.currentTime : -1;
            } catch (e) { /* player gone: counts as standing */ }
            if (t !== last) {
                last = t;
                since = Date.now();
            } else if (Date.now() - since > STALL_MS) {
                failed(c, 'picture stands still ' + (STALL_MS / 1000) + ' s');
            }
        }, 1000);
    }

    function startAvplay(c, url, player) {
        var obj = document.createElement('object');
        obj.type = 'application/avplayer';
        obj.className = 'ha-avplay';
        c.box.appendChild(obj);
        c.obj = obj;
        document.documentElement.classList.add('ha-avplay');
        try {
            player.open(url);
            var r = c.box.getBoundingClientRect();
            // The TV counts the display in 1920 x 1080 whatever the page's size; the stage is that size.
            player.setDisplayRect(Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height));
            player.setListener({
                onerror: function (e) { failed(c, 'AVPlay error ' + e); },
                onstreamcompleted: function () { failed(c, 'AVPlay stream ended'); }
            });
            player.prepareAsync(function () {
                if (c !== cur) return;
                try {
                    player.play();
                } catch (e) {
                    failed(c, 'AVPlay play refused (' + (e && e.name) + ')');
                    return;
                }
                // First frame: the clock runs.
                c.poll = setInterval(function () {
                    try {
                        if (player.getState() === 'PLAYING' && player.getCurrentTime() > 0) {
                            clearInterval(c.poll);
                            playing(c, 'AVPlay');
                        }
                    } catch (e) {
                        clearInterval(c.poll);
                    }
                }, 250);
            }, function (e) {
                failed(c, 'AVPlay prepare failed (' + (e && e.name) + ')');
            });
            c.player = player;
        } catch (e) {
            failed(c, 'AVPlay refused (' + (e && e.name) + ')');
        }
    }

    function startVideo(c, url) {
        var v = document.createElement('video');
        v.className = 'ha-video';
        v.muted = true;
        v.autoplay = true;
        v.setAttribute('playsinline', '');
        v.addEventListener('timeupdate', function () {
            if (v.currentTime > 0) playing(c, 'video');
        });
        v.addEventListener('error', function () { failed(c, 'video error ' + (v.error && v.error.code)); });
        // Right above the still, below the name and the "Live" badge that come after it.
        var still = c.box.querySelector('.ha-cam-img');
        c.box.insertBefore(v, still ? still.nextSibling : c.box.firstChild);
        c.video = v;
        v.src = url;
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
    }

    function teardown(c) {
        clearTimeout(c.waitTimer);
        clearInterval(c.poll);
        clearInterval(c.watch);
        if (c.player) {
            try { c.player.stop(); } catch (e) { /* not started */ }
            try { c.player.close(); } catch (e) { /* already closed */ }
            c.player = null;
        }
        if (c.obj && c.obj.parentNode) c.obj.parentNode.removeChild(c.obj);
        c.obj = null;
        document.documentElement.classList.remove('ha-avplay');
        if (c.video) {
            c.video.removeAttribute('src');
            try { c.video.load(); } catch (e) { /* nothing loaded */ }
            if (c.video.parentNode) c.video.parentNode.removeChild(c.video);
            c.video = null;
        }
        c.box.classList.remove('is-live');
    }

    function tryStream(c) {
        var player = avplay();
        var video = !player && nativeHls();
        if (!player && !video) {
            failed(c, 'no HLS player on this engine');
            return;
        }
        setMode(c, 'wait');
        c.waitTimer = setTimeout(function () { failed(c, 'no picture within ' + (WAIT_MS / 1000) + ' s'); }, WAIT_MS);
        HA.cameraStream(c.opts.stream).then(function (url) {
            if (c !== cur || c.mode !== 'wait') return;
            if (player) startAvplay(c, url, player);
            else startVideo(c, url);
        }, function (err) {
            if (c !== cur || c.mode !== 'wait') return;
            // Back in the launcher the connection is still signing in again: ask once it is there
            // (stills go on meanwhile), instead of staying with stills for good.
            if (err && err.code === 'not_connected') {
                clearTimeout(c.waitTimer);
                c.waitTimer = setTimeout(function () {
                    if (c === cur && c.mode === 'wait') tryStream(c);
                }, 2000);
                return;
            }
            failed(c, 'stream refused (' + (err && err.code) + ')');
        });
    }

    /*
     * box: holds an img.ha-cam-img; opts: { stream: entity for the live picture, still: entity for
     * stills, width, height (asked of Home Assistant), onMode(mode: 'wait'|'live'|'still'), onStill(ms) }
     */
    function start(box, opts) {
        stop();
        var c = cur = { box: box, opts: opts, run: ++runs, mode: '' };
        box.classList.remove('no-image');
        still(c);
        tryStream(c);
    }

    function stop() {
        var c = cur;
        if (!c) return;
        cur = null;
        clearTimeout(c.stillTimer);
        teardown(c);
        var img = c.box.querySelector('.ha-cam-img');
        if (img) img.removeAttribute('src');
    }

    // Another app in front needs the decoder: the player goes; back in the launcher it is tried again.
    document.addEventListener('visibilitychange', function () {
        var c = cur;
        if (!c) return;
        if (document.hidden) {
            teardown(c);
            c.mode = '';
            return;
        }
        start(c.box, c.opts);
    });

    window.HALive = {
        start: start,
        stop: stop,
        mode: function () { return cur ? cur.mode : ''; },
        active: function () { return !!cur; }
    };
})();

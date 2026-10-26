/* Clock, date, font and icon-style settings (Prefs.appearance). */
(function () {
    'use strict';

    var FONTS = [
        { key: 'barlow', label: 'Barlow', family: '"Barlow"' },
        { key: 'manrope', label: 'Manrope', family: '"Manrope"' },
        { key: 'inter', label: 'Inter', family: '"Inter"' },
        { key: 'outfit', label: 'Outfit', family: '"Outfit"' },
        { key: 'dm-sans', label: 'DM Sans', family: '"DM Sans"' }
    ];

    var LOCALES = [
        { key: 'de-DE', label: 'Deutsch' },
        { key: 'en-GB', label: 'English' },
        { key: 'es-ES', label: 'Español' },
        { key: 'fr-FR', label: 'Français' }
    ];

    // Multiplies the text sizes marked with var(--ts) in the stylesheets; the clock is left alone.
    var TEXT_SIZES = [
        { key: 'default', label: 'Standard', scale: 1 },
        { key: 'large', label: 'Groß', scale: 1.15 },
        { key: 'larger', label: 'Sehr groß', scale: 1.3 }
    ];

    /*
     * Icons in Settings (Darstellung → Symbolstil). Ordiscale: line icons, the focused row lightly
     * turquoise with a soft glow, and the same glow behind the selected tile on Home (home.js glowTo).
     * Schlicht: line icons, white focus. Farbig: icons on coloured plates, as in Apple's settings.
     */
    var ICON_STYLES = [
        { key: 'ordiscale', label: 'Ordiscale', text: 'Linien-Symbole, die gewählte Zeile leicht türkis mit sanftem Leuchten; auf der Startseite leuchtet die gewählte Kachel.' },
        { key: 'plain', label: 'Schlicht', text: 'Nur Linien-Symbole, die gewählte Zeile weiß.' },
        { key: 'color', label: 'Farbig', text: 'Symbole auf farbigen Flächen wie in den Apple-Einstellungen.' }
    ];

    var FALLBACK = ', "SamsungOne", "Helvetica Neue", Arial, sans-serif';

    function prefs() { return Prefs.get().appearance; }

    function font(key) {
        return FONTS.find(function (f) { return f.key === key; }) || FONTS[0];
    }

    function textSize(key) {
        return TEXT_SIZES.find(function (t) { return t.key === key; }) || TEXT_SIZES[0];
    }

    function pad(n){ return String(n).padStart(2, '0'); }

    // Returns { time: '16:05', suffix: '' } or { time: '4:05', suffix: 'PM' }.
    function time(d) {
        if (prefs().clock === '12h') {
            var h = d.getHours() % 12 || 12;
            return { time: h + ':' + pad(d.getMinutes()), suffix: d.getHours() < 12 ? 'AM' : 'PM' };
        }
        return { time: pad(d.getHours()) + ':' + pad(d.getMinutes()), suffix: '' };
    }

    // locale: optional, for the preview in Settings (a language that has focus but is not saved).
    function date(d, locale) {
        try {
            var text = d.toLocaleDateString(locale || prefs().locale, { weekday: 'long', day: 'numeric', month: 'long' });
            return text.charAt(0).toUpperCase() + text.slice(1);
        } catch (e) {
            return d.toDateString();
        }
    }

    /*
     * Night mode: from sunset to sunrise (Weather.sun, from the weather reading), or 20:00 to 07:00
     * without one. Home dims its wallpaper (class `night`, flat layer in tvos.css) and the screen
     * saver goes dark sooner. It is worked out once a minute, with the clock that already ticks
     * (Home.updateClock): no timer of its own, and the screen saver reads the cached answer.
     */
    var nightNow = false;
    var nightMinute = -1;

    // Is it dark outside now, whatever the setting? Settings' preview shows "Automatisch" with it.
    function darkOutside(now) {
        var sun = window.Weather && Weather.sun(now);
        if (sun) return now >= sun.set || now < sun.rise;
        var h = now.getHours();
        return h >= 20 || h < 7;
    }

    function isNight(now) {
        return prefs().night !== 'off' && darkOutside(now);
    }

    // force: re-check now (settings changed), not only when the minute has turned.
    function tickNight(now, force) {
        var minute = Math.floor(now.getTime() / 60000);
        if (!force && minute === nightMinute) return;
        nightMinute = minute;
        var night = isNight(now);
        if (night === nightNow && !force) return;
        nightNow = night;
        document.getElementById('home').classList.toggle('night', night);
    }

    function apply() {
        var p = prefs();
        document.documentElement.style.setProperty('--font', font(p.font).family + FALLBACK);
        document.documentElement.style.setProperty('--ts', textSize(p.textSize).scale);
        var home = document.getElementById('home');
        home.classList.toggle('names-focused', p.names === 'focused');
        home.classList.toggle('names-never', p.names === 'never');
        home.classList.toggle('no-date', !p.showDate);
        home.classList.toggle('layout-column', p.homeLayout === 'column');
        ICON_STYLES.forEach(function (s) {
            document.documentElement.classList.toggle('icons-' + s.key, (p.iconStyle || 'ordiscale') === s.key);
        });
        tickNight(new Date(), true);
    }

    window.Appearance = {
        FONTS: FONTS,
        LOCALES: LOCALES,
        TEXT_SIZES: TEXT_SIZES,
        ICON_STYLES: ICON_STYLES,
        font: font,
        textSize: textSize,
        fontStack: function (key) { return font(key).family + FALLBACK; },
        textScale: function (key) { return textSize(key).scale; },
        time: time,
        date: date,
        scale: function () { return textSize(prefs().textSize).scale; },
        tickNight: tickNight,
        night: function () { return nightNow; },
        darkOutside: darkOutside,
        apply: apply
    };
})();

/* Start-up order: UI core, Settings views, then Home (which shows itself). */
(function () {
    'use strict';

    function fitPreview() {
        if (!window.__TIZEN_MOCK__) return;
        document.documentElement.classList.add('preview');
        var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
        document.getElementById('stage').style.transform = 'scale(' + scale + ')';
    }

    fitPreview();
    window.addEventListener('resize', fitPreview);

    UI.init();
    Settings.init();
    HAPair.init();
    Screensaver.init();
    Weather.start();
    Calendar.start();
    Warnings.start();
    Week.init();
    HAView.init();
    Home.init();
    Setup.init();

    // "Beim Start Sicherheit zeigen" (Settings → Home Assistant): a TV used as a dashboard opens
    // there; Back leads to Home. Not while the first-run assistant still has to run.
    var hv = Prefs.get().haView;
    if (hv && hv.startup && HA.configured() && Prefs.get().setup === 'done') HAView.open();

    // Preview only: open a screen directly, e.g. http://localhost:8080/#settings
    var view = location.hash.slice(1);
    if (window.__TIZEN_MOCK__ && view) {
        try {
            UI.show(view);
        } catch (e) {
            // Unknown screen name: stay on Home.
        }
    }
})();

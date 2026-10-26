/*
 * Tile styling per brand. `match` is tested against "<name> <id>" of an installed app.
 * `mark` is a file in img/marks/; the build recolours it in `fg` (img/tiles/<key>.svg), shown over `bg`.
 * `text` instead of `mark` draws a typographic logo (for brands without an available mark); `long` sets
 * it smaller for names of eight or more characters.
 * `desc` is the line under the app's name in the top shelf.
 * `pad` optionally overrides the mark's [vertical, horizontal] inset in % of the tile (default [26, 22]).
 */
window.BRANDS = [
    { key: 'youtube', match: /youtube|tizentube|cobalt-yt/i, mark: 'youtube', bg: '#e62117', fg: '#fff' , desc: 'Videos, Musik und Livestreams' },
    { key: 'netflix', match: /netflix/i, mark: 'netflix', bg: '#141414', fg: '#e50914' , desc: 'Serien und Filme' },
    { key: 'primevideo', match: /prime ?video/i, mark: 'primevideo', bg: 'linear-gradient(135deg,#0b4f7a,#1aa0e0)', fg: '#fff', pad: [12, 10] , desc: 'Filme, Serien und Sport' },
    { key: 'disneyplus', match: /disney/i, mark: 'disneyplus', bg: 'linear-gradient(135deg,#091550,#1f5bd8)', fg: '#fff' , desc: 'Disney, Pixar, Marvel und Star Wars' },
    { key: 'appletv', match: /apple ?tv|aria-video/i, mark: 'appletv', bg: '#1c1c1e', fg: '#fff' , desc: 'Apple Originals, Filme und Serien' },
    { key: 'spotify', match: /spotify/i, mark: 'spotify', bg: '#121212', fg: '#1ed760' , desc: 'Musik und Podcasts' },
    { key: 'movistar', match: /movistar/i, mark: 'movistar', bg: '#0b6fd8', fg: '#fff' },
    { key: 'max', match: /(^|\s)max(\s|$)|hbo/i, mark: 'max', bg: '#002be7', fg: '#fff' , desc: 'HBO-Serien und Filme' },
    { key: 'dazn', match: /dazn/i, mark: 'dazn', bg: '#0c161c', fg: '#f8fc00' , desc: 'Live-Sport' },
    { key: 'plex', match: /plex/i, mark: 'plex', bg: '#1f1f1f', fg: '#e5a00d' , desc: 'Deine eigene Mediathek' },
    { key: 'twitch', match: /twitch/i, mark: 'twitch', bg: '#9146ff', fg: '#fff' , desc: 'Livestreams' },
    { key: 'tf1', match: /tf1/i, text: 'TF1+', bg: 'linear-gradient(135deg,#071a4d,#1d4ed8)', fg: '#fff' },
    { key: 'crunchyroll', match: /crunchyroll/i, mark: 'crunchyroll', bg: '#f47521', fg: '#fff' , desc: 'Anime' },

    // German broadcasters and services. Joyn and waipu.tv have no free mark: typographic logo,
    // replaced on the TV by the app's own icon when the TV lets us read it (home.js tileFace).
    { key: 'ard', match: /ard ?mediathek|(^|\s)ard(\s|$)/i, mark: 'daserste', bg: '#003480', fg: '#fff', desc: 'Das Erste und die Dritten' },
    { key: 'zdf', match: /zdf/i, mark: 'zdf', bg: '#fa7d19', fg: '#fff', desc: 'ZDF-Mediathek und Livestream' },
    { key: 'joyn', match: /joyn/i, text: 'joyn', bg: 'linear-gradient(135deg,#120a2e,#4b1fd1)', fg: '#fff', desc: 'ProSieben, SAT.1, Kabel Eins und mehr' },
    // RTL's mark is a wide, flat strip, so it gets nearly the whole tile.
    { key: 'rtlplus', match: /rtl ?(\+|plus)|tvnow/i, mark: 'rtl', pad: [8, 8], bg: '#141414', fg: '#fff', desc: 'RTL, VOX, ntv und mehr' },
    { key: 'waipu', match: /waipu/i, text: 'waipu.tv', long: true, bg: '#e8125c', fg: '#fff', desc: 'Live-Fernsehen über das Internet' },
    { key: 'magentatv', match: /magenta/i, mark: 'magentatv', bg: '#e20074', fg: '#fff', desc: 'Fernsehen der Telekom' },

    // Zattoo has no free mark either, and its app id is not known (config.js finds it by name).
    // Colour approximated from the app's look; check it against the real icon on the TV.
    { key: 'zattoo', match: /zattoo/i, text: 'zattoo', bg: 'linear-gradient(135deg,#d9480f,#ff9d00)', fg: '#fff', desc: 'Live-Fernsehen und Mediathek' },

    // The TV's own tuner: "Fernsehen" tile (home.js, virtual app tv-tuner). Drawn mark, no logo.
    { key: 'tvtuner', mark: 'tv', bg: 'linear-gradient(135deg,#0b2a4a,#1f6fd1)', fg: '#fff', desc: 'Kabel, Satellit und Antenne' },

    // Home Assistant: the "Zuhause" view (home.js, virtual app home-assistant). Own drawing, not HA's logo.
    { key: 'homeassistant', mark: 'homeassistant', bg: 'linear-gradient(135deg,#0d8fc4,#18bcf2)', fg: '#fff', desc: 'Geräte mit dem Label TV' },

    // Consoles (used by inputs in config.js)
    { key: 'playstation', mark: 'playstation', bg: 'linear-gradient(135deg,#00205c,#0070d1)', fg: '#fff' },
    { key: 'xbox', mark: 'xbox', bg: 'linear-gradient(135deg,#0a3a0a,#16a016)', fg: '#fff' },
    { key: 'switch', mark: 'nintendoswitch', bg: 'linear-gradient(135deg,#b3000e,#ff2a2a)', fg: '#fff' }
];

window.findBrand = function (keyOrApp) {
    if (typeof keyOrApp === 'string') {
        return window.BRANDS.find(function (b) { return b.key === keyOrApp; }) || null;
    }
    var text = (keyOrApp.name || '') + ' ' + (keyOrApp.id || '');
    return window.BRANDS.find(function (b) { return b.match && b.match.test(text); }) || null;
};

# Third-party libraries (local copies, no network at runtime)

## qrcode-generator 2.0.4 (QR codes for pairing with Home Assistant)

- File: `qrcode-generator-2.0.4.js` = `dist/qrcode.js` from the npm package `qrcode-generator@2.0.4`, unchanged.
- Author: Kazuhiko Arase. Licence: MIT, text in `qrcode-generator-LICENSE.txt` (from the GitHub repository kazuhikoarase/qrcode-generator; the npm package ships no licence file, the copyright header in the file says MIT).
- Source: npm registry tarball `https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-2.0.4.tgz` (published 2025, GitHub tag `js2.0.4`), integrity `sha512-mZSiP6RnbHl4xL2Ap5HfkjLnmxfKcPWpWe/c+5XxCuetEenqmNFf1FH/ftXPCtFG5/TDobjsjz6sSNL0Sr8Z9g==` (matches the registry), fetched 25.10.2026.
- SHA-256 of the file: `79ec86f82856005b1c887905cfccfcfbec3821ca61c7fd5a952faa5f778f791c`.
- SHA-256 of the licence file: `3a850fa5f08101db6f40676c2786e10bd2cd5fff7b12ffdf1e0c434d4e49d90c`.
- Checked: plain ES5 (no let/const/arrow functions), no network access (fetch, XMLHttpRequest, WebSocket, script or image loading), no eval or `new Function`, no storage; defines the global `qrcode` (UMD wrapper for AMD/CommonJS is inert in the browser).
- Loaded only when the pairing view opens (`js/ha-pair.js` loadQr), not at start-up. Used with error correction M and byte mode.

## ical.js 1.5.0 (calendar feeds)

- File: `ical-1.5.0.min.js`, Mozilla, MPL-2.0 (`ical-LICENSE.txt`).
- SHA-256: `ba8b552a5b54bf99de2ac225671af151c71b6b43daa6dbac163ea9fb0f12a27b`.
- Loaded by `js/calendar.js` (loadIcal) once a calendar is due for fetching.

# Abweichungen vom UI-Kit 0.9.7

Grundlage ist `ordiscale-launcher-ui-kit-0.9.7.zip`. HTML, CSS, Schriften, Symbole, Hintergründe und die UI-Logik sind unverändert übernommen. Hier steht jede Stelle, an der der LG-Port davon abweicht, mit Grund. Ziel-TV: LG OLED55B8PLA, webOS 4 (sdkVersion 4.4.0, Firmware 05.50.70), Web-Engine Chromium 53.

Stand: 26.10.2026

## 1. Aussehen

Am Aussehen ist nichts geändert. Die Rückfälle unten bauen nur nach, was der alten Engine fehlt.

| Was | Warum | Wo |
|---|---|---|
| CSS Grid wird mit Flexbox und Floats nachgebaut (Startseiten-Raster, Alle Apps, HA-Kacheln, Hintergrund-Vorschauen, Wochenansicht, Terminlisten auf Startseite, Einstellungs-Vorschau und Bildschirmschoner) | Chromium 53 kennt kein CSS Grid (erst ab Chrome 57) | `src/css/webos.css`, gilt nur unter `html.no-grid` |
| Breite der Spalte „Wann“ in den Terminlisten wird per Skript gemessen | Grid `auto` lässt sich ohne Grid nicht in CSS ausdrücken | `src/js/platform-webos.js` (Listen-Anpassung) |
| Flex-`gap` über Außenabstände | Chromium 53 kennt `gap` in Flexbox nicht (erst ab Chrome 84). Der Rückfall `no-flex-gap` steckt schon im Kit | `style.css`/`tvos.css` des Kits, unverändert |
| Test auf Grid im `<head>` | setzt `no-grid` vor dem ersten Zeichnen | `src/index.html` |

**Prüfung:** Die 16 Ansichten aus `docs/design-system/screens/` wurden im Browser mit 1920 × 1080 nachgestellt, einmal normal und einmal mit erzwungenen Chromium-53-Rückfällen (`WebOSMock.engine53()`, schaltet dazu `gap` ab). Ergebnis gegenüber dem Kit:

- 8 Ansichten pixelgleich (0,00 %), 5 weitere unter 0,2 % (Kantenglättung der Schrift).
- „Bildschirmschoner“: 1,6 %, nur die Bewegung des Hintergrundbilds, das Layout ist gleich.
- „Kopplung per QR“: 2,3 %, der Code ist zufällig.
- „Alle Apps“: 12,8 %, weil die Beispiel-Apps andere sind (siehe 3.). Raster und Abstände sind gleich.

Am TV selbst steht der Vergleich noch aus (Fotos derselben Ansichten).

## 2. Texte

| Was | Kit | Port | Warum |
|---|---|---|---|
| Einstellungen → Erweitert, Hinweis zur TV-Startseite | „Öffnet Samsungs Startseite …“ | „Öffnet LGs Startseite …“ | Falscher Hersteller. Von Tobias am 26.10.2026 bestätigt. |

## 3. Plattformschicht (neu geschrieben)

| Datei | Kit (Tizen) | Port (webOS) |
|---|---|---|
| `src/js/platform-webos.js` | – | Luna-Aufrufe über `PalmServiceBridge`, App-ID, Tastencodes, `padStart`-Ersatz (fehlt bis Chrome 57), Listen-Anpassung für `no-grid` |
| `src/js/apps.js` | `tizen.application` | `com.webos.applicationManager/listLaunchPoints` und `/launch`, verweigert der TV das, dann dieselben Aufrufe über LG Connect Apps (`ssap.js`). Erst wenn beides fehlt, gilt eine Liste bekannter LG-App-IDs. Samsung-IDs aus gespeicherten Einstellungen werden auf LG umgelenkt (`com.samsung.tv.csfs` → `com.webos.app.home`, `org.tizen.tv-viewer` → `com.webos.app.livetv`) |
| `src/js/ssap.js` (ab 0.9.8) | – | Zweiter Weg über LG Connect Apps (`ws://127.0.0.1:3000`, SSAP), wenn der TV Luna-Aufrufe verweigert. Der TV fragt einmal nach, und der Schlüssel bleibt im localStorage des TVs. Angefragte Rechte: installierte Apps lesen, Apps starten, Eingangsliste lesen |
| `src/js/inputs.js` | `tizen.tvwindow`/`tvinputdevice` | Jeder Eingang ist bei webOS eine App (`com.webos.app.hdmi1` … `hdmi4`, `com.webos.app.livetv`). Status über `com.webos.service.eim/getAllInputStatus`; wird das verweigert, gelten HDMI 1–4 als vorhanden, aber leer |
| `src/js/network.js` | `webapis.network` | `com.palm.connectionmanager/getStatus` mit Abo. Anzeige und Texte wie im Kit |
| `src/js/ui.js` | Zurück = 10009 | Zurück = 461 (vom Plattformmodul) |
| `src/js/config.js` | Netflix `org.tizen.netflix-app` | Netflix `netflix` |
| `src/appinfo.json` | `src/config.xml` | App-ID `com.tobias.launcher`, Version 0.9.7, Symbole 80 und 130 px aus `icon.png`, `disableBackHistoryAPI` (Zurück kommt als Taste an) |
| `src/js/webos-mock.js` | `src/js/tizen-mock.js` | Simulator für die Vorschau: Luna-Dienste wie oben, dazu der HA-Simulator des Kits unverändert. Auf dem TV tut er nichts (`PalmServiceBridge` vorhanden) |
| `scripts/webos.mjs`, `package.json` | `scripts/build.sh`, `install-tv.sh` | Paket mit `ares-package --no-minify`, Installation mit `ares-install`, Start mit `ares-launch` |

Entfernt, weil nur für Samsung: `native/`, `src/config.xml`, `scripts/install-tv.sh`, `scripts/make-game-cutouts.swift`, `src/js/tizen-mock.js`.

## 4. Was auf webOS fehlt (die Oberfläche bleibt, die Funktion wird schwächer)

| Funktion | Kit | Auf dem LG |
|---|---|---|
| HDMI-Bild im Launcher („In der App“) | `tizen.tvwindow` | Gibt es nicht für Web-Apps. Es wird auf den Eingang umgeschaltet |
| Kamera-Livebild | Samsung AVPlay | Kein AVPlay. Der Code nimmt automatisch `<video>` mit HLS, sonst Standbilder (wie im Kit vorgesehen). Ob HLS auf dem B8 läuft, zeigt erst der TV |
| Samsung-Bildschirmschoner abschalten, solange die Sicherheitsansicht offen ist | `webapis.appcommon` | Keine Web-API. Das Protokoll vermerkt es. LGs eigenen Bildschirmschoner ggf. im TV-Menü einstellen (nur mit Tobias' Ja) |
| Farbtasten anmelden | `tizen.tvinputdevice.registerKeyBatch` | Nicht nötig, webOS liefert sie direkt (403–406). Im Protokoll steht einmal „Colour keys unavailable“, das ist harmlos |
| Lab → Plattform-Probe | prüft `tizen`/`webapis` | Meldet auf dem LG nur „nicht vorhanden“. Eine webOS-Variante ist nicht gebaut |
| Startseite per 2 s Zurück | startet Samsungs Startseite | startet `com.webos.app.home`, am TV prüfen |
| Launcher als Home-App, Start beim Einschalten | – | Ohne Root nicht möglich. Der Launcher ist eine normale App |
| Zertifikatsablauf (Einstellungen → Erweitert) | Samsung-Zertifikat | Auf dem LG läuft stattdessen die Developer-Mode-Sitzung ab. Die Anzeige bleibt wie im Kit; Ablauf in der Developer-Mode-App ablesen |

## 5. Abweichungen der Referenzbilder vom Kit-Code

- **07 Menü:** Das Referenzbild zeigt ältere Einträge („Zu Favoriten / Abbrechen“) als der Code des Kits 0.9.7. Port und Kit-Code stimmen überein. Das ist keine Abweichung des Ports.

## 6. Noch am TV zu prüfen

- 0.9.7 zeigte auf dem TV zu wenige Apps, vermutlich weil LG die App-Liste über Luna verweigert. Ab 0.9.8 prüfen, ob die Abfrage über LG Connect Apps alle installierten Apps liefert (Protokoll: „App list“, „SSAP“).
- Tastencodes (Zurück 461, Farbtasten, Halten von OK und Zurück).
- Fotos der 16 Ansichten am TV und Vergleich mit den Referenzbildern.

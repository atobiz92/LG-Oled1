# Einrichtung (Antworten ohne Geheimnisse)

Stand: 26.10.2026

## Block 1: Gerät und Rechner

| Frage | Antwort |
|---|---|
| TV | LG OLED55B8PLA (Modelljahr 2018) |
| Plattform | webOS 4 (der TV meldet sdkVersion 4.4.0) |
| Firmware | 05.50.70 |
| Web-Engine | Chromium 53: kein CSS Grid, kein Flex-`gap`, nur ES5 (siehe `abweichungen.md`) |
| Rechner für die Einrichtung | Windows, Node.js 24, webOS CLI 3.2.6 (`@webos-tools/cli`), normale PowerShell, Befehle als `npm.cmd` bzw. `ares-*.cmd` |
| Netz | TV und Rechner im selben Heimnetz. Die IP des TVs steht nur in der ares-Konfiguration auf dem Rechner, nicht im Repo |
| Hersteller-Konto | LG-Entwicklerkonto vorhanden (für die Developer-Mode-App) |
| Developer Mode | an, Key Server an. Gerät in der CLI als `tv` gekoppelt |

## Was auf diesem Modell geht und was nicht

- Der Launcher läuft als normale Web-App im Developer Mode. Er ersetzt nicht LGs Startseite und startet nicht beim Einschalten (beides ginge nur mit Root, das ist ausgeschlossen).
- Die Developer-Mode-Sitzung läuft nach einer begrenzten Zeit ab (laut Developer-Mode-App derzeit rund 50 Stunden) und muss in der App verlängert werden. Läuft sie ab, entfernt der TV die installierten Entwickler-Apps. Den Verlängerungs-Schlüssel (Token) nie in Git oder in den Chat schreiben.
- Andere Apps starten, Eingänge umschalten und den Netzwerkstatus lesen geht über Luna-Dienste. Die Liste der installierten Apps gibt LG über Luna nur eigenen und Partner-Apps heraus. Deshalb liest der Launcher sie ab 0.9.8 über **LG Connect Apps** (dieselbe Schnittstelle wie LGs Handy-App). Dafür muss am TV *Einstellungen → Verbindung → LG Connect Apps* an sein. Beim ersten Start fragt der TV einmal, ob „Ordiscale Launcher“ sich verbinden darf. Bei „Ja“ erscheinen alle installierten Apps. Bei „Nein“ fragt der Launcher 24 Stunden lang nicht erneut und zeigt so lange nur die bekannten Standard-Apps.

## Bauen und installieren (auf dem Windows-Rechner)

```
npm.cmd run package      # baut build\com.tobias.launcher_<Version>_all.ipk
npm.cmd run install-tv   # baut neu und installiert auf dem Gerät "tv"
npm.cmd run launch-tv    # startet den Launcher
```

Installieren nur nach Tobias' ausdrücklichem Ja für diese Version.

Rückweg: in der App-Leiste des TVs den Launcher löschen (oder `ares-install --device tv --remove com.tobias.launcher`), danach bei Bedarf den Developer Mode in der Developer-Mode-App ausschalten.

## Block 2: Inhalte (noch offen)

Diese Fragen sind noch nicht beantwortet. Bis dahin zeigt der Launcher die Beispielinhalte des Kits.

1. Fernsehen über Tuner (Antenne, Kabel, Satellit) oder über eine App?
2. Welche Apps auf die Startseite, welche 5 in die Favoritenleiste?
3. Welche Geräte an welchem HDMI-Anschluss?
4. Sprache, Datumsformat, Bundesland (für die Feiertage)
5. Wetter (optional): Ort
6. Kalender (optional): nur Eintragsnamen und Anzeigenamen, die iCal-Links nicht in den Chat
7. Home Assistant (optional): Adresse, Version, Anmeldeweg
8. Sicherheitsansicht (optional): Kameras, Sensoren, Türöffner, Alarmanlage
9. Design: bleibt wie im Kit

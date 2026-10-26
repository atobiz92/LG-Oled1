# Die Siedelei

Ein Aufbau-Strategiespiel im Geiste von **Die Siedler 3**, komplett neu gebaut, auf Deutsch
und mit einer (hoffentlich) lustigen Vertonung. Läuft direkt im Browser, auch auf dem Handy.

Vier Völker stehen zur Wahl: **Römer**, **Wikinger**, **Ägypter** und die **Amazonen**
(„Donnerschwestern“). Jedes Volk hat einen eigenen Baustil, eigene Musik, eigene Stimmen und
einen kleinen Bonus.

## Warum ein Nachbau und kein Reverse Engineering?

Ein Reverse Engineering (zum Beispiel mit dem Open-Source-Projekt JSettlers) braucht immer die
Originaldateien von der Siedler-3-CD. Die sind nicht mehr da. Außerdem gehören Grafiken, Sounds
und Namen der Originalspiele Ubisoft/Blue Byte. Deshalb ist hier **alles selbst erzeugt**:

| Bereich | Wie es entsteht |
|---|---|
| Grafik | prozedural auf dem Canvas gezeichnet (Gelände, Bäume, Häuser, Figuren) |
| Soundeffekte | live per Web Audio synthetisiert (Axt, Säge, Amboss, Horn, Glocke …) |
| Musik | generativ, eigene Tonart je Volk (Dur, dorisch, phrygisch, mixolydisch) |
| Sprache | Sprachausgabe des Browsers (de-DE) + Untertitel und Sprechblasen |
| Karten | zufällig erzeugt, über die Kartennummer reproduzierbar |

Es gibt also **keine einzige Asset-Datei**. Spielmechaniken sind nicht urheberrechtlich geschützt,
Namen, Bilder und Töne der Originale schon. Deshalb heißt das Spiel auch nicht „Siedler“.

## Starten

Das Spiel nutzt ES-Module, deshalb braucht es einen kleinen lokalen Webserver
(direkt per Doppelklick auf `index.html` blockiert der Browser die Module):

```bash
python3 -m http.server 8000
# dann im Browser öffnen: http://localhost:8000
```

Alternativ: `npx serve .`

## Steuerung

| Aktion | Maus / Tastatur | Touch |
|---|---|---|
| Karte verschieben | Ziehen oder WASD / Pfeiltasten | Wischen |
| Zoomen | Mausrad | zwei Finger |
| Bauen | Gebäude im Menü wählen, dann weißen Punkt anklicken | antippen |
| Bauen abbrechen | Rechtsklick oder Esc | Gebäude im Menü erneut antippen |
| Gebäude-Infos | Gebäude anklicken | antippen |
| Figur reden lassen | Figur anklicken | antippen |
| Angreifen | Feindlichen Turm anklicken → „Angreifen“ | |
| Pause / Tempo | Leertaste, Tasten 1–3 | Knöpfe oben |

## Wirtschaft

Wie in Siedler 3 gibt es keine Straßen. Träger laufen frei herum und bringen Waren dorthin,
wo sie gebraucht werden.

```
Holzfäller ──Baumstamm──► Sägewerk ──Bretter──► Baustellen
Förster pflanzt Bäume nach
Steinmetz ──Stein──► Baustellen
Bauernhof ──Getreide──► Mühle ──Mehl──► Bäckerei ──Brot──┐
Fischer ──Fisch─────────────────────────────────────────┤
                                                         ▼
                         Kohlemine / Erzmine (nur im Gebirge)
Erz + Kohle ──► Eisenschmelze ──Eisen──► Waffenschmied (+ Kohle) ──Waffe──► Kaserne
Kaserne: Träger + Waffe ──► Soldat ──► Wachturm / Burg ──► mehr Land
Wohnhaus: bringt neue Träger
```

Türme bringen erst Land, wenn ein Soldat eingezogen ist. Fremde Gebäude, die plötzlich in deinem
Land stehen, brennen ab. Wer das gegnerische Hauptquartier erobert, gewinnt.

## Projektstruktur

```
index.html, style.css      Oberfläche
src/config.js              alle Spieldaten: Waren, Gebäude, Völker (Balancing hier!)
src/game.js                Spiellogik ohne DOM (läuft auch unter Node)
src/map.js, src/rng.js     Kartengenerator
src/path.js                A*-Wegfindung
src/ai.js                  Computergegner
src/render.js              Canvas-Grafik
src/audio.js               Soundeffekte und Musik (Web Audio)
src/voice.js               Sprüche und Sprachausgabe
src/main.js                Spielschleife, Eingabe, Menüs
tests/                     Simulationstests (KI gegen KI)
tools/sprecherskript.mjs   erzeugt docs/VERTONUNG.md
docs/KONZEPT.md            Design und Fahrplan
docs/VERTONUNG.md          Sprecherskript für eine echte Vertonung
```

## Tests

```bash
npm test          # oder: node --test tests/*.test.mjs
```

Die Tests lassen zwei Computergegner 12 bzw. 25 Spielminuten gegeneinander spielen und prüfen,
dass die Wirtschaft läuft, Bestände nie negativ werden und der Krieg nicht abstürzt.

## Eigene Sprüche

Alle Texte stehen in `src/voice.js`. Danach `node tools/sprecherskript.mjs` ausführen, dann ist
auch das Sprecherskript in `docs/VERTONUNG.md` wieder aktuell.

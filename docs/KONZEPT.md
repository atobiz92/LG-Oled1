# Konzept und Fahrplan

## Ziel

Ein eigenständiges Aufbauspiel, das sich wie Siedler 3 anfühlt: freie Träger statt Straßen,
lange Produktionsketten, Gebiet durch Militärgebäude, Kämpfe um Türme. Dazu ein klarer
eigener Ton: Humor, deutsche Sprachausgabe und vier Völker, darunter die Amazonen.

## Was Siedler 3 ausmacht und wie es hier umgesetzt ist

| Siedler-3-Merkmal | Stand in der Siedelei |
|---|---|
| Träger ohne Straßen | ✅ freie Wegfindung (A*), Transportaufträge nach Bedarf |
| Produktionsketten | ✅ Holz, Stein, Nahrung, Bergbau, Eisen, Waffen |
| Gebiet durch Türme | ✅ Gebiet erst nach Besetzung, fremde Gebäude brennen ab |
| Kampf um Türme | ✅ Zweikämpfe, Eroberung, Sieg durch Fall des Hauptquartiers |
| Mehrere Völker | ✅ Römer, Wikinger, Ägypter, Amazonen |
| Computergegner | ✅ Bauliste, Ausdehnung Richtung Gegner, Angriffe ab Minute 9 |
| Götter und Magie | ⏳ geplant |
| Schiffe und Handel | ⏳ geplant |
| Spielstände | ⏳ geplant |
| Mehrspieler | ⏳ geplant |

## Völker

| Volk | Baustil | Musik | Bonus | Stimme |
|---|---|---|---|---|
| Römer | Satteldach, rot | Dur, gemütlich | Verteidigung +15 % | bürokratisch-stolz |
| Wikinger | steiles Holzdach | dorisch, schwere Trommeln | Angriff +15 % | laut, polternd |
| Ägypter | Flachdach, gold | phrygisch-dominant | Produktion +15 % | trocken-sarkastisch |
| Amazonen | Kuppeln, lila | mixolydisch, flott | Laufen +12 %, Angriff +7 % | weiblich, schlagfertig |

Die Amazonen sind bewusst als freches Gegengewicht zu den sehr männlichen Völkern angelegt. Sie
sticheln gern gegen „die Kerle da drüben“. Ihr Name und alle Texte lassen sich in
`src/config.js` und `src/voice.js` ändern.

## Ideen für die nächsten Schritte

1. **Echte Vertonung:** Sätze aus `docs/VERTONUNG.md` aufnehmen und als OGG-Dateien unter
   `assets/stimmen/` ablegen. `voice.js` spielt dann die Datei ab, wenn es eine gibt, und fällt
   sonst auf die Sprachausgabe zurück.
2. **Volksspezifische Gebäude:** Weinberg (Römer), Met-Brauerei (Wikinger), Papyrus (Ägypter),
   Bogenmacherin (Amazonen).
3. **Götter:** Priester und Mana, z. B. „Fischregen“, „Bäume wachsen sofort“ oder für die
   Amazonen „Donnerschlag“.
4. **Spielstände** im Browser (localStorage) und Kartenauswahl mit Vorschau.
5. **Schwierigkeitsgrade** für die KI und mehr als zwei Spieler.
6. **Kampagne** mit kleinen Missionen und Zwischensequenzen als Sprechblasen-Dialoge.

## Technik

- Reines JavaScript (ES-Module), keine Abhängigkeiten, kein Build-Schritt.
- `src/game.js` ist DOM-frei und deterministisch bis auf die KI-Zufallsauswahl, dadurch lässt
  sich die Wirtschaft unter Node im Zeitraffer testen.
- Feste Simulationsschritte von 0,1 s. Das Tempo (1×/2×/4×) ändert nur, wie viele Schritte pro
  Bild gerechnet werden.

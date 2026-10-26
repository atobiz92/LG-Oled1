# Ordiscale Launcher – UI-Kit

Dieses Paket enthält die abgenommene Oberfläche des Ordiscale Launchers, damit ein Nachbau auf einem anderen Fernseher genauso aussieht und sich genauso bedient.

**Lesehilfe:** Zuerst „Inhalt“, dann „Vorschau starten“. Für Agenten gilt der Abschnitt „Regel“.

## Inhalt

| Ordner / Datei | Was es ist |
|---|---|
| `docs/uebergabe-prompt-tv-launcher.md` | Prompt für den Agenten, der den Launcher auf einem neuen TV einrichtet |
| `docs/design-system/DESIGN.md` | Designsystem: Tokens, Layout, Komponenten, Zustände, Abnahme |
| `docs/design-system/tokens.css` | alle Design-Tokens als CSS-Variablen |
| `docs/design-system/screens/` | 16 Referenzbilder in 1920 × 1080 (Startseite, Einstellungen, Bildschirmschoner, Woche, Ersteinrichtung, Sicherheit, Kopplung) |
| `src/` | der vollständige Launcher (HTML, CSS, Schriften, Symbole, Hintergründe, Logik) für Samsung Tizen |
| `src/js/tizen-mock.js` | Simulator für die Browser-Vorschau, inkl. Home Assistant (Adresse `ha.mock`) |
| `homeassistant/` | HA-Integration `ordiscale_tv` für die Kopplung per QR-Code |
| `scripts/` | Build, Vorschau, Symbole |
| `CLAUDE.md` | Projektnotizen: jede Entscheidung, warum sie so ist (bereinigt, ohne Haushaltsdaten) |

## Vorschau starten

Node.js 20 oder neuer:

```sh
npm run preview
```

Dann im Browser `http://localhost:8080` öffnen, bei einer Fenstergröße von mindestens 1920 × 1080 oder mit Zoom. Bedienung: Pfeiltasten, Enter = OK, Esc oder Rücktaste = Zurück. Die Vorschau startet mit Beispielkalender. Home Assistant lässt sich in den Einstellungen mit der Adresse `ha.mock` und einem beliebigen Token simulieren.

## Regel

Die Oberfläche wird **übernommen, nicht neu gestaltet**:

- HTML, CSS, Schriften, Symbole und UI-Logik unverändert kopieren.
- Nur die Plattformschicht neu schreiben (siehe Prompt, Abschnitt A2).
- Jede Ansicht gegen die Referenzbilder abnehmen.
- Abweichungen, die die Plattform erzwingt, in `docs/abweichungen.md` begründen.

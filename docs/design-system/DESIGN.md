# Designsystem Ordiscale Launcher (Arn0 TV, tvOS-Stil)

Stand: 26.10.2026. Abgeleitet aus dem Code in `src/css/style.css`, `src/css/tvos.css`, `src/index.html`, `src/js/appearance.js`, `src/js/icons.js`, `scripts/build-icons.mjs`, `src/js/brands.js` und den Aufbau-Funktionen in `src/js/*.js`. Nichts hier ist erfunden; was berechnet oder per JavaScript gesetzt wird, steht mit Formel da.

## 0. Lesehilfe (zuerst lesen)

**Zweck.** Ein Nachbau soll mit diesem Dokument, `tokens.css` und den Original-CSS-Dateien pixelgleich werden. Prosa beschreibt die Optik nicht ausreichend; deshalb stehen überall exakte Werte. Wo Prosa und Zahl auseinandergehen, gilt die Zahl.

**Mitzugebende Originaldateien** (der Nachbau ist ohne sie nicht pixelgleich): `src/css/style.css`, `src/css/tvos.css`, `src/fonts/barlow-300|400|500|600|700.woff2` (+ `OFL.txt`), `src/img/icons/*.svg` bzw. `src/js/icons.js`, `src/img/marks/*.svg`, `src/img/tiles/*.svg` (von `scripts/build-marks.mjs` vorgefärbt, nicht gelesen), `src/js/brands.js` (Markenfarben), Hintergrundfotos `src/img/bg.jpg` und `src/img/wallpapers/` (Lesbarkeits-Verlauf ist vorab ins JPEG gebrannt, `scripts/prepare-wallpapers.mjs`, nicht gelesen).

**Schreibweise.**
- Quellenangabe immer `Datei:Selektor`. `S:` = `src/css/style.css`, `T:` = `src/css/tvos.css`, `J:` = Datei unter `src/js/`. Beispiel: `T:.gl-row` = Regel `.gl-row` in tvos.css. Zeilenzahlen (`T:L1649`) beziehen sich auf den Stand vom 26.10.2026.
- Alle Längen sind CSS-Pixel auf der festen Bühne **1920 × 1080**. Koordinaten `x/y` zählen von der linken oberen Bühnenecke.
- `ts` = Variable `--ts` (Textgrößen-Faktor 1 / 1.15 / 1.3). `calc(26px * ts)` heißt: 26 px bei Standard, 29,9 px bei Groß, 33,8 px bei Sehr groß.
- „gemessen“ = in der Browser-Vorschau (Chromium, Bühne 1920×1080, Textgröße Standard, Mock-Daten, Schrift Barlow) mit `offsetLeft/Top/Width/Height` ermittelt; Schriftrendering darf um ±1 px abweichen. Alles ohne diesen Vermerk steht so im CSS.
- Zwei Stylesheets, `tvos.css` liegt **über** `style.css` (gleiche Selektoren: `tvos.css` gewinnt). Wo beide etwas setzen, nennt dieses Dokument den wirksamen Wert; der überschriebene Wert steht nur dort, wo er sich auswirkt.
- Hinweis zu `#06285A` (Ordiscale Navy) und `#031A3A` (Deep): Diese Farben stehen **nicht** im Oberflächen-CSS. Sie kommen nur im App-Symbol vor (`src/icon.png`: Signet auf Navy). Die Oberfläche selbst ist neutral nachtblau-schwarz (`--bg: #090b10`) mit Türkis nur als aktive Akzentfarbe.

**Bildschirmfotos** liegen in `docs/design-system/screens/` (Dateinamen in Kapitel 8). Sie sind die Referenz für die Abnahme; sie wurden beim Schreiben dieses Dokuments nicht eingesehen.

**Gliederung.** 1 Grundprinzipien · 2 Tokens · 3 Layout je Ansicht · 4 Komponenten · 5 Symbole (mit den drei Symbolstilen) · 6 Do/Don't · 7 Fokusdarstellung im Überblick · 8 Abnahme · Anhang A (Unsicheres und Annahmen).

---

## 1. Grundprinzipien

1. **tvOS-Anmutung, ruhig und dunkel.** Flächen sind flache, halbtransparente Weiß-Töne („Glas“) auf dunklem Grund (`--glass` = `rgba(255,255,255,0.11)`), Ränder sind 1-px-Innenlinien als `box-shadow: inset` (`--rim`). Fokus = Element wird größer (Skalierung), hell (weiße Fläche oder weißer Ring) und wirft einen weichen Schatten (`--lift`). Keine bunten Flächen außer Markenkacheln und (Stil „Farbig“) Symbolplatten.
2. **Türkis (`--turq` #0aa6b4) ist nur für aktive Zustände** da: die fokussierte Zeile und das Leuchten hinter der gewählten Kachel im Symbolstil „Ordiscale“ (Standard), den eingeschalteten Schalter in diesem Stil, den Türöffner-Chip und seinen Halte-Balken. Nie als Flächen- oder Textfarbe im Ruhezustand.
3. **Bühne fest 1920 × 1080.** `html, body, #stage` je `width:1920px; height:1080px; overflow:hidden` (`S:html, body`, `S:#stage`). Auf dem TV ist das die native Auflösung. In der Desktop-Vorschau skaliert `J:boot.js fitPreview` die Bühne mit `transform: scale(min(innerWidth/1920, innerHeight/1080))` (`transform-origin: 0 0`, `S:#stage`); `html.preview` setzt dann Hintergrund `#000`, 100 % Breite/Höhe, sichtbaren Mauszeiger (`S:html.preview`). Alle Maße in px, kein vw/vh, kein Responsive-Umbruch. Mauszeiger auf dem TV aus: `cursor: none` (`S:html, body`).
4. **Leistungsregeln (Chromium 76/85 auf TV-Hardware, gemessen, Kopf von `S`):**
   - Weich gezeichnete `box-shadow` sind **kostenlos** (gemessen 59,5 fps): erlaubt, auch große Radien (`0 40px 100px`).
   - **Keine `backdrop-filter`**, keine Filter/Masken (außer die kleine Haken-Maske `--check-icon`), **keine Live-Verläufe** auf großen Flächen (drei große Radialverläufe = 4,6 fps). Verläufe nur statisch, klein und einmal gemalt (Kachelglanz `T:.app .tile::after`, Marken-Kachelhintergründe) oder vorab ins Bild gebrannt (Wallpaper-Scrim).
   - Keine abgerundete Beschneidung (`overflow:hidden` + `border-radius`) auf Kacheln. Bilder tragen ihre Rundung selbst (`border-radius: inherit` am Bild, `T:.ha-cam-img`, `S:.icon-art`).
   - **Animiert wird nur `transform` und `opacity`**, auf Elementen mit eigener Ebene (`will-change: transform` bzw. `opacity`). Gleitende Ortswechsel sind `translate`, nie animiertes `scale()` auf Vollbild-Ebenen (Bildschirmschoner schwenkt statt zu zoomen).
   - Fokus-Glanz auf Home: **ein einziges** Element `#home-glow` für die ganze Startseite (`T:.home-glow`), nicht eines je Kachel.
   - Nicht verfügbar in dieser Engine (nicht verwenden): `inset` als Eigenschaft (stattdessen `top/right/bottom/left`), `aspect-ratio`, `overflow: clip`, einzelne Transform-Eigenschaften (`translate`, `scale`), `color-mix()`, Container-Queries, `:has()`. Grid (mit `gap`), `position: sticky`, `clamp()` funktionieren.
5. **Kein Flex-`gap` (Chromium 76).** Auf dem Ziel-TV greift `gap` nur in Grid-Containern. Jeder Flex-Container mit `gap` braucht einen Rückfall (siehe 1.1). Neue Flex-Container nach Möglichkeit ganz ohne `gap`, nur mit Außenabständen (Ränder).
6. **Eine Funktion genau einmal; keine Emoji, keine Symbolzeichen** als Grafik. Haken, Pfeile, Sterne sind gezeichnete SVG oder CSS-Maske (`--check-icon`).
7. **Text:** Schrift Barlow (Hausschrift), Sprache Deutsch (`<html lang="de">`). Schriftgrößen, die mitwachsen sollen, als `calc(Npx * var(--ts))`; die große Uhr wächst nicht mit.

### 1.1 Rückfallregeln für fehlenden Flex-`gap`

Test (`src/index.html`, Inline-Skript im `<head>`, vor dem ersten Malen): ein unsichtbarer Flex-Container (`display:flex; flex-direction:column; gap:1px`) mit zwei leeren Kindern; hat er `scrollHeight === 1`, funktioniert `gap`. Wenn nicht, bekommt `<html>` die Klasse `no-flex-gap`. Die Rückfälle stehen am Ende der Stylesheets als Margin zwischen den Kindern („jedes Kind nach dem ersten“):

| Container | Rückfall (`.no-flex-gap …`) | Ursprungs-`gap` | Quelle |
|---|---|---|---|
| `.holiday` | `> * + * { margin-left: 12px }` | 12px | S:Ende |
| `.alert` | `margin-left: 16px` | 16px | S:Ende |
| `.alert-sub` | `margin-left: 24px` | 24px | S:Ende |
| `.clock-sub` | `margin-left: 22px` (T überschreibt 28) | 22px | T:Ende |
| `.status-row` | `> :not(.hidden) ~ :not(.hidden) { margin-left: 28px }` (nur sichtbare Nachbarn) | 28px | S:Ende |
| `.wx` | `margin-left: 10px`; in `.clock-sub .wx`: 8px | 10 / 8px | S:Ende, T:Ende |
| `.net` | `margin-left: 10px` | 10px | S:Ende |
| `.dialog-actions` | `margin-left: 12px` | 12px | S:Ende |
| `.hints` | `margin-left: 40px` | 40px | S:Ende |
| `.hint` | `margin-left: 12px` | 12px | S:Ende |
| `.ss-clock-row` | `> .ss-weather:not(.hidden) + .ss-clock-main { margin-left: 36px }` | 36px | S:Ende |
| `.ss-wx-now` | `margin-left: 14px` | 14px | S:Ende |
| Datum aus (`#home.no-date .clock-sub`) | `> * + * { margin-left: 0 }` | – | T:Ende |

Regel: Rückfallwert = `gap`-Wert; ein ein- und ausblendbares Kind wird nur gegen **sichtbare** Nachbarn abgestandet.

---

## 2. Tokens

Alle Variablen stehen mit gleichem Namen in `tokens.css`. Sie werden in `S:L87 :root` und `T:L10 :root` definiert; `T` überschreibt `--fg`, `--muted`, `--faint`.

### 2.1 CSS-Variablen (vollständig)

| Variable | Wirksamer Wert | Quelle | Zweck |
|---|---|---|---|
| `--bg` | `#090b10` | S:L88 | Grundhintergrund der Bühne, hinter Wallpaper |
| `--fg` | `#f5f5f7` | T:L11 (S: `#f4f5f7`) | Haupttext; **weiße Fokusfläche** |
| `--muted` | `rgba(235,235,245,0.62)` | T:L12 (S: `rgba(244,245,247,0.55)`) | Zweittext, ruhige Symbole |
| `--faint` | `rgba(235,235,245,0.62)` | T:L13 (S: `rgba(244,245,247,0.5)`) | App-Namen unfokussiert (wirkt gleich wie `--muted`) |
| `--ring` | `#ffffff` | S:L92 | Fokusring (nur noch in S-Regeln, die T überschreibt; Lab-Probe) |
| `--font` | `"Manrope","SamsungOne","Helvetica Neue",Arial,sans-serif` im CSS; **wirksam** `"Barlow","SamsungOne","Helvetica Neue",Arial,sans-serif` | S:L93, gesetzt von J:appearance.js apply() | Schriftfamilie; JS setzt sie inline an `<html>` |
| `--edge` | `120px` | S:L94 | Seitenrand der Bühne (links/rechts, Textblöcke) |
| `--ts` | `1` (1 / 1.15 / 1.3) | S:L95, gesetzt von J:appearance.js | Textgrößen-Faktor |
| `--warn-moderate` | `#ffb340` | S:L97 | Amber: Warnung „Moderate“, Hinweiswerte, „offen“-Zustand |
| `--warn-severe` | `#ff453a` | S:L98 | Rot: Warnung „Severe/Extreme“ |
| `--waste` | `#0a84ff` | S:L99 | Blau: Müllabfuhr-Zeile |
| `--check-icon` | SVG-Datenurl, Haken `M5 12.5l4.5 4.5L19 7.5`, Strich 3, rund | S:L101 | Maske für Haken in Chips/Menü/Thumbs |
| `--ink` | `#1c1c1e` | T:L14 | Text auf weißer (fokussierter) Fläche |
| `--accent` | `#0a84ff` | T:L15 | Systemblau: Haken, ausgewählte Chips/Thumbs |
| `--glass` | `rgba(255,255,255,0.11)` | T:L16 | Glas-Fläche |
| `--rim` | `inset 0 1px 0 rgba(255,255,255,0.3), inset 0 0 0 1px rgba(255,255,255,0.08)` | T:L17 | Ruhender Rand (Oberkante heller) |
| `--rim-lit` | `inset 0 2px 0 rgba(255,255,255,0.7), inset 0 0 0 2px rgba(255,255,255,0.4)` | T:L18 | Rand fokussiert (Plain/Farbig) |
| `--lift` | `0 30px 60px rgba(0,0,0,0.55)` | T:L19 | Schatten angehobener (fokussierter) Elemente |
| `--turq` | `#0aa6b4` | T:L22 | Türkis, nur aktive Zustände |
| `--nebel` | `#b9d4df` | T:L23 | Nebel (Markenhandbuch Kap. 7); **definiert, im CSS nicht verwendet** (nur als `rgba(185,212,223,0.7)` in `.st-ordiscale .gl-row.focused .gl-end`) |

Weitere Variable nur zur Laufzeit (nicht in `:root`): im Vorschau-Block `.pv` setzt `J:settings.js Preview.render()` ein eigenes `--ts` und `font-family` an `.pv`, damit die Vorschau die fokussierte Option zeigt, ohne zu speichern.

### 2.2 Farben nach Rolle (alle Literale des CSS)

**Hintergründe und Ebenen**

| Rolle | Wert | Quelle |
|---|---|---|
| Bühne/Grund | `#090b10` (`--bg`) | S:#stage |
| Wallpaper | `src/img/bg.jpg`, `center / cover no-repeat`, `will-change: transform` | S:#bg |
| Seiten-Abdunklung (alle Ansichten außer Home) | `rgba(0,0,0,0.74)` | T:.page (S: `rgba(9,11,16,0.8)`) |
| Sicherheit-Seite (dunkler) | `rgba(5,7,11,0.92)` | T:#ha |
| Overlay hinter Menü/Dialog | `rgba(0,0,0,0.5)` | T:.overlay (S: 0.55) |
| Home gescrollt: flache Abdunkelung | `rgba(0,0,0,0.6)`, Opacity 0 → 1 | T:.home-dim |
| Home Nacht | gleiche Ebene, Opacity `0.75` (ergibt 0,6 × 0,75 = 45 % Schwarz) | T:#home.night .home-dim |
| Menü-/Dialogbox, Toast | `rgba(44,44,48,0.95)` | T:.menu-box, #toast |
| Panel Regler / Verlauf | `#141821` mit 2000-px-Abdunkelung `rgba(4,6,10,0.88)` | T:.ha-slider, .ha-logall |
| Kamerakachel-Grund | `#10141c`; fokussiert `#000` | T:.ha-tile.camera |
| Popup (Abdunkelung) | `rgba(4,6,10,0.94)`; Alarm `rgba(30,4,4,0.94)` | T:.ha-pop-cam, .ha-pop.k-alarm |
| Vollbild / Popup-Bild | `#000` | T:.ha-full, .ha-pop-cam |
| Bildschirmschoner | `#05060a`; Dunkelebene `#000` (Opacity 0→1 in 10 s) | S:#screensaver, .ss-dark |

**Glas- und Flächenstufen (weiß mit Alpha)**

| Alpha | Verwendung | Quelle |
|---|---|---|
| 0.06 | alte Listenzeile (S-Grundwert) | S:.setting-row |
| 0.07 | Favoritenablage, Gruppenkasten | T:#apps-section, .gl-box |
| 0.08 | Pair-Code-Fläche, Kachel „Alle Apps“ | T:.pair-code, S:.all-tile |
| 0.11 | **`--glass`**: Einstellungszeile (Setup), Zahnrad, Chip, Hinweis-Taste, Karten, HA-Kacheln | T:--glass |
| 0.12 | Nummernkreis Pair | T:.pair-num |
| 0.14 | Reglerspur | T:.ha-slider-track |
| 0.16 | Agenda-Fokusplatte | T:.agenda::before |
| 0.09 | Trennlinie in Gruppen | T:.gl-row + .gl-row::before |

**Text**

| Rolle | Wert | Quelle |
|---|---|---|
| Haupttext | `#f5f5f7` | --fg |
| Text auf weißer Fokusfläche | `#1c1c1e` | --ink |
| Zweittext | `rgba(235,235,245,0.62)` | --muted |
| Zweittext auf weißer Fläche | `rgba(28,28,30,0.6)` | T:.setting-row.focused .setting-value, .gl-row.focused .gl-value |
| Gruppenkopf, Fußnote | `rgba(235,235,245,0.42)` | T:.gl-head, .gl-foot |
| Pfeil `chevron-right` rechts in Zeile | `rgba(235,235,245,0.32)`; fokussiert `rgba(28,28,30,0.4)` | T:.gl-end |
| Hinweisleiste Text | `#a3a8b3` | S:.hints |
| Hinweis-Taste Text | `#e6e8ee`, Gewicht 600 | S:.hint-key |
| Marke-Name Konsolenkachel | `#ffffff`; Port `rgba(255,255,255,0.75)` | S:.input .name, .input .port |
| Mono-Initialen | `rgba(255,255,255,0.9)` | S:.mono |
| Bildschirmschoner | Uhr/Zeit `rgba(243,244,246,0.95)`, Datum/Titel `rgba(220,224,232,0.75)`, Detail `rgba(220,224,232,0.6)` | S:.ss-* |

**Türkis-Familie** (nur Ordiscale-Stil und Türöffner)

| Wert | Verwendung | Quelle |
|---|---|---|
| `#0aa6b4` (`--turq`) | Symbol/Haken/Schalter an, Halte-Balken | T:.st-ordiscale … |
| `rgba(10,166,180,0.16)` | fokussierte Zeile (Fläche) | T:.st-ordiscale .gl-row.focused |
| `rgba(10,166,180,0.5)` 1.5 px innen | fokussierte Zeile (Rand) | dto. |
| `rgba(10,166,180,0.3)` + 46 px Schatten | Leuchten hinter Zeile | dto. |
| `rgba(10,166,180,0.3)` Fläche + `0 0 72px 24px rgba(10,166,180,0.55)` | Home-Leuchten | T:.home-glow |
| `rgba(110,215,224,0.45)` 2 px innen, `rgba(255,255,255,0.55)` 2 px Oberkante | Rand der fokussierten Kachel (Ordiscale) | T:.icons-ordiscale .app.focused .tile::after |
| `rgba(110,215,224,0.4)` 1.5 px innen | Agenda-Fokus (Ordiscale) | T:.icons-ordiscale .agenda.focused::before |
| `rgba(10,166,180,0.18)` Fläche, `rgba(110,215,224,0.45)` 1.5 px innen | Türöffner-Chip | T:.ha-act.opener |
| `#6ed7e0` / fokussiert `#087f8a` | Türöffner-Symbol | T:.ha-act.opener .ha-chip-ic |
| `#eaf3f6` | Stage-Symbol (Ordiscale) | T:.st-ordiscale .stage-icon |
| `rgba(10,166,180,0.18)` Kreis 150 px + `0 0 110px 46px rgba(10,166,180,0.24)` | Leuchten hinter Stage-Symbol | T:.st-ordiscale .stage-icon::before |
| `rgba(185,212,223,0.7)` | Pfeil rechts, fokussiert (Ordiscale) | T:.st-ordiscale .gl-row.focused .gl-end |

**Statusfarben**

| Status | Wert(e) | Verwendung | Quelle |
|---|---|---|---|
| Grün | `#30d158` | Verbindungspunkt an, Schalter an (nicht Ordiscale), „alles geschlossen“, Symbol OK | T:.dot.on, .gl-switch::before, .ha-status.lv-ok .ha-dot |
| Orange/Amber | `#ffb340` (`--warn-moderate`); Fläche `rgba(255,179,64,0.12)` (Karte) / `0.16` (Chip), Rand `rgba(255,179,64,0.4)` 1.5 px / `0.45` | „offen“, Warnung Moderate | T:.ha-status.lv-open, .ha-chip.lv-open |
| Amber alt (Bild älter als 10 s) | `#f5b94a` | Bild-Zeitstempel | T:.ha-cam-time |
| Amber auf Weiß | `#9a5b00` (Einstellungen), `#b25d00` (HA) | Warnwert fokussiert | T:.gl-row.focused .gl-value.warn, .ha-chip.lv-open.focused .ha-chip-ic |
| Rot | `#ff453a`; Fläche `rgba(255,69,58,0.24)`, Ring `rgba(255,69,58,0.7)` 2 px | Alarm, offline, Warnung Severe | T:.ha-status.lv-alarm, .ha-chip.lv-alarm, S:.alert.warning.severe |
| Rot Text | `#ff6961`; auf Weiß `#d70015`; Ordiscale fokussiert `#ff8a80` | gefährliche Zeile („Löschen“), Alarm-Text | T:.gl-row.danger .gl-label … |
| Gelb | `#ffd60a`; Fläche `rgba(255,214,10,0.2)` | Stern (Favorit), „an“-Lampe, Klingel-Symbol, Feiertag in Woche | T:.ed-fav, .ha-tile.on .ha-icon, .k-bell, .wk-hol |
| „An“-Kachel (Lampe) | Fläche `rgba(255,179,64,0.3)` | warm wie Lampe | T:.ha-tile.on |
| Grau | `#8e8e93` | Statuspunkt unbekannt; `.c-gray`-Platte | T:.ha-dot, .st-color .c-gray |
| Blau | `#0a84ff` (`--accent`/`--waste`); Chip an `rgba(10,132,255,0.45)`; Bewegen-Modus `--accent` | Auswahl, Müll-Zeile | T:.chip.on, .ed-item.moving, S:.alert.waste |
| Live-Marke | Fläche `rgba(255,69,58,0.85)` (Modus live), sonst `rgba(0,0,0,0.55)` | Live-Badge | T:.ha-live-badge |

### 2.3 Schatten und Kanten

| Name | Wert | Verwendung |
|---|---|---|
| `--rim` | siehe 2.1 | **jede** Glasfläche in Ruhe: `.gl-box`, `.ha-card`, `.ha-tile`, `.chip`, Zahnrad, `.setting-row`, `.menu-box`, `#toast`, `.hint-key`, `.wk-col`, `.ha-action`, `#apps-section`, `.pair-code`, `.agenda::before` |
| `--rim-lit` | siehe 2.1 | Fokus bei Stil Plain/Farbig auf `.tile::after`, `.ha-tile.focused`, `.ha-chip.focused`, Vorschau-Fokus |
| `--lift` | `0 30px 60px rgba(0,0,0,0.55)` | fokussierte Kachel/Zahnrad/Chip/Zeile (Setup)/HA-Kachel/Toast |
| Zeile fokussiert (Gruppenliste, Plain/Farbig) | `0 18px 40px rgba(0,0,0,0.45)` | T:.gl-row.focused |
| Zeile fokussiert (Ordiscale) | `inset 0 0 0 1.5px rgba(10,166,180,0.5), 0 0 46px rgba(10,166,180,0.3), 0 18px 40px rgba(0,0,0,0.35)` | T:.st-ordiscale .gl-row.focused |
| Kachel fokussiert (Ordiscale) | `0 16px 36px rgba(0,0,0,0.35)` (Tile) + Rand auf `::after` | T:.icons-ordiscale .app.focused .tile |
| Menübox | `var(--rim), 0 40px 100px rgba(0,0,0,0.6)` | T:.menu-box |
| Toast | `var(--rim), var(--lift)` | T:#toast |
| Vorschau-Rahmen | `0 40px 90px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.12)` | T:.pv |
| Stage-Symbol (Farbig) | `0 40px 90px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)` | T:.st-color .stage-icon |
| Stage-Symbol (Schlicht) | `inset 0 0 0 3px rgba(255,255,255,0.18)` | T:.st-plain .stage-icon |
| QR-Fläche | `0 18px 50px rgba(0,0,0,0.45)` | T:.pair-qr |
| Panel Regler/Verlauf | `0 0 0 2000px rgba(4,6,10,0.88), 0 30px 80px rgba(0,0,0,0.6)` | T:.ha-slider, .ha-logall |
| Popup-Kamera | `0 0 0 2000px rgba(4,6,10,0.94), 0 30px 80px rgba(0,0,0,0.6)`; Alarm `0 0 0 2000px rgba(30,4,4,0.94), 0 0 0 6px #ff453a` | T:.ha-pop-cam |
| Schalterknopf | `0 2px 6px rgba(0,0,0,0.3)` | T:.gl-switch::after |
| Text-Schatten (Text direkt auf Foto) | `0 2px 14px rgba(0,0,0,0.5)` (Uhr, Agenda) | T:.clock, S:.agenda |
| Kamera-Name-Platte/Live-Badge | Fläche `rgba(0,0,0,0.5)` bzw. `0.55` | T:.ha-cam-name, .ha-live-badge |

Die **Abdunkelung als `box-shadow` mit 2000 px Ausbreitung** ist Absicht: die Kamerafläche bleibt ein transparentes Loch für AVPlay.

### 2.4 Radien

| Radius | Elemente |
|---|---|
| 999 px (Pille) | Chip (`.chip`), Toast, Hinweis-Taste (`.hint-key`) |
| 50 % (Kreis) | Zahnrad (84 × 84), Statuspunkt, Schalterknopf, runde Hinweistasten (38 × 38), Verbindungspunkt |
| 64 px | Stage-Symbol-Fläche (260 × 260) |
| 44 px | Favoritenablage `#apps-section` |
| 40 px | Menü-/Dialogbox |
| 36 px | QR-Fläche |
| 32 px | Kachel `.tile`, `.ha-tile`, Agenda-Fokusplatte |
| 30 px | Gruppenkasten `.gl-box`; Pair-Code |
| 28 px | Vorschau `.pv`, Regler/Verlauf-Panel, Popup-Kamera |
| 26 px | Karte `.ha-card`; Pair-Nummernkreis 26 px (52 × 52) |
| 24 px | `.setting-row`, `.wk-col`, `.ha-action`, `.alert`, Schalter-Spur (84 × 48) |
| 22 px | Zeile `.gl-row`, Thumbnail-Bild, Kamerakachel, `.ha-tile.ha-chip` |
| 20 px | Menüpunkt (`#menu-list li`), Dialog-Knopf (`.dialog-actions li`) |
| 18 px | `.ed-item`, `.lab-list li`, `#rename-input` |
| 16 px | `.wk-head` |
| 14 px | Mini-Kachel (`.mini .tile`), Farbplatte `.st-color .gl-ic` |
| 12 px | `.wk-hol`, Reglerspur |
| 10 px | `.ha-cam-name`, `.ha-cam-time`, `.ha-live-badge` |
| 3 px | Halte-Balken `.ha-hold` (Höhe 5) |
| 77 px | Vorschau-Wallpaper `.pv-bg` (28 px nach Skalierung 0,364583) |

Bildkacheln **ohne** Beschneidung: Rundung auf dem Kind (`border-radius: inherit`).

### 2.5 Abstände und Ränder

| Token | Wert | Bedeutung |
|---|---|---|
| `--edge` | 120 px | linker/rechter Rand fast aller Ansichten |
| Home-Ablage | `margin-left: -32px; padding: 32px; width: 1680px` | Favoritenablage reicht 32 px über die Kachelspalte hinaus (x 88 … 1832) |
| Kachelraster | Breite 300, Spaltenabstand 45, Zeilenabstand 24 (Home) / 34 (Alle Apps), Kachelhöhe 180 (Home) / 170 (Alle Apps) | siehe 3 |
| Konsolenkachel | 536 × 160, Abstand 36 | siehe 3 |
| Einstellungen | Stage x 120 / Liste x 900, Zeile 82 | siehe 3 |
| Chip (Sicherheit) | Abstand 16 px rechts und unten, Höhe `calc(52px + 22px * ts)` | siehe 3 |
| Karten-/Seitenspalte Sicherheit | Kameras 1160, Spalte 490, Abstand 30 | siehe 3 |

### 2.6 Typografie

**Schriftfamilie.** `--font` = `"Barlow", "SamsungOne", "Helvetica Neue", Arial, sans-serif` (J:appearance.js `FONTS[0]` + `FALLBACK = ', "SamsungOne", "Helvetica Neue", Arial, sans-serif'`). Barlow liegt lokal als statische Schnitte (`@font-face` in `S`, je ein `.woff2`, Latin): **300, 400, 500, 600, 700** (`src/fonts/barlow-<gewicht>.woff2`), ohne `font-display`. Wählbare Alternativen (Darstellung → Schrift): Manrope (200–800), Inter (100–900), Outfit (100–900), DM Sans (100–1000), jeweils variable Datei. Das CSS-Grundwert `--font: "Manrope", …` gilt nur, bis JS `apply()` die gewählte Schrift setzt. Mono nur im Lab (`Menlo, "Courier New", monospace`). Glättung: `-webkit-font-smoothing: antialiased`. Zeilenhöhe überall `normal` (Barlow ≈ 1,2 × Schriftgröße; gemessen 26 px → 31 px, 28 px → 34 px, 34 px → 39,1 px, 22 px → 27 px), außer wo unten genannt.

**Textgrößen `--ts`** (J:appearance.js `TEXT_SIZES`): Standard `1`, Groß `1.15`, Sehr groß `1.3`. Wirkt auf jede Größe der Form `calc(Npx * var(--ts))`. **Nicht skaliert:** Uhr (108/96 px), Seitentitel `h1` (64/60/56 px), Schalter/Kachel-Geometrie, Bildschirmschoner-Texte, QR, Wordmarks.

**Rollen (wirksame Werte, T überschreibt S).** Format: Größe / Gewicht / Besonderes.

| Rolle | Größe | Gewicht | Weiteres | Quelle |
|---|---|---|---|---|
| Uhr (Standard-Layout) | 108 px | 300 | `letter-spacing: -3px; line-height: 1` | T:#time |
| Uhr (Layout „Uhr links“) | 96 px | 300 | `letter-spacing: -2px` | T:#home.layout-column #time |
| Uhr-Zusatz (AM/PM) | 40 px (Spalte: 36) | 500 | `margin-left: 8px` | T:#time-suffix |
| Datum | `28 * ts` | 500 | Zweittext | T:#date |
| Wetter in Datumszeile | `26 * ts` | 600 | | T:.clock-sub .wx |
| WLAN in Datumszeile | `24 * ts` | 600 | Zweittext | S:.net |
| Termin „wann“ | `24 * ts` | 500 | Zweittext, `font-variant-numeric: tabular-nums` | S:.events .when |
| Termin „was“ | `30 * ts` | 600 | ein Zeile, Ellipsis | S:.events .what |
| Feiertag | `22 * ts` | 500 | Zweittext, Symbol 24 × 24 | S:.holiday |
| Warnzeile | `25 * ts` | 700 | `line-height 1.25` | S:.alert-line |
| Warn-Quelle/Zusatz | `18 * ts` | 500 / 700 | `.alert-src` Opacity 0.8 | S:.alert-sub |
| Reihenüberschrift (Home) | `28 * ts` | 600 | `letter-spacing: 0`, ohne Großschreibung | T:.shelf h2 |
| App-Name unter Kachel | `26 * ts` | 600 | zentriert, 1 Zeile, Ellipsis | T:.app .label |
| Konsole Name | `34 * ts` | 700 | `line-height 1.15` | S:.input .name |
| Konsole Port | `24 * ts` | 500 | `rgba(255,255,255,0.75)` | S:.input .port |
| Marke Wordmark | 60 px | 800 | `letter-spacing -1px`; lang: 44 px | S:.wordmark |
| Marke Monogramm | 64 px | 700 | `-1px` | S:.mono |
| Seitentitel (Alle Apps, Woche, Setup, Sicherheit) | 64 px (Sicherheit 60 px, `line-height 1.05`) | 700 | `letter-spacing -0.5px` | T:.page-head h1 |
| Seitenkopf-Zusatz | `28 * ts` | – | Zweittext, an Grundlinie rechts | S:.page-head |
| Split-Titel (Einstellungen) | 56 px | 700 | `-0.5px; line-height 1` | T:.split-head h1 |
| Krümel („Einstellungen“) | `26 * ts` | 500 | `line-height 1`, Zweittext | T:.split-head .crumb |
| Kopfnotiz | `22 * ts` | – | | T:.split-head .head-note |
| Stage-Titel | `44 * ts` | 700 | `line-height 1.15` | T:.stage-title |
| Stage-Text | `28 * ts` | – | `line-height 1.35`, Zweittext | T:.stage-text |
| Gruppenkopf | `22 * ts` | 600 | `letter-spacing 0.12em; text-transform: uppercase`, `rgba(235,235,245,0.42)` | T:.gl-head |
| Zeile Label | `31 * ts` | 500 | | T:.gl-row |
| Zeile Wert | `28 * ts` | 500 (von der Zeile geerbt) | Zweittext; mit `.warn`: 600 + `--warn-moderate` | T:.gl-value |
| Gruppenfußnote | `22 * ts` | – | `line-height 1.35`, 0.42-Grau | T:.gl-foot |
| Setup-Zeile / `.setting-row` | `34 * ts` | 500 | Wert `28 * ts`/500 | T:.setting-row |
| Chip (Hintergrund-Seite) | `28 * ts` | 600 | | S:.chip |
| Thumb-Titel | `20 * ts` | 500 | | S:.thumb-title |
| Editor-Zeile | `30 * ts` | 500 | | S:.ed-item |
| Menü-Titel / Dialog-Titel | `34 * ts` | 700 | | S:#menu-title |
| Menüpunkt / Dialog-Knopf | `30 * ts` | 400 | | S:#menu-list li |
| Textfeld | `34 * ts` | 600 | `font: 600 … var(--font)` | S:#rename-input |
| Toast | `28 * ts` | 500 | zentriert | S:#toast |
| Hinweisleiste | `22 * ts` | 400 (Taste 600) | `#a3a8b3` | S:.hints |
| Wochen-Kopf / -Datum | `24 * ts` 700 / `20 * ts` 500 | | | T:.wk-head |
| Woche Zeit / Titel | `19 * ts` 500 tabular / `22 * ts` 600, `line-height 1.2`, 2 Zeilen | | | T:.wk-time, .wk-title |
| Woche Feiertag / „+n weitere“ | `20 * ts` 600 | | | T:.wk-hol, .wk-more |
| HA: Gruppentitel | `28 * ts` 600 | | | T:.ha-group h2 |
| HA: Kachelname / Zustand | `26 * ts` 600 (`line-height 1.15`, 2 Zeilen) / `22 * ts` 500 | | | T:.ha-name, .ha-state |
| HA: Abschnittstitel | `20 * ts` 600, `0.12em`, Großschrift | | | T:.ha-sec > h2 |
| HA: Statustitel | `34 * ts` 700 (`line-height 1.1`) | | | T:.ha-status-title |
| HA: Status Zusatz / Alarmzeile | `22 * ts` / `19 * ts` | | Zweittext | T:.ha-status-sub |
| HA: Chip | `26 * ts` 500, Wert `22 * ts` | | | T:.ha-tile.ha-chip |
| HA: Karten-/Verlaufstitel | `20 * ts` 600, `0.12em`, Großschrift | | | T:.ha-card-h |
| HA: Verlaufszeile | `22 * ts` (Vollverlauf `28 * ts`), Zeit tabular | | | T:.ha-log-row |
| HA: Kameraname / Zeit | `21 * ts` 600 / `18 * ts` 600 tabular | | | T:.ha-cam-name |
| HA: Popup-Titel / -Untertitel | `44 * ts` 700 / `24 * ts` | | | T:.ha-pop-title |
| HA: Reglertitel / Prozent | `36 * ts` 600 / `30 * ts` tabular | | | T:.ha-slider-title |
| HA: Live-Marke | `20 * ts` 700, `0.04em` | | | T:.ha-live-badge |
| HA: Leerzustand | Titel `44 * ts` 700, Text `30 * ts` `line-height 1.35` | | | T:.ha-empty |
| Pair: Schritt | `34 * ts` 500, `line-height 1.3` | | | T:.pair-step |
| Pair: Code | `104 * ts` 600, `line-height 1`, tabular, Zelle `0.64em`, Lücke `0.28em` | | | T:.pair-code, .pair-ch |
| Pair: Status/Meldung | `28 * ts`; Meldungstitel `44 * ts` 700 | | | T:.pair-status, .pair-msg-title |
| Bildschirmschoner Zeit / Datum | 72 px 300 / 30 px | | | S:.ss-time, .ss-date |
| Bildschirmschoner Wetter | Temp 46 px 300, Detail 26 px | | | S:.ss-wx-temp |
| Bildschirmschoner Titel | 26 px 600, `0.18em`, Großschrift | | | S:.ss-title |
| Bildschirmschoner Termine | 28 px, `line-height 1.3` | | | S:.ss-agenda |

**`tabular-nums`** (`font-variant-numeric: tabular-nums`) steht an: `.events .when`, `.wk-time`, `.ha-cam-time`, `.ha-log-tm`, `.ha-slider-pct`, `.pair-time`, `.pair-code`, `.ss-agenda .when`.
**Großschrift** (`text-transform: uppercase`, Spreizung): nur Kopfzeilen in Gruppen/Abschnitten (`.gl-head`, `.ha-sec > h2`, `.ha-card-h`) und Bildschirmschoner-Titel; Reihenüberschriften auf Home sind **nicht** großgeschrieben.

### 2.7 Bewegung

Alle Dauern/Kurven aus dem CSS. Es werden nur `transform` und `opacity` animiert.

| Wo | Eigenschaft | Dauer / Kurve | Quelle |
|---|---|---|---|
| Home-Kachel Fokus | `transform` | 0.1 s `ease-out` | S:.row-track .tile |
| Gruppenzeile Fokus | `transform` | 0.12 s `ease-out` | T:.gl-row |
| Zahnrad Fokus | `transform` | 0.1 s `ease-out` | S:.gear |
| HA-Kachel/Chip | `transform` | 0.1 s `ease-out` | T:.ha-tile |
| Alle-Apps-Raster Fokus | **keine** Animation (zu viele Kacheln) | – | S:.row-track .tile Kommentar |
| Reihe seitlich (Row-Track) | `transform` | 0.18 s `ease-out` | S:.row-track |
| Home vertikal scrollen | `transform` | 0.25 s `ease-out` | T:#home-scroll |
| Raster/Listen scrollen | `transform` | 0.22 s `ease-out` | S:.grid, T:.gl-track, .ha-track, T:.home-glow Fahrt |
| Editor-Liste | `transform` | 0.18 s `ease-out` | S:.vtrack |
| Uhr/Agenda/Zahnrad ausblenden (gescrollt) | `opacity` | 0.2 s | T:#home .clock … |
| Home-Abdunkelung | `opacity` | 0.25 s | T:.home-dim |
| Agenda-Fokusplatte | `opacity` | 0.15 s | T:.agenda::before |
| Home-Leuchten | `transform` 0.22 s `ease-out`, `opacity` 0.2 s | | T:.home-glow |
| Schalter | Spur `opacity` 0.15 s, Knopf `transform` 0.15 s `ease-out` (`translateX(36px)`) | | T:.gl-switch |
| Toast | `opacity` | 0.2 s (Standzeit 3,5 s, J:ui.js) | S:#toast |
| Hinweisleiste ausblenden | `opacity` | 0.6 s | T:.hints |
| Regler-Füllung | `transform` | 0.12 s `ease-out`, `transform-origin: 0 50%` | T:.ha-slider-fill |
| Halte-Balken | `transform: scaleX(0→1)` | 2 s `linear` | T:.ha-act.holding .ha-hold |
| Nachtabdunkelung Sicherheit | `opacity` | 1.5 s | T:.ha-dim |
| Burn-in-Verschiebung Sicherheit | `transform` | 3 s `ease-in-out` | T:.ha-shift |
| Bewegen-Modus (Wackeln) | `wobble` `scale(1.12) rotate(∓1.6deg)` | 0.28 s `ease-in-out`, `infinite alternate` | T:@keyframes wobble |
| Bildschirmschoner Überblendung | `opacity` | 2000 ms `linear` | S:.ss-photo |
| Bildschirmschoner Schwenk | `transform` | per JS je Etappe, `linear` (90 s bei einem Bild) | J:screensaver.js |
| Bildschirmschoner Uhr/Text springt | `transform` | 1200 ms `ease-out` | S:.ss-clock, .ss-caption |
| Bildschirmschoner Dunkel | `opacity` | 10000 ms `linear` | S:.ss-dark |

**Fokus-Skalierungen (wirksam, T):**

| Element | `scale` | Quelle |
|---|---|---|
| App-Kachel, Konsole-„Input“ gemeinsame Regel | 1.12 | T:.app.focused .tile |
| Konsolenkachel (breit) | **1.05** (überschreibt 1.12) | T:.input.focused .tile |
| Zahnrad | 1.12 | T:.gear.focused |
| Einstellungszeile `.gl-row` | 1.035 | T:.gl-row.focused |
| Setup-/Alt-Zeile `.setting-row`, `.chip` | 1.03 | T:.setting-row.focused |
| HA-Kachel (Standard) | 1.08 | T:.ha-tile.focused |
| Kamerakachel | 1.04 | T:.ha-tile.camera.focused |
| Chip Sicherheit | 1.04 | T:.ha-tile.ha-chip.focused |
| Verlaufskarte | 1.02 | T:.ha-log.ha-tile.focused |
| Hintergrund-Thumbnail | 1.08 (S: 1.06) | T:.thumb.focused img |
| Vorschau-Kachel | 1.12 | T:.pv .app.pv-focus .tile |

Original-`S`-Werte (1.07 Kachel, 1.08 Zahnrad) sind von `T` überschrieben und nicht mehr sichtbar.

---

## 3. Layout je Ansicht

Alle Ansichten sind `<section class="view …">` mit `position:absolute; top/right/bottom/left: 0` (S:.view) direkt in `#stage`. Ansichten außer Home tragen `.page` (Abdunkelung `rgba(0,0,0,0.74)` über dem Wallpaper). Ansichtsnamen = Ids in `src/index.html`.

### 3.1 Startseite `#home` (01-home.png, 02-home-focus-agenda.png)

**Ebenen von hinten nach vorn** (DOM-Reihenfolge in `#home`): `#bg` (Wallpaper, außerhalb) · `#home-dim` (flache Abdunkelung, Opacity 0) · `#home-glow` (Türkis-Leuchten, nur Stil Ordiscale) · `header.clock` · `aside#agenda` · `#gear` · `#home-scroll` (Reihen). Hinweisleiste: **keine** auf Home (`hints: []`).

**Obere Zone (Top Shelf), Standardlayout „Uhr rechts“:**

| Element | Maße / Position | Quelle |
|---|---|---|
| `.clock` | `top: 46px; right: 232px; text-align: right`, Schatten `0 2px 14px rgba(0,0,0,0.5)`; Box gemessen x 1393, y 46, 295 × 142 (Inhaltsbreite wechselt mit Uhrzeit, rechte Kante fest bei x = 1688) | T:.clock |
| `#time` | 108 px / 300 / `-3px` / `line-height 1`; Höhe 108 | T:#time |
| `.clock-sub` | Flex, `justify-content: flex-end`, `margin-top: 0`, `gap: 22px`; gemessen y 154 (= 46 + 108), Höhe 34 | T:.clock-sub |
| `#date` | `28*ts`/500, Zweittext; `.clock-sub #date {margin-top: 0}` | T:#date |
| `.status-row` | Flex, `gap: 28px` (Rückfall in 1.1) | S:.status-row |
| `.wx` (Wetter) | in der Datumszeile: `gap 8px`, `26*ts`/600, Symbol 28 × 30; Symbol-SVG `viewBox 0 0 24 26`, Strich 1.6 | T:.clock-sub .wx |
| `.net` (WLAN) | `24*ts`/600, Zweittext, Symbol 28 × 28; offline `#ff453a`; `justify-content: flex-end` | T:.net |
| `#gear` | `top: 78px; right: 120px` (x 1716), 84 × 84, Kreis | T:.gear |
| `#agenda` | `top: 52px; left: 120px` (Inhalt), Fokusplatte reicht `16px 26px` darüber hinaus (`padding: 16px 26px; margin: -16px 0 0 -26px`, Box gemessen x 94 y 36); `width: auto; max-width: 880px`; `z-index: 0` | S:.agenda, T:.agenda |

Die erste Terminzeile liegt absichtlich auf der Höhe der Uhrziffern (Agenda-`top: 52`, Uhr `top: 46`). Der Zahnrad-Mittelpunkt (y = 78 + 42 = 120) liegt auf der Ziffernmitte.

**Layout „Uhr links“** (`#home.layout-column`, Darstellung → Uhr und Termine): `.clock {top: 44px; left: 120px; right: auto; text-align: left}`, `#time` 96 px / `-2px`, Suffix 36 px, `.clock-sub {justify-content: flex-start}`, `#agenda {top: 220px}`; oben rechts bleibt nur das Zahnrad. Terminzahl: Standard-Layout 3 (2 bei „Sehr groß“), Spalten-Layout 2 (1 bei „Sehr groß“) (J:home.js `AGENDA_LAYOUTS`). Platzmodell `agendaPlan` (J:home.js): freie Höhe = `SHELF_TOP (376) − layout.top`; ein Termin = `39*ts + 4` px (Zeile 30 px × 1,3), Feiertag `28,6*ts + 12`, Warnzeile `53,75*ts + 22`, Müllzeile `34*ts + 20`, 18 px unter den Hervorhebungen; reicht es nicht, entfällt erst der Feiertag, dann Termine, dann die Müllzeile (Warnung bleibt).

**Agenda-Aufbau:** `.alerts` (Warnung/Müll, `margin-bottom: 18px`, bei `.alerts-only` 0) → `.events` (Grid `grid-template-columns: auto minmax(0, 1fr)`, `column-gap: 28px; row-gap: 4px; align-items: baseline; line-height: 1.3`) → `.holiday` (`margin-top: 12px` nur mit Terminen). Text liegt direkt auf dem Foto (Schatten `0 2px 14px rgba(0,0,0,0.5)`), keine Karte; nur beim Fokus erscheint die Glasplatte.

**Reihen (`#home-scroll`).** Eine Ebene, `position:absolute; top:0; left:0; right:0; padding-top: 400px; will-change: transform; transition: transform 0.25s ease-out` (T:#home-scroll). Darin `#shelves` (Spalte, `margin-left: var(--edge)`) mit drei Bereichen, Abstand `#shelves .shelf + .shelf {margin-top: 24px}`. Gemessene Lage (Standardtext, mit Tuner-Kachel und einem HDMI-Gerät):

| Bereich | Box | Inhalt |
|---|---|---|
| `#apps-section` (Favoriten) | x 88, y 400, **1744 × 291** (`margin-left:-32px; padding:32px; width:1680px; border-radius:44px; background rgba(255,255,255,0.07); box-shadow: var(--rim)`) | Überschrift `<h2>` per `display:none`; Reihe `#apps-row` x 120, y 432, 1680 × 227 |
| App im Reihen-Raster | Wrapper `.app` 300 × 227 (Kachel 180 + Namen 16 Abstand + 31 Zeile); Spalten bei x 120 / 465 / 810 / 1155 / 1500, y 432 | Abstand `margin-right: 45px`, letzte Kachel `margin-right: 0` |
| `#inputs-section` (Konsolen) | y 715 (= 400 + 291 + 24), Breite 1800 | `<h2>` 28 px/600/Zweittext, `margin-bottom: 26px` (Höhe 34 → Reihe y 775); Reihe hat Kacheln 536 × 160 bei x 120, 692 (Abstand 36) |
| `#grid-section` („Weitere Apps“) | y 959 (= 715 + 220 + 24) | `<h2>` wie oben (Höhe 34), Raster ab y 1019 |
| `.home-grid` | `grid-template-columns: repeat(5, 300px); column-gap: 45px; row-gap: 24px; padding-bottom: 120px`; Kachel 180 hoch, Zeilenschritt 227 + 24 = 251 | T:.home-grid |

Die Favoritenablage hat **fünf** Kacheln (Konstante `FAVORITES = 5`, J:home.js); 5 × 300 + 4 × 45 = 1680 = Reihenbreite. Der Konsolenbereich entfällt (collapsed), wenn nichts angeschlossen ist (`.hidden`); Überschrift „Konsolen“ oder „Fernsehen & Konsolen“ (Tuner führt die Reihe an).

**Scrollverhalten.** Fokus in den ersten beiden Bereichen: Home bleibt stehen (Position 0). Fokus in `#grid-section`: `#home-scroll` verschiebt sich per `translateY(−pos)` um `pos = min(Gesamthöhe − 1080, max(0, Zeilen-Offset − 120))` (`SCROLL_MARGIN = 120`, J:home.js scrollHome); die Zeile steht dann 120 px unter dem oberen Rand. Ab `pos > 0` setzt JS die Klasse `scrolled` an `#home`: Uhr, Agenda, Zahnrad blenden aus (Opacity 0, 0.2 s), `.home-dim` wird sichtbar (Opacity 1, 0.25 s, `rgba(0,0,0,0.6)`). Nacht (`#home.night`): `.home-dim` Opacity 0.75, vor `scrolled` in der Kaskade.

**Namensanzeige.** Standard (`Prefs.appearance.names = 'focused'`): `.names-focused .app .label {visibility: hidden}`, nur `.app.focused .label` sichtbar; der Platz (31 px) bleibt reserviert. „immer“ = Namen überall (nur Zweittext-Farbe, fokussiert `--fg`); „nie“ = überall `visibility:hidden`. Datum aus: `.no-date #date {display: none}`.

**Türkis-Leuchten (Stil Ordiscale).** `#home-glow` (T:.home-glow): `position:absolute; top:0; left:0; width:300px; height:180px` (JS setzt Breite/Höhe je Kachelart: App 300 × 180, Konsole 536 × 160, Agenda = deren Box); `border-radius: 32px; background: rgba(10,166,180,0.3); box-shadow: 0 0 72px 24px rgba(10,166,180,0.55); opacity: 0; transition: transform 0.22s ease-out, opacity 0.2s`. JS (J:home.js glowTo) setzt `transform: translate(x px, y px)` auf die Position der fokussierten Kachel in `#home-scroll` (abzüglich Scroll-Position) und die Klasse `on` (Opacity 1, nur unter `.icons-ordiscale`). Kommt der Fokus von „nirgends“ (Zahnrad, andere Ansicht), erscheint es ohne Fahrt (nur Opacity).

### 3.2 Alle Apps `#all` (03-alle-apps.png)

| Element | Wert | Quelle |
|---|---|---|
| `.page-head` | `top: 88px; left/right: 120px`, Flex `space-between`, `align-items: baseline`; `h1` 64/700 (gemessen y 88, Höhe 77); `#all-count` rechts `28*ts` Zweittext | S:.page-head, T:.page-head h1 |
| `.grid-viewport` | `top: 210px; bottom: 100px; left: 96px; width: 1728px; overflow:hidden; padding: 20px 24px 0; box-sizing: border-box` (Platz für den wachsenden Fokus) | S:.grid-viewport |
| `.grid` | `grid-template-columns: repeat(5, 300px); column-gap: 45px; row-gap: 34px; transition: transform 0.22s ease-out`; Inhalt beginnt x 120, y 230 | S:.grid |
| Kachel | 300 × **170** (S:.tile; hier gilt NICHT die Home-Höhe 180), `border-radius 32`; Namen 31 px darunter; Zeilenschritt 217 + 34 = 251 (gemessen) | S:.tile, T:.tile |
| Fokus | `scale(1.12)` + `--lift`, **ohne Animation** (Raster zu groß) | T:.app.focused .tile |

### 3.3 Einstellungen: Bühne links, gruppierte Liste rechts (04-einstellungen.png, 05-darstellung.png, 06-auswahlliste.png)

Gemeinsames Skelett jeder Seite (`J:settings.js skeleton/renderPage`, Klasse `split` an der Ansicht, `st-ordiscale|st-plain|st-color` je Seite):

```html
<section id="settings" class="view page split st-ordiscale">
  <header class="split-head [has-crumb]"><div class="crumb">Einstellungen</div><h1>Darstellung</h1></header>
  <div class="stage [with-preview]">
    <div class="stage-art"><span class="stage-icon c-purple">…svg…</span></div>
    <h3 class="stage-title">…</h3><p class="stage-text">…</p>
  </div>
  <div class="gl-port"><div class="gl-track">
    <div class="gl-group"><div class="gl-head">STARTSEITE</div>
      <div class="gl-box"><div class="gl-row">…</div>…</div>
      <div class="gl-foot">…</div></div>
  </div></div>
</section>
```

| Element | Wert (gemessen auf Seite „Darstellung“ bzw. Übersicht) | Quelle |
|---|---|---|
| `.split-head` | `top: 70px` (mit Krümel `58px`), `left/right: 120px`; Krümel 26*ts/500, Höhe 26; `h1` `margin-top: 12px`, 56/700, `line-height 1`; Krümel fehlt auf der Übersicht (`display:none`, Titel y 82) | T:.split-head |
| `.stage` | `left: 120px; top: 230px; width: 700px; text-align: center`; mit Vorschau `top: 250px` | T:.stage |
| `.stage-icon` | 260 × 260, Radius 64, zentriert (`margin: 0 auto`), Symbol 128 × 128 | T:.stage-icon |
| `.stage-title` | `margin: 40px 0 0`, `44*ts`/700, `line-height 1.15`, leer = ausgeblendet | T:.stage-title |
| `.stage-text` | `max-width: 600px; margin: 18px auto 0`, `28*ts`, `line-height 1.35`, Zweittext; mit Vorschau `margin-top: 36px` | T:.stage-text |
| `.gl-port` | `top: 184px; bottom: 110px; left: 860px; width: 980px; padding: 16px 40px; box-sizing: border-box; overflow: hidden` | T:.gl-port |
| `.gl-track` | x 900, y 200, **Breite 900**; scrollt per `translateY(−pos)`, 0.22 s `ease-out` (J:settings.js scrollToRow: Zeile bringt bei erster/letzter ihrer Gruppe Kopf/Fußnote mit) | T:.gl-track |
| `.gl-group + .gl-group` | `margin-top: 34px` | T:.gl-group |
| `.gl-head` | `margin: 0 0 12px 28px`, 22*ts/600, `0.12em`, uppercase, `rgba(235,235,245,0.42)`; gemessen Höhe 27 | T:.gl-head |
| `.gl-box` | Radius **30**, `background: rgba(255,255,255,0.07)`, `box-shadow: var(--rim)`; Zeilen nahtlos untereinander | T:.gl-box |
| `.gl-foot` | `margin: 12px 28px 0`, 22*ts, `line-height 1.35`, 0.42-Grau | T:.gl-foot |
| `.gl-row` | `display:flex; align-items:center; min-height: calc(82px * ts); padding: 0 28px; border-radius: 22px`, 31*ts/500; **Höhe 82** (gemessen), Breite 900 | T:.gl-row |

Zeilen-Innenmaße: Symbol `.gl-ic` 40 × 40 (Symbol 30 × 30) mit `margin-right: 22px`; Label `flex: 1 1 auto; min-width: 0` (gewinnt, Ellipsis); Wert `flex: 0 1 auto; max-width: 55%; margin-left: 24px`; Kettenpfeil/Haken `.gl-end`/`.gl-check` 30 × 30, `margin-left: 16px`; Schalter `margin-left: 20px`. Trennlinien: `.gl-row + .gl-row::before` bei `left: 90px` (= 28 + 40 + 22; ohne Symbol `28px`; mit Mini-Kachel `146px`; Stil Farbig `102px`), `right: 0`, 1 px `rgba(255,255,255,0.09)`; um die fokussierte Zeile (`.focused::before` und die der Folgezeile) Opacity 0. Mini-Kachel in Zeile: 96 × 54, Radius 14, `margin-right: 22px`.

**Darstellung mit Live-Vorschau** (`.stage.with-preview`, J:settings.js Preview): `.pv` 700 × 394, Radius 28, `margin: 0 auto`; gemessen x 120, y 250. Innen `.pv-screen` 1920 × 1080 mit `transform: scale(0.364583)` (700/1920, `transform-origin: 0 0`). Die Vorschau zeichnet **dieselben Bühnenmaße wie Home** (Uhr `top 46 right 232` 108 px, Agenda `top 52`, Zahnrad `top 78 right 120`, Favoritenablage `top 400 left 88` 1680+64 breit, Kachel 300 × 180, Zeile „Weitere Apps“ `top 736 left 120`, Leuchten `top 432 left 120`, fokussierte erste Kachel `scale(1.12)` + `--lift`, `--rim-lit`; mit Leuchten leichterer Schatten `0 16px 36px rgba(0,0,0,0.35)` + Türkis-Rand). Nacht: `.pv-dim` `rgba(0,0,0,0.45)`. Das ist ein Modell der Startseite, keine echte.

**Übersichtsseite „Einstellungen“** (04): zwei Gruppen „Startseite“ (Apps & Favoriten, Konsolen & HDMI, Hintergrund, Darstellung, Bildschirmschoner, Kalender) und „System“ (Wetter, Feiertage, Home Assistant, Netzwerk, Navigationston, TV-Einstellungen, Erweitert); gemessen 13 Zeilen, Gruppe 1 Höhe 531 (inkl. Kopf), Gruppe 2 ab y 765; die Liste scrolled. Stage zeigt Symbol `sliders-horizontal` (grau) bzw. das Symbol der fokussierten Zeile.

**Auswahlliste `#pick`** (06): dieselbe Seite, eine Gruppe, jede Zeile `kind: 'check'` (Haken 30 × 30 rechts, bei nicht gewählt `visibility:hidden` damit der Wert-Block bleibt); Fokus startet am aktuellen Wert; Krümel = Elternseite; ggf. Fußnote `.gl-foot`; auf Darstellung-Listen Vorschau links, in der Symbolstil-Liste zeigt die Seite selbst den fokussierten Stil (`setStyleClass`).

**Sonderansichten** (eigene Bedienung, gleicher Stil): `#bg-settings` (Chips + Thumbnails: `.split-head.has-crumb`, `.settings-body {top: 230px; left/right: 120px}`; `.setting-block` Abstand 48; `.chips` Flex, `.chip` 28*ts/600, Padding `16px 32px`, Abstand 16, Pille, gemessen 111 × 66; `.thumbs` Grid `repeat(9, 168px)`, `column-gap: 21px; row-gap: 18px`; `.thumb img` 168 × 94, Radius 22; Titel 20*ts mit 10 px Abstand; gewählt Ring `0 0 0 4px var(--accent)`; fokussiert `scale(1.08)`, `var(--lift), 0 0 0 4px var(--fg)`), `#homeapps` (App-Editor: zwei Spalten `.ed-col` je 780 breit, `top: 230px; bottom: 110px`, links x 120, rechts x 1020; `h2` 28*ts/600; Liste `.vport top: 56px`; `.ed-item` Padding `10px 18px`, `margin-bottom: 6px`, Radius 18, 30*ts/500, Höhe 74, Mini-Kachel 96 × 54 mit `margin-right: 22px`; fokussiert weiß; Verschiebemodus `background: var(--accent)`, Text `#fff`; Stern `.ed-fav` `#ffd60a` 30 × 30 rechts), `#lab` (Entwickler, ohne Bedeutung für die Optik).

### 3.4 Sicherheits-Cockpit `#ha` (11-sicherheit.png)

Gedacht für stundenlangen Dauerbetrieb: dunkle Seite (`#ha {background: rgba(5,7,11,0.92)}`), Inhalt in `#ha-shift` (1920 × 1080, `will-change: transform`, springt alle 3 min um ≤ 6 px per `transform`, 3 s `ease-in-out`; Versätze `[[0,0],[5,3],[-4,6],[6,-4],[-5,-3],[3,-6],[-6,4],[2,5]]`, J:ha-view.js `SHIFTS`), Hinweisleiste blendet nach 60 s ohne Taste aus (Opacity), nachts dunkelt `#ha-dim` (Schwarz, Opacity 0.55, 1,5 s).

| Element | Wert | Quelle |
|---|---|---|
| Kopf `.page-head.ha-head` | `top: 50px; left/right: 120px; align-items: flex-end`; `h1` 60 px/700, `line-height 1.05`; `.ha-sub` `margin-top: 6px`, 26*ts Zweittext; `#ha-status` rechts 24*ts | T:.ha-head |
| Port `.ha-port` | `top: 150px; bottom: 96px; left: 80px; width: 1760px; padding: 28px 40px; overflow:hidden`; Inhalt x 120 … 1800 (1680 breit), startet y 178 | T:.ha-port |
| `.ha-track` | scrollt per `transform`, 0.22 s | T:.ha-track |
| `.ha-sec` | `position: relative; padding-bottom: 34px`; Titel `h2` 20*ts/600 `0.12em` uppercase, `margin-bottom: 14px` | T:.ha-sec |
| Oberer Block `.ha-top` | `margin-bottom: 28px; padding-bottom: 0`; **Höhe = max(Kamerablockhöhe, 440)** (JS `sideH`); enthält `.ha-cams` und `.ha-side`, beide `position:absolute; top:0; left:0` | T:.ha-top, J:ha-view.js renderTop |
| Kamerablock `.ha-cams` | Breite `CAM_W = 1160` (bei 4 Kameras 1108), Höhe `layout.h` | J:ha-view.js |
| Seitenspalte `.ha-side` | `left = camW + 30` (30 = `GAP`) → x 1310; Breite `1160 + 30 + 490 − camW − 30` = **490** (`SIDE_W`); Höhe `sideH` | J:ha-view.js |

**Kamerablock je Anzahl** (J:ha-view.js `camRects`, Rechtecke `[x, y, w, h]` im Block, `g = 20`; `PAGE = 6` Kameras je Seite):

| Kameras im Block | Blockhöhe | Rechtecke |
|---|---|---|
| 0 | 0 (Seitenspalte füllt volle Breite 1680) | – |
| 1 | 652 | `[0,0,1160,652]` |
| 2 | 321 | `[0,0,570,321]`, `[590,0,570,321]` |
| 3 | 428 | `[0,0,760,428]`, `[780,0,380,204]`, `[780,224,380,204]` (gemessen) |
| 4 (Block 1108 breit) | 632 | `[0,0,544,306]`, `[564,0,544,306]`, `[0,326,544,306]`, `[564,326,544,306]` |
| 5 oder 6 | `2h + 20` | 3 Spalten: `w = floor((1160 − 40) / 3) = 373`, `h = round(w × 9/16) = 210`, Position `(i mod 3)·(w+20), floor(i/3)·(h+20)` |
| ab 7 Kameras | 5 Kameras + Kachel „Weitere Kameras · n“ als sechster Platz | wie 5/6 |

Fester Mindestwert der Seitenspalte: 440 hoch. Kamerakachel = `.ha-tile.camera` mit Inline-Maßen (`left/top/width/height`).

**Seitenspalte:** Statuskarte `.ha-card.ha-status` oben (Höhe 150), darunter `Zuletzt`-Karte `.ha-log` (`top: 170px; bottom: 0`). Karten: Radius 26, `--glass`, `--rim`.

**Darunter:** Abschnitte „Türen und Fenster“, „Bewegung“, „Türöffner und Licht“ (bzw. „Licht“) als Chip-Zeilen; danach „Weitere Geräte“ nach Bereichen (`h3` 26*ts/600, `margin-bottom: 16px`, Gruppe `padding-bottom: 30px`), Raster `.ha-grid`: `repeat(5, 300px)`, `grid-auto-rows: calc(130px + 50px * ts)` (180 / 195 px), `grid-auto-flow: row dense`, `column-gap: 45px; row-gap: 24px`. Ohne Sicherheitsgeräte heißt die Seite „Zuhause“ und zeigt nur das Raster.

Gemessene Reihenfolge der y-Werte (3 Kameras): oberer Block y 178 (Höhe 440), Abschnittstitel y 646, Chips y 684 (Höhe 74), nächster Abschnitt y 830, y 976 …

**Popups und Vollbild** siehe 3.6.

### 3.5 Weitere Ansichten

**Wochenübersicht `#week`** (09-woche.png): `.page-head` (Titel „Diese Woche“, rechts „Mo 26. Okt bis So 1. Nov“). `.week-body {top: 190px; left/right: 120px; bottom: 110px; display:flex; flex-direction: column}`; darin `#week-alerts` (`margin-bottom: 20px`, Warnzeile `max-width: 1100px`) und `.week-cols` (`flex: 1`, Grid `repeat(7, minmax(0, 1fr))`, `column-gap: 14px`). Gemessen: Spalte 228 × 780 bei x 120 + n × 242. `.wk-col`: Flex-Spalte, `padding: 14px`, Radius 24, `--glass`, `--rim`. `.wk-head` (Flex `space-between`, `padding: 8px 12px`, Radius 16, 24*ts/700; Datum `.wk-date` 20*ts/500 Zweittext); **heute**: `.wk-col.today .wk-head` weiß (`--fg`, Text `--ink`, Datum `rgba(28,28,30,0.6)`). `.wk-list` `margin-top: 14px`, abgeschnitten; Eintrag `.wk-ev` `margin-bottom: 12px`, Zeit 19*ts/500 tabular Zweittext, Titel 22*ts/600 `line-height 1.2` 2 Zeilen (`-webkit-line-clamp: 2`); Feiertag `.wk-hol` `padding: 6px 10px`, Radius 12, `rgba(255,214,10,0.2)`, 20*ts/600; Überlauf „+n weitere“ `.wk-more` 20*ts/600 Zweittext. Hinweisleiste nur „Zurück – Home“. Nichts fokussierbar.

**Ersteinrichtung `#setup`** (10-ersteinrichtung.png): einspaltige Auswahlliste im Altstil: `.page-head` (Titel z. B. „Wie schaust du fern?“, rechts „Schritt 1 von 5“), `.setup-hint` (`top: 184px; left/right: 120px`, 28*ts Zweittext, gemessen y 184, Höhe 34), `.list-port` (`top: 270px`; in S: `position:absolute; bottom: 110px; left: 120px; width: 1228px; margin: -8px 0 -16px -64px; padding: 16px 64px; overflow:hidden`), darin `ul.settings-list` (`width: 1100px`, Start x 120, y 278). Zeilen `li.setting-row`: Flex, `padding: 24px 36px; margin-bottom: 12px`, Radius 24, `--glass` + `--rim`, 34*ts/500; Höhe 89 (gemessen), Wert rechts 28*ts Zweittext; Label `flex: 1 0 auto; margin-right: 24px; white-space: nowrap`. Fokus: weiße Zeile, `scale(1.03)`, `--lift`. Letzte Zeile „Überspringen“/„Weiter“. Abschluss „Fertig“ → „Zur Startseite“.

**Kopplungsansicht `#ha-pair`** (16-kopplung-qr.png): Skelett wie Einstellungsseite (`split-head.has-crumb`: Krümel „Home Assistant“, Titel „Mit dem Handy koppeln“), aber links `.pair-left` und rechts `.pair-right`:

| Element | Wert | Quelle |
|---|---|---|
| `.pair-left` | `top: 214px; left: 120px; width: 700px; text-align: center` | T:.pair-left |
| `.pair-qr` | `display:inline-block; padding: 22px; border-radius: 36px; background:#fff; line-height: 0; box-shadow: 0 18px 50px rgba(0,0,0,0.45)`; Code schwarz auf Weiß (`<rect fill="#fff">`, Modulpfad `#000`, `shape-rendering: crispEdges`); Fläche inkl. Ruhezone 360–440 px (Ziel `QR_PX = 440`, `QUIET = 4` Module, Modul = `max(4, floor(440 / (n + 8)))` ganze Pixel), Fehlerkorrektur M | T:.pair-qr, J:ha-pair.js qrSvg |
| `.pair-host` | `margin-top: 26px`, 24*ts Zweittext, Text „Öffnet <Host>“ | T:.pair-host |
| `.pair-right` | `top: 214px; left: 900px; width: 880px` | T:.pair-right |
| `.pair-step` | `margin-bottom: calc(26px * ts); padding-left: 78px`, 34*ts/500 `line-height 1.3`; `.pair-num` 52 × 52 Kreis `rgba(255,255,255,0.12)`, 28 px/700, zentriert, `top: calc(22px * ts − 26px)` | T:.pair-step |
| `.pair-code` | `display:inline-block; margin-top: 16px; padding: 14px 30px 18px; border-radius: 30px; background rgba(255,255,255,0.08); box-shadow: var(--rim)`; `104*ts` / 600 / `line-height 1` / weiß, `white-space: nowrap`; jedes Zeichen in Zelle `width: 0.64em; text-align:center`, nach 3 Zeichen `margin-left: 0.28em` („7KQ 2MX“) | T:.pair-code |
| `.pair-status` | `margin: 0 0 30px 78px`, 28*ts Zweittext; Restzeit `.pair-time` 600/tabular/`--fg`, `margin-right: 24px`; `.pair-state.warn` `--warn-moderate` | T:.pair-status |
| `.pair-actions` | `.gl-box` 780 breit, `margin-top: 36px` (Aktionen als gruppierte Liste) | T:.pair-actions |
| Meldungen | `.pair-msg-title` `44*ts`/700, `margin-top: 30px`; `.pair-msg-text` `max-width: 840px`, 28*ts, `line-height 1.4`, Zweittext; links `.pair-icon` (Stage-Symbol, `padding-top: 40px`) | T:.pair-msg-* |

### 3.6 Overlays und Sonderansichten

Alle Overlays tragen `.view.overlay` (Abdunkelung `rgba(0,0,0,0.5)`) und liegen über der Ansicht darunter.

| Overlay | Aufbau / Maße | Quelle |
|---|---|---|
| **Menü `#menu`** (07-menue.png, z. B. „Bewegen / Aus Favoriten entfernen“) | `.menu-box`: `top: 50%; transform: translateY(-50%); left: 640px; width: 640px; padding: 36px; border-radius: 40px; background: rgba(44,44,48,0.95); box-shadow: var(--rim), 0 40px 100px rgba(0,0,0,0.6)`. Titel `#menu-title` 34*ts/700, `margin-bottom: 20px`. Liste: `li` `padding: 16px 24px; margin-bottom: 6px; border-radius: 20px`, 30*ts, Zweittext; Höhe 68 (gemessen), Textbreite 568. Fokus: weiß (`--fg`/`--ink`). Haken `li.checked::before` 0.8em, Maske `--check-icon`, `margin-right: 0.5em` | S/T:.menu-box |
| **Textdialog `#rename`** | gleiche `.menu-box`; `#rename-input` `width:100%; padding: 18px 24px; border-radius: 18px; background: var(--fg); color: var(--ink); font: 600 calc(34px*ts) var(--font)`; nicht fokussiert Opacity 0.6; Geheimtext mit `-webkit-text-security: disc`; `.dialog-actions` (Flex, `gap 12px`, `margin: 20px 0 0`) mit Knöpfen „Speichern“/„Abbrechen“ (`li` `padding: 14px 28px; border-radius: 20px`, 30*ts) | S:#rename-input, .dialog-actions |
| **Toast `#toast`** | `position:absolute; bottom: 110px; left: 50%; width: 900px; margin-left: -450px; padding: 22px 34px; border-radius: 999px; background: rgba(44,44,48,0.95); box-shadow: var(--rim), var(--lift); text-align:center; 28*ts/500`; unsichtbar `opacity: 0`, sichtbar `.visible` (0.2 s); Standzeit 3,5 s. Gemessen bei einer Zeile: x 510, 900 × 78 (Höhe = 2 × 22 Padding + 34 Zeilenhöhe bei 28 px Schrift) | S/T:#toast |
| **Hinweisleiste `#hints`** | `left/right: 120px; bottom: 48px; display:flex; gap: 40px`, 22*ts, `#a3a8b3`; gemessen x 120, y 994, Höhe 38; je `.hint` Flex `gap: 12px`: `.hint-key` + `.hint-label`; ausgeblendet auf Home (`hidden`) | S:.hints |
| **Regler `#ha-slider`** (14-lichtregler.png) | `top: 380px; left: 460px; width: 1000px; height: 320px; border-radius: 28px; background:#141821`, Abdunkelung als Box-Shadow (2000 px). Titel `top: 44px; left/right: 56px` 36*ts/600; Spur `top: 160px; left/right: 56px; height: 24px; border-radius: 12px; background rgba(255,255,255,0.14); overflow:hidden`; Füllung `#fff` (`transform: scaleX(Anteil)`); Prozent `top: 214px; left: 56px` 30*ts tabular Zweittext. Hinweise: „Links/Rechts – Helligkeit“, „OK – Fertig“. Schritt 10 % | T:.ha-slider |
| **Verlauf `#ha-logall`** (15-verlauf.png) | `top: 70px; left: 460px; width: 1000px; height: 940px; border-radius: 28px; background:#141821`, Abdunkelung wie Regler. Titel „Zuletzt · letzte 12 Stunden“ (`.ha-card-h`, `top: 34px; left: 44px`); Liste `top: 96px; left/right: 44px; bottom: 30px`; Zeile `height: calc(52px * ts)`, 28*ts, Zeit-Spalte `calc(96px * ts)`, Symbol 22 × 22 `margin-right: 12px` (Farbe je Art: Klingel `#ffd60a`, offen `#ffb340`, Alarm `#ff6961`) | T:.ha-logall |
| **Popup `#ha-pop`** (12-klingel-popup.png) | 1920 × 1080; Kamera `.ha-pop-cam` `top: 100px; left: 300px; width: 1320px; height: 742px; border-radius: 28px; background:#000`, Box-Shadow-Abdunkelung `rgba(4,6,10,0.94)`; Alarm: roter Ring 6 px `#ff453a` + Abdunkelung `rgba(30,4,4,0.94)`, Titel `#ff6961`. Fuß `.ha-pop-foot` `top: 872px; left: 300px; width: 1320px`, Flex `space-between`: links Titel 44*ts/700 + Untertitel 24*ts (`margin-top: 6px`) Zweittext, rechts Aktionschip `.ha-pop-actions .ha-tile.ha-chip` `height: 96px; padding: 0 34px 0 28px; margin: 0; 30*ts`. Ohne Kamera (`.no-cam`) ganzflächig `rgba(4,6,10,0.94)`, Fuß `top: 440px`. Live-Marke im Popup `top: 22px; right: 22px` | T:.ha-pop |
| **Vollbild `#ha-full`** (13-vollbild.png) | 1920 × 1080, `#000`; Bild `object-fit: contain`, Radius 0; Name `top: 48px; left: 120px` 36*ts/600, Schatten `0 2px 14px rgba(0,0,0,0.8)`; Live-Marke `top: 44px; right: 120px` | T:.ha-full |
| **Live-Marke `.ha-live-badge`** | `padding: 5px 14px; border-radius: 10px; background: rgba(0,0,0,0.55)`; 20*ts/700 `0.04em`; Modus live: `rgba(255,69,58,0.85)`; Texte „Live“, „Verbinde …“, „Standbild“; leer = ausgeblendet | T:.ha-live-badge |

### 3.7 Bildschirmschoner `#screensaver` (08-bildschirmschoner.png)

Zwei Fotoebenen für Überblendung (`#ss-photo-a`, `#ss-photo-b`), Scrim, Beschriftung, Uhr, Dunkelebene. Alles nur `transform` und `opacity`.

| Element | Wert | Quelle |
|---|---|---|
| `#screensaver` | Grund `#05060a` | S:#screensaver |
| `.ss-photo` | `top: -90px; left: -160px; width: 2240px; height: 1260px` (320 × 180 größer als die Bühne, Versatz halb davon); `background: center / cover`; `opacity: 0; transition: opacity 2000ms linear; will-change: transform, opacity`; Schwenk (J: `PAN_X = 160`, `PAN_Y = 90`) per `translate`, **kein** Zoom | S:.ss-photo |
| `.ss-scrim` | `left/right/bottom: 0; height: 420px; background: linear-gradient(180deg, rgba(3,4,7,0), rgba(3,4,7,0.55))` (statisch) | S:.ss-scrim |
| `.ss-caption` | `left: 120px; bottom: 96px`; `.ss-title` 26 px/600, `0.18em`, uppercase, `rgba(220,224,232,0.75)` | S:.ss-caption |
| `.ss-clock` | vier Anker, alle ~2,5 min wechselnd (J: `CLOCK_MOVE_MS = 150 s`): `pos-0 {right:120px; bottom:96px}`, `pos-1 {right:120px; top:96px}`, `pos-2 {left:120px; top:96px}` (linksbündig), `pos-3 {right:120px; top:470px}`; zusätzlicher Versatz `NUDGES = [[0,0],[7,-5],[-6,6],[4,8]]` | S:.ss-clock |
| Uhrenzeile | `.ss-clock-row` Flex `justify-content: flex-end; align-items: flex-end; gap: 36px`; Zeit `.ss-time` 72/300 `line-height 1` `rgba(243,244,246,0.95)`; Datum 30 px `margin-top: 10px`; mit Wetter `.ss-clock-main` links 1-px-Linie `rgba(220,224,232,0.22)` und `padding-left: 36px` | S:.ss-time … |
| Wetter | Temp 46/300, Symbol 44 × 48, Detail 26 px `margin-top: 10px`, `rgba(220,224,232,0.6)` | S:.ss-weather |
| Termine | `.ss-agenda` Grid `auto minmax(0, 1fr)`, `column-gap: 22px; row-gap: 8px; max-width: 640px; margin: 28px 0 0 auto; padding-top: 24px; border-top: 1px solid rgba(220,224,232,0.22); 28px; line-height 1.3`; „wann“ `rgba(220,224,232,0.6)` tabular; „was“ `rgba(243,244,246,0.9)` | S:.ss-agenda |
| Warnzeilen | `.ss-alerts` `margin-top: 28px`; `.alert` 700 breit, rechtsbündig, Padding `8px 20px 8px 14px`, Zeile 23 px, Zusatz 18 px, Symbol 30 × 30; Termine danach `margin-top: 16px`, ohne Linie | S:.ss-alerts |
| `.ss-dark` | `#000`, Opacity 0 → 1 in 10 s linear (nachts nach 15 min oder früher) | S:.ss-dark |

Kein Verlauf wird zur Laufzeit komponiert; der einzige Verlauf ist der statische Scrim.

---

## 4. Komponenten

Jede Komponente: Aufbau, Maße, Zustände, Fokus. Maße ohne Vermerk stehen im CSS; „gemessen“ siehe Lesehilfe. Fokus wird über die Klasse `.focused` gesetzt (J:ui.js focusOn), Aus/An über `.on`, nicht erreichbar `.off-line`, beschäftigt `.busy`.

### 4.1 App-Kachel (Home-Reihe, Home-Raster, Alle Apps)

```html
<div class="app [focused] [moving]">
  <div class="tile" style="background: #e62117"> <!-- brand.bg inline: Vollfarbe oder linear-gradient -->
    <img class="mark" src="img/tiles/youtube.svg">   <!-- ODER .wordmark / .mono / canvas.icon-art.icon-canvas / img.icon-art -->
    <!-- ::after = Glanz + Rand (siehe unten) -->
  </div>
  <div class="label">YouTube</div>
</div>
```

| Teil | Wert | Quelle |
|---|---|---|
| `.app` | `flex: none; width: 300px`; `margin-right: 45px` in der Reihe (letzte 0); im Raster `width: 300px` | T:.row-track .app, .home-grid .app |
| `.tile` | `position: relative; border-radius: 32px`; Höhe **180** in Home-Reihe und -Raster (`T:.row-track .app .tile`, `.home-grid .app .tile`), **170** in Alle Apps (`S:.tile`), Mini 54 | S:.tile, T:.tile |
| Rahmen | **nie** als Schatten auf `.tile` (`T:.app .tile, .input .tile {box-shadow: none}`), sondern auf `::after` darüber, damit randlose Symbole den Rand nicht verdecken | T:.app .tile::after |
| `::after` (ruhend) | `position:absolute; top/left/right/bottom: 0; border-radius: inherit; pointer-events: none; background: linear-gradient(to bottom, rgba(255,255,255,0.14), rgba(255,255,255,0) 50%); box-shadow: var(--rim)` | T:L309 |
| `::after` (fokussiert) | `background: linear-gradient(160deg, rgba(255,255,255,0.34), rgba(255,255,255,0.06) 45%, rgba(255,255,255,0) 60%); box-shadow: var(--rim-lit)` | T:L325 |
| `::after` (fokussiert, Stil Ordiscale) | Rand `inset 0 2px 0 rgba(255,255,255,0.55), inset 0 0 0 2px rgba(110,215,224,0.45)` statt `--rim-lit` | T:L331 |
| Fokus | `.tile` `transform: scale(1.12)`, `box-shadow: var(--lift)`; Ordiscale: `box-shadow: 0 16px 36px rgba(0,0,0,0.35)` + `#home-glow` dahinter; Animation `transform 0.1s ease-out` mit `will-change: transform` nur in Reihen (`.row-track .tile`), **nicht** im Alle-Apps-Raster | T:.app.focused .tile |
| `.label` | `margin-top: 16px; 26*ts / 600; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis`; Farbe `--faint`, fokussiert `--fg`; Höhe 31 | T:.app .label |
| Bewegen-Modus | `.app.moving .tile {animation: wobble 0.28s ease-in-out infinite alternate}` zwischen `scale(1.12) rotate(-1.6deg)` und `scale(1.12) rotate(1.6deg)` | T:.app.moving |

**Kachel-Inhalte** (J:home.js tileFace):

- **Markenlogo (`img.mark`)**: vorgefärbte SVG `img/tiles/<key>.svg`; Standard `top: 22%; left: 18%; width: 64%; height: 56%; object-fit: contain` (T:.mark; S hatte 26/22/56/48). Marken mit eigenem `pad: [v, h]` setzen inline `top: v%; height: (100−2v)%; left: h%; width: (100−2h)%` (Prime Video `[12,10]`, RTL+ `[8,8]`). Gemessen: Logo in 300 × 180 liegt bei 192 × 101 (contain).
- **Schriftzug (`.wordmark`)**: `position:absolute; top/right/bottom/left: 0; display:flex; align-items:center; justify-content:center; 60px/800; letter-spacing:-1px`, Farbe inline `brand.fg`; `.long` 44 px (Mini: 15 px; Mini normal 22 px, `letter-spacing: 0`).
- **Monogramm (`.mono`)** für unbekannte Apps: zentriert, 64 px/700, `letter-spacing:-1px`, `rgba(255,255,255,0.9)`, Großbuchstaben aus Anfangsbuchstaben; Kachelgrund `linear-gradient(160deg, hsl(h,38%,32%), hsl(h,42%,16%))` mit `h = hue(name)`; neutraler Grund `#1c1c1e`.
- **Randloses Systemsymbol der Samsung-App** (`canvas.icon-art.icon-canvas` bzw. `img.icon-art`): `position:absolute; top:0; left:0; width:100%; height:100%; object-fit: contain; border-radius: inherit`; der Canvas (`object-fit: cover`) ist `1.25×` Kachelgröße (`ICON_SCALE`), das Symbol sitzt mittig ganz darauf, seine äußersten Pixelspalten/-zeilen (3 % innen, `ICON_INSET`) werden bis zum Kachelrand gezogen (Band 15 % Rand ausgespart, `ICON_BAND`; Überlappung 12 %, `ICON_OVERLAP`), so läuft die Fläche nahtlos weiter. Freistehende Logos bleiben ganz auf Markenfarbe (`#1c1c1e` ohne Marke). Der Rand liegt immer auf `::after`.
- **Kachel „Alle Apps“** (`.all-tile`): `background: rgba(255,255,255,0.08)`, Symbol 64 × 64 zentriert (`margin: -32px 0 0 -32px`).

**Zustände:** normal; fokussiert; bewegen (wackelt); Name unsichtbar (`names-focused`/`names-never`, siehe 3.1).

### 4.2 Favoritenleiste

`#apps-section.shelf` > `h2` (versteckt) + `.row-viewport` (1680 breit) > `#apps-row.row-track` (Flex) mit fünf `.app`. Ablage: `margin-left: -32px; padding: 32px; width: 1680px; border-radius: 44px; background: rgba(255,255,255,0.07); box-shadow: var(--rim)`; gemessen x 88, y 400, 1744 × 291. Kein seitliches Scrollen. Fokus = Kachel (4.1). Beispiel: Reihe mit YouTube, Netflix, ARD, ZDF, Prime Video.

### 4.3 Konsolen-/HDMI-/Fernsehen-Kachel

```html
<div class="input [focused]">
  <div class="tile" style="background: <brand.bg | #2a2f3a>">
    <img class="mark"> <!-- nur wenn Logo gewählt -->
    <div class="meta"><div class="name">PlayStation</div>
      <div class="port"><span class="dot [on]"></span>HDMI 2</div></div>
  </div>
</div>
```

| Teil | Wert | Quelle |
|---|---|---|
| `.input` | `flex: none; width: 536px; margin-right: 36px` | S:.input |
| `.tile` | **Höhe 160** (T; S: 190), `display:flex; align-items:center; padding: 0 40px`, Radius 32, `::after`-Rand/Glanz wie 4.1 | T:.input .tile |
| `.mark` | `position: relative; flex: none; width: 80px; height: 80px; margin-right: 30px; top/left: auto` | S:.input .mark |
| `.name` | `34*ts/700`, weiß, `line-height 1.15`, 1 Zeile Ellipsis | S:.input .name |
| `.port` | `margin-top: 10px; 24*ts/500; rgba(255,255,255,0.75)`; Gemessen Name y 816, Port y 865 | S:.input .port |
| `.dot` | 14 × 14 Kreis, `margin-right: 12px; vertical-align: 1px; background rgba(255,255,255,0.35)`; **an**: `#30d158` | T:.dot.on |
| Fokus | `scale(1.05)` (breit, damit sie die Nachbarn nicht berührt), sonst wie App-Kachel | T:.input.focused .tile |

Fernsehen-Kachel (Tuner) ist identisch gebaut, ohne `.dot`, Port-Text „Kabel, Satellit, Antenne“, Marke `tvtuner` (Verlauf `linear-gradient(135deg,#0b2a4a,#1f6fd1)`). Anschlüsse ohne Eintrag: Name „Neues Gerät“.

### 4.4 Agenda-Zeilen und Hervorhebungen

```html
<aside id="agenda" class="agenda has-events has-alerts">
  <div id="alerts" class="alerts"><div class="alert warning moderate">…</div><div class="alert waste">…</div></div>
  <div id="events" class="events"><span class="when">Heute 19:00</span><span class="what">Zahnarzt</span> …</div>
  <div id="holiday" class="holiday"><svg>…</svg><span>1. Weihnachtstag · am 25. Dezember</span></div>
</aside>
```

- **Zeilen:** `.when` 24*ts/500 Zweittext tabular, `white-space: nowrap`; `.what` 30*ts/600 weiß, Ellipsis. Zweispaltiges Grid (siehe 3.1).
- **Feiertag:** `.holiday` Flex `align-items:center; gap: 12px`, 22*ts/500 Zweittext, Symbol 24 × 24 (`flex:none`, Kalender-Linien-Symbol, Strich 2, viewBox 24); gemessener Text „1. Weihnachtstag · am 25. Dezember“.
- **Hervorhebungszeile `.alert`** (Warnung/Müll; J:alerts.js): Flex `align-items:center; gap: 16px; max-width: 880px; padding: 10px 24px 10px 18px; border-radius: 24px; color:#fff; text-shadow: none; box-shadow: inset 0 0 0 2px rgba(255,255,255,0.28)`; folgende `.alert` `margin-top: 12px`. Symbol `.alert-icon svg` `calc(34px * ts)` (Dreieck bzw. Mülltonne, Strich 2, rund). Text `.alert-line` 25*ts/700 `line-height 1.25` 1 Zeile Ellipsis; `.alert-sub` Flex `space-between; gap: 24px; margin-top: 2px; 18*ts; line-height 1.25` mit Quelle (`.alert-src`, 500, Opacity 0.8, Text „Quelle: Deutscher Wetterdienst“) und „+n weitere“ (`.alert-more`, 700). Farben: `warning.moderate` Fläche `#ffb340`, Text `#1c1c1e`; `warning.severe` Fläche `#ff453a`; `waste` Fläche `#0a84ff`; alles flach, nichts weichgezeichnet.
- **Zustände:** normal; fokussiert (Platte `.agenda::before`: `inset 0`, `border-radius: 32px`, `rgba(255,255,255,0.16)`, `box-shadow: var(--rim)`, Opacity 0 → 1 in 0.15 s; Ordiscale: Rand `inset 0 0 0 1.5px rgba(110,215,224,0.4)` + Leuchten dahinter); versteckt (`.hidden`, wenn weder Termine noch Feiertag noch Hervorhebung).

### 4.5 Uhr

```html
<header class="clock">
  <div id="time"><span id="time-main">16:05</span><span id="time-suffix"></span></div>
  <div class="clock-sub"><div id="date">Montag, 26. Oktober</div><div class="status-row">…</div></div>
</header>
```

Standardlayout und Spaltenlayout: Maße in 3.1. Datum: `toLocaleDateString(locale, {weekday:'long', day:'numeric', month:'long'})`, erster Buchstabe groß. 24 h: „16:05“; 12 h: „4:05“ + Suffix „AM/PM“ (Suffix 40 px/500, `margin-left: 8px`). Schatten `0 2px 14px rgba(0,0,0,0.5)`. Die Uhr wächst nicht mit `--ts`.

### 4.6 Wetter- und WLAN-Zeile

In der Datumszeile, rechtsbündig (`.status-row`): `.wx` (Symbol + Temperatur, z. B. „7°“), `.net` (WLAN/Ethernet-Symbol; offline Rot `#ff453a`, Symbol `cloud-off`-Stil). Maße siehe 3.1. Wetter-SVG: `viewBox="0 0 24 26"`, `fill none; stroke currentColor; stroke-width 1.6; round`, 28 × 30 px. WLAN/Netz-SVG: `viewBox 0 0 24 24`, Strich 2, 28 × 28. Ohne Wetterort `.wx.hidden`; ohne Netzstatus `.net.hidden`.

### 4.7 Zahnrad (Einstellungen)

`div#gear.gear` mit Inline-SVG (`viewBox 0 0 24 24; fill none; stroke currentColor; stroke-width 1.8; round caps/joins`, Zahnrad mit Mittelkreis `r=3.2`), SVG `44 × 44` bei `top: 20px; left: 20px`.
Ruhe: 84 × 84, `border-radius: 50%`, `background: var(--glass)`, `box-shadow: var(--rim)`, Farbe `--fg`. Fokus: `background: var(--fg); color: var(--ink); transform: scale(1.12); box-shadow: var(--lift)` (weißer Fill, kein Türkis, in allen Symbolstilen). Position `top: 78px; right: 120px`. Gescrollt: Opacity 0.

### 4.8 Einstellungszeilen (`.gl-row`)

```html
<div class="gl-row">                       <!-- + .danger | .noicon | .with-mini | .focused -->
  <span class="gl-ic c-blue"><svg>…</svg></span>
  <span class="gl-label">Darstellung</span>
  <span class="gl-value [warn]">Barlow · Standard</span>
  <!-- je nach kind: -->
  <span class="gl-end"><svg>chevron-right</svg></span>           <!-- nav -->
  <span class="gl-switch [on]"></span>                           <!-- toggle -->
  <span class="gl-check"><svg>check</svg></span>                 <!-- check (hidden, wenn nicht gewählt) -->
  <span class="gl-end"><svg>square-arrow-out-up-right</svg></span> <!-- external -->
</div>
```

| `kind` | Aussehen |
|---|---|
| `nav` | Label, optional Wert, Pfeil `chevron-right` (30 × 30, `rgba(235,235,245,0.32)`) |
| `toggle` | Label, Schalter (4.9); `value` leer |
| `check` | Label, optional Wert (Notiz), Haken 30 × 30 `--accent` (Ordiscale: `--turq`); nicht gewählt `visibility: hidden` |
| `action` | nur Label (und ggf. Wert); `.danger` färbt das Label rot (`#ff6961`) |
| `external` | Label, Pfeil `square-arrow-out-up-right` |
| `info` | Label + Wert, keine Aktion |

Ruhe: transparent im `.gl-box`. Fokus je Symbolstil: siehe 7. Mit Mini-Kachel (App-/Konsolenzeile): `.mini` 96 × 54 statt Symbol, Klasse `with-mini`.

### 4.9 Schalter (`.gl-switch`)

84 × 48, `border-radius: 24px`, `flex: none; margin-left: 20px; background: rgba(120,120,128,0.36)`. `::before`: Spur-Füllung `inset 0`, `border-radius: inherit`, `#30d158` (Ordiscale: `var(--turq)`), Opacity 0, bei `.on` 1 (0.15 s). `::after`: Knopf 40 × 40, `top: 4px; left: 4px`, Kreis `#fff`, Schatten `0 2px 6px rgba(0,0,0,0.3)`, bei `.on` `translateX(36px)` (0.15 s `ease-out`). In fokussierter Zeile: Spur `rgba(120,120,128,0.32)` (Plain/Farbig) bzw. `0.36` (Ordiscale).

### 4.10 Häkchenliste (`pick`)

Eine Gruppe aus `check`-Zeilen (4.8). Gewählt = sichtbarer Haken; Fokus startet auf der gewählten Zeile; OK übernimmt und geht eine Ebene zurück. Optional zeigt die Zeile den Schriftnamen in der eigenen Schrift (`label.style.fontFamily`). Ja/Nein-Entscheidungen sind stattdessen Schalter.

### 4.11 Bühne mit Vorschau

Siehe 3.3. Zustand ohne Vorschau: `.stage-icon` (260 × 260, Radius 64, Symbol 128) + `.stage-title` + `.stage-text`. Mit Vorschau: `.pv` (700 × 394) statt Symbol; `.stage-title` leer (ausgeblendet). Das Stage-Symbol variiert je Stil (7).

### 4.12 Menü / Dialog

Maße in 3.6. Menüzeile normal: transparent, Zweittext; fokussiert: `background: var(--fg); color: var(--ink)`; gewählt: Haken vor dem Text. Dialog-Knöpfe nebeneinander mit 12 px Abstand.

### 4.13 Toast

Pille, `rgba(44,44,48,0.95)`, Rand `--rim`, Schatten `--lift`, mittig, `bottom: 110px`, 900 breit. Einblenden per Opacity.

### 4.14 Hinweisleiste mit Tastensymbolen

```html
<div id="hints" class="hints">
  <div class="hint"><span class="hint-key round"><svg>OK-Ring</svg></span><span class="hint-label">Auswählen</span></div>
  <div class="hint"><span class="hint-key round"><svg>Zurück-Bogen</svg></span><span class="hint-label">Home</span></div>
</div>
```

| Teil | Wert | Quelle |
|---|---|---|
| `.hints` | siehe 3.6; Abstand zwischen Gruppen 40 px | S:.hints |
| `.hint-key` (Text, z. B. „Links/Rechts“) | Pille: `border: 0; border-radius: 999px; padding: 4px 16px; background: var(--glass); box-shadow: var(--rim); color #e6e8ee; 600` | T:.hint-key |
| `.hint-key.round` (Symbol) | `display:flex; align-items:center; justify-content:center; width: 38px; height: 38px; padding: 0; border-radius: 50%`; SVG 24 × 24 | T:.hint-key.round |
| Symbole | **OK**: Ring (`circle r=9`, Strich 2) + gefüllter Punkt (`r=4`) = Mitte des Steuerrings; **Zurück**: Bogenpfeil `M9 14L4 9l5-5` + `M4 9h11a5 5 0 0 1 0 10h-4`, Strich 2.2, rund; **Links/Rechts**: `M9 7l-5 5 5 5M15 7l5 5-5 5`; **Hoch/Runter**: `M7 9l5-5 5 5M7 15l5 5 5-5` (je Strich 2.2). Alles andere als Text | J:ui.js KEY_ICONS |
| `.hint-label` | `22*ts`, `#a3a8b3` | S:.hints |

Beispieltexte: Einstellungen „OK – Auswählen“, „Zurück – <Elternseite>/Home“; Menü „OK – Auswählen“, „Zurück – Schließen“; Woche „Zurück – Home“; Cockpit „OK – Auswählen“, „Zurück – Home“; Türöffner fokussiert „OK – 2 s halten: Tür öffnen“; Regler „Links/Rechts – Helligkeit“, „OK – Fertig“. Home zeigt keine Leiste; im Cockpit blendet sie nach 60 s ohne Taste aus (`#ha.idle:not(.hidden) ~ #hints {opacity: 0}`).

### 4.15 HA-Kachel („Weitere Geräte“)

```html
<div class="ha-tile ha-light [on] [off-line] [busy] [focused]">
  <span class="ha-icon"><svg>…</svg></span>
  <div class="ha-name">Wohnzimmer</div>
  <div class="ha-state">An · 80 %</div>
</div>
```

| Teil | Wert | Quelle |
|---|---|---|
| `.ha-tile` | `position: relative; display:flex; flex-direction: column; justify-content: flex-end; padding: 20px 24px; box-sizing: border-box; border-radius: 32px; background: var(--glass); box-shadow: var(--rim); color: var(--fg); will-change: transform; transition: transform 0.1s ease-out`; Grid-Zelle 300 × `calc(130px + 50px * ts)` (180 bei Standard) | T:.ha-tile, .ha-grid |
| `.ha-icon` | `position:absolute; top: 18px; left: 22px; 36 × 36; color: var(--muted)`; Symbole als eigene Pfade, `stroke-width 1.9` | T:.ha-icon |
| `.ha-name` | 26*ts/600, `line-height 1.15`, 2 Zeilen (`-webkit-line-clamp: 2`) | T:.ha-name |
| `.ha-state` | `margin-top: 4px`, 22*ts/500 Zweittext, 1 Zeile Ellipsis | T:.ha-state |
| `.on` | `background: rgba(255,179,64,0.3)`, Symbol `#ffd60a` | T:.ha-tile.on |
| `.off-line` | `opacity: 0.55`; `.busy` `opacity: 0.7` | T:.ha-tile |
| Fokus | `background: var(--fg); color: var(--ink); transform: scale(1.08); box-shadow: var(--lift), var(--rim-lit)`; Symbol und Zustand `rgba(28,28,30,0.6)`; `.on.focused` Symbol `#b25d00` | T:.ha-tile.focused |

### 4.16 Kamerakachel

```html
<div class="ha-tile camera [wide] [no-image] [stale] [is-live] [focused]" style="left:0;top:0;width:760px;height:428px">
  <img class="ha-cam-img"><div class="ha-cam-none">Kein Bild</div>
  <div class="ha-cam-name">Klingel</div><div class="ha-cam-time">18:41</div>
  <video class="ha-video"> / <object class="ha-avplay"> <!-- Live -->
</div>
```

| Teil | Wert | Quelle |
|---|---|---|
| Kachel | `position:absolute; padding: 0; border-radius: 22px; background: #10141c`; Maße je Anzahl in 3.4 | T:.ha-tile.camera |
| Bild `.ha-cam-img` | `position:absolute; 100 % × 100 %; border-radius: inherit; object-fit: cover` (180°-Kameras `.wide`: `contain`, dunkle Balken) | T:.ha-cam-img |
| Name `.ha-cam-name` | `left: 14px; bottom: 12px; max-width: 70%; padding: 4px 12px; border-radius: 10px; background: rgba(0,0,0,0.5); #fff; 21*ts/600`, 1 Zeile Ellipsis | T:.ha-cam-name |
| Zeit `.ha-cam-time` | nur bei `.stale` (Bild > 10 s): `right: 14px; bottom: 12px`, gleiche Platte, `#f5b94a`, 18*ts/600 tabular | T:.ha-cam-time |
| „Kein Bild“ | zentriert, 28*ts/600 Zweittext, nur bei `.no-image` | T:.ha-cam-none |
| Fokus | weißer **Ring**, nicht Fill (das Bild deckt ihn): `background: #000; transform: scale(1.04); box-shadow: var(--lift), 0 0 0 5px var(--fg)` | T:.ha-tile.camera.focused |
| „Weitere Kameras“ | `.ha-tile.camera.more`: Spalte zentriert, `--glass`, Symbol `cctv` 52 × 52 (`margin-bottom: 14px`), Text 24*ts/600; fokussiert weiße Fläche, `--ink` | T:.ha-tile.camera.more |
| Live | `.is-live .ha-video {visibility: visible}` blendet Standbild aus; unter AVPlay werden `#stage`, `#ha`, `.ha-full`, `.ha-pop-cam` transparent und `#bg`, `#ha-shift` unsichtbar (`html.ha-avplay`) | T:.is-live, html.ha-avplay |

### 4.17 Statuskarte

`.ha-card.ha-status.lv-ok|lv-open|lv-alarm`: Höhe 150, `padding: 28px 26px 0 80px`, Radius 26, `--glass`, `--rim`. Punkt `.ha-dot` 28 × 28 bei `top: 38px; left: 30px`, Kreis (Standard `#8e8e93`). Texte: `.ha-status-title` (34*ts/700), `.ha-status-sub` und `.ha-status-alarm` (22*ts bzw. 19*ts, Zweittext, `margin-top: 4px`, 1 Zeile Ellipsis).

| Zustand | Punkt | Karte |
|---|---|---|
| `lv-ok` („Alles geschlossen“) | `#30d158` | Standard-Glas |
| `lv-open` („n offen: …“, „n ohne Meldung“, „Keine Verbindung · Letzter Stand HH:MM“) | `#ffb340` | `background: rgba(255,179,64,0.12); box-shadow: inset 0 0 0 1.5px rgba(255,179,64,0.4)` |
| `lv-alarm` („Alarm ausgelöst“) | `#ff453a` | `background: rgba(255,69,58,0.24); box-shadow: inset 0 0 0 2px rgba(255,69,58,0.7)` |

### 4.18 Chips (Sicherheit)

```html
<div class="ha-tile ha-chip lv-ok|lv-open|lv-alarm|lv-idle|lv-off [focused]">
  <span class="ha-chip-ic"><svg>door-closed</svg></span><span class="ha-chip-name">Haustür</span><span class="ha-chip-val">zu</span>
</div>
```

Maße: Flex-Zeile `align-items:center; justify-content:flex-start; height: calc(52px + 22px * ts)` (74 bei Standard); `margin: 0 16px 16px 0; padding: 0 26px 0 22px; border-radius: 22px; 26*ts/500; white-space: nowrap; max-width: 900px`; Symbol 30 × 30 `margin-right: 14px`, Farbe Zweittext; Wert `margin-left: 14px; 22*ts` Zweittext; Name `min-width: 0` (Ellipsis). Container `.ha-chips` Flex `flex-wrap: wrap; margin-bottom: -16px`. Gemessen: Chips x 120, 552, 837, … (Abstand 16).

| Zustand | Aussehen |
|---|---|
| `lv-ok` | Symbol `#30d158`, Glas |
| `lv-open` | `background: rgba(255,179,64,0.16); box-shadow: inset 0 0 0 1.5px rgba(255,179,64,0.45)`, Symbol `#ffb340` |
| `lv-alarm` | `rgba(255,69,58,0.24)`, Ring 2 px `rgba(255,69,58,0.7)`, Symbol `#ff453a` |
| `lv-idle` | Standard-Glas (ohne Zusatz) |
| `lv-off` | `opacity: 0.55` |
| fokussiert | **immer weiß**, unabhängig vom Status: `background: var(--fg); color: var(--ink); box-shadow: var(--lift), var(--rim-lit); transform: scale(1.04)`; Symbol/Wert `rgba(28,28,30,0.6)`; offen+fokussiert Symbol `#b25d00` |

Lampen/Schalter (`ha-act`): gleiche Hülle mit `ha-icon` (statisch 30 × 30) statt `ha-chip-ic`; `.on` `background: rgba(255,179,64,0.3)`, Symbol `#ffd60a`.

### 4.19 Türöffner-Chip mit Halte-Balken

Basis wie Chip, Klasse `ha-act opener`: `background: rgba(10,166,180,0.18); box-shadow: inset 0 0 0 1.5px rgba(110,215,224,0.45)`; Symbol `lock` bzw. `lock-open` in `#6ed7e0` (fokussiert `#087f8a`); Wert „OK halten“ (Kontakt/Taste) oder Schlosszustand. Zusatzelement `<span class="ha-hold">`: `position:absolute; left: 14px; right: 14px; bottom: 7px; height: 5px; border-radius: 3px; background: var(--turq); transform: scaleX(0); transform-origin: 0 50%`; bei `.holding` `scaleX(1)` in `2s linear` (= `HOLD_OPEN_MS`). Nach 2 s erscheint ein Menü „<Tür> jetzt öffnen?“ (Fokus auf „Abbrechen“, „Ja, öffnen“).

### 4.20 Popup (Klingel / Tür geöffnet / Alarm)

Aufbau und Maße in 3.6. Zustände: Klingel/Tür (neutral), Alarm (`.ha-pop.k-alarm`: roter Ring, Titel `#ff6961`), ohne Kamera (`.no-cam`). Aktionschip „Haustür öffnen“ nur mit zugeordnetem Öffner (Höhe 96). Schließt mit Zurück, nach 3 min selbst.

### 4.21 Live-Badge

Siehe 3.6. Textfarbe weiß (geerbt), Fläche `rgba(0,0,0,0.55)`, bei „Live“ rot.

### 4.22 Regler

Siehe 3.6. Zustände: Füllung 0–100 % in 10-%-Schritten (`transform: scaleX(Anteil)`), Prozenttext darunter.

### 4.23 Verlaufskarte „Zuletzt“

`.ha-card.ha-log.ha-tile` (fokussierbar): `position:absolute; top: 170px; bottom: 0; left/right: 0; display:block; padding: 0`; Kopf `.ha-card-h` (`top: 22px; left: 28px`), Zählung `.ha-log-more` (`top: 22px; right: 26px; 20*ts` Zweittext, z. B. „4 von 12“), Liste `.ha-log-list` (`top: calc(36px + 28px * ts); left: 28px; right: 24px; bottom: 16px; overflow:hidden`). Zeile `.ha-log-row` Flex `align-items:center; height: calc(40px * ts); 22*ts; nowrap`: Zeit `.ha-log-tm` (`width: calc(70px * ts)`, tabular, Zweittext), Symbol `.ha-log-ic` 22 × 22 (`margin-right: 12px`), Text `.ha-log-tx` (Ellipsis). Art-Klassen `k-bell|k-open|k-alarm` färben Symbol (`#ffd60a`, `#ffb340`, `#ff6961` auch Text). Nur ganze Zeilen werden gezeigt. **Fokus: weißer Ring**, nicht Fill: `background: var(--glass); color: var(--fg); transform: scale(1.02); box-shadow: var(--lift), 0 0 0 4px var(--fg)`.

### 4.24 Weitere kleine Komponenten

- **Mini-Kachel `.mini`**: 96 × 54, `.tile` Höhe 54, Radius 14, `margin-right: 22px` (in `.ed-item`: `22px`); Wordmark/Mono 22 px.
- **Chip (Hintergrundseite) `.chip`**: Pille `border-radius: 999px; background: var(--glass); box-shadow: var(--rim); padding: 16px 32px; margin-right: 16px; 28*ts/600` Zweittext; `.on`: `background: rgba(10,132,255,0.45)` Text `--fg` mit Haken (Maske `--check-icon`, 0.8em); `.focused`: weiß (auch `.on.focused`, Haken bleibt). Fokus `scale(1.03)`, `--lift`.
- **Thumbnail `.thumb`**: Bild 168 × 94, Radius 22; Titel darunter; gewählt: Ring `0 0 0 4px var(--accent)` + Haken `--accent`; fokussiert `scale(1.08)` + `--lift` + Ring `--fg`.
- **Editor-Zeile `.ed-item`**: siehe 3.3; Stern (`ed-fav`) und Bewegen-Symbol (`ed-move`, 30 × 30).
- **Leerzustand `.ha-empty`**: `top: 260px; left: 120px; width: 1200px`; `h2` 44*ts/700; `p` `margin: 18px 0 32px; 30*ts; line-height 1.35` Zweittext; `.ha-action` Knopf `padding: 18px 36px; border-radius: 24px; --glass; --rim; 30*ts/600`, fokussiert weiß mit `--lift`.

---

## 5. Symbole

**Bibliothek.** Lucide (ISC), Version `lucide-static 1.61.0`, unverändert aus dem Ordiscale-Markenpaket; Quellen `src/img/icons/<name>.svg` (+ `LICENSE`, `VERSION.txt`), erzeugt in `src/js/icons.js` per `node scripts/build-icons.mjs`. Aufruf `Icons.svg(name, className)` liefert Inline-SVG:

```html
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">…Pfade…</svg>
```

Raster 24 × 24, **Strichstärke 2**, runde Enden/Ecken, `fill: none`, Farbe über `currentColor`. Skalierung nur über die CSS-Größe des `svg`, nie die Strichstärke ändern. Inline statt `<img>`, damit die Textfarbe wirkt (externes `<use>` ist auf `file://` blockiert).

**Verwendete Lucide-Symbole (Namen in `scripts/build-icons.mjs` `NAMES`):** a-large-small, calendar, calendar-check, calendar-days, check, chevron-right, circle-user-round, circle-x, clock-3, cloud-off, cloud-sun, eye, flag, flask-conical, gamepad-2, house, image, images, key-round, languages, layout-grid, log-in, log-out, map-pin, monitor-play, moon, moon-star, music-2, network, panels-top-left, play, plug-zap, plus, refresh-cw, rocket, rotate-ccw, router, server, shapes, shield-check, signal, sliders-horizontal, smartphone, square-arrow-out-up-right, tag, text-quote, timer, trash-2, triangle-alert, tv, type, upload, volume-2, wand-sparkles, wifi; Sicherheit: activity, app-window, bell-ring, cctv, door-closed, door-open, layers-2, lock, lock-open, shield, shield-alert, video, warehouse. Ein unbekannter Name zeichnet nichts.

**Eigene Linien-SVG (gleicher Stil: Raster 24, runde Enden, `currentColor`), nicht aus Lucide:** Zahnrad Home (Strich **1.8**, 44 px), Kalender am Feiertag (Strich 2, 24 px), Warndreieck/Mülltonne (Strich 2), Wetter (`viewBox 0 0 24 26`, Strich **1.6**), Netz (Strich 2), Tastensymbole (2 / 2.2), HA-Gerätesymbole in „Weitere Geräte“ (Strich **1.9**, J:ha-view.js `ICON_PATHS`), Stern Favorit (gefüllt `currentColor`, 30 px), Bewegen-Pfeile (Strich 2.2), Haken-Maske (Strich 3). Markenlogos sind Vollflächen-SVG (`img/tiles/*.svg`), keine Linien.

**Größen nach Ort:**

| Ort | Symbolgröße | Fläche | Quelle |
|---|---|---|---|
| Einstellungszeile `.gl-ic` | 30 × 30 | Box 40 × 40 (Farbig: Platte 52 × 52, Radius 14) | T:.gl-ic |
| Pfeil/Haken rechts `.gl-end`/`.gl-check` | 30 × 30 | – | T:.gl-end |
| Stage-Symbol | 128 × 128 | Fläche 260 × 260 | T:.stage-icon svg |
| Zahnrad Home | 44 × 44 | Kreis 84 | T:.gear svg |
| Chip-Symbol | 30 × 30 | – | T:.ha-chip-ic |
| Verlaufssymbol | 22 × 22 | – | T:.ha-log-ic |
| „Weitere Kameras“ | 52 × 52 | – | T:.ha-more-ic |
| HA-Kachel-Symbol | 36 × 36 | – | T:.ha-icon |
| Feiertagssymbol | 24 × 24 | – | S:.holiday svg |
| Warnsymbol | `calc(34px * ts)` (Bildschirmschoner 30 px) | – | S:.alert-icon svg |
| Wetter | 36 × 40 (Datumszeile 28 × 30; Bildschirmschoner 44 × 48) | – | S:.wx svg |
| WLAN | 34 × 34 (Datumszeile 28 × 28) | – | S:.net svg |
| Tastensymbol | 24 × 24 | Kreis 38 | T:.hint-key.round svg |
| Stern / Bewegen im Editor | 30 × 30 | – | T:.ed-fav svg |
| Haken in Chip/Menü/Thumb | `0.8em`, Maske `--check-icon`, `margin-right: 0.5em`, `vertical-align: -0.05em` | – | S:.chip.on::before |
| Alle-Apps-Kachel | 64 × 64 | – | S:.all-tile svg |

**Farbe je Zustand (Einstellungssymbole):** Ruhe `--muted`; fokussiert Plain `--ink`, Ordiscale `--turq`, Farbig `#fff` auf Platte; Haken `--accent` (Ordiscale `--turq`); Pfeil rechts `rgba(235,235,245,0.32)` (fokussiert Plain/Farbig `rgba(28,28,30,0.4)`, Ordiscale `rgba(185,212,223,0.7)`). Chip-Symbole: ruhig `--muted`, ok `#30d158`, offen `#ffb340`, Alarm `#ff453a`, Türöffner `#6ed7e0`, Lampe an `#ffd60a`, fokussiert `rgba(28,28,30,0.6)` (offen fokussiert `#b25d00`, Türöffner fokussiert `#087f8a`).

### 5.1 Die drei Symbolstile (Darstellung → Symbolstil)

Gespeichert in `Prefs.appearance.iconStyle` (`ordiscale` Standard | `plain` | `color`; J:appearance.js `ICON_STYLES`). Klassen: `icons-<stil>` an `<html>` (steuert Startseite) und `st-<stil>` an **jeder Einstellungsseite** (so zeigt die Stil-Auswahlliste den fokussierten Stil, ohne etwas zu ändern). Farbplatten-Klassen `c-blue c-indigo c-purple c-pink c-orange c-green c-teal c-red c-gray` hängen an `.gl-ic` und `.stage-icon`, wirken aber **nur** im Stil Farbig.

| Merkmal | **Ordiscale** (Standard) | **Schlicht** (`plain`) | **Farbig** (`color`) |
|---|---|---|---|
| Idee | Linien-Symbole, aktive Zeile leicht türkis mit sanftem Leuchten | Nur Linien-Symbole, aktive Zeile weiß | Weiße Symbole auf farbigen Flächen wie Apple-Einstellungen |
| Zeilensymbol (Ruhe) | Linie `--muted`, 30 px, keine Platte | wie Ordiscale | weiß (`#fff`) auf Platte 52 × 52, Radius 14, Farbe `.c-*` |
| Fokussierte Zeile | `background: rgba(10,166,180,0.16); color: var(--fg); box-shadow: inset 0 0 0 1.5px rgba(10,166,180,0.5), 0 0 46px rgba(10,166,180,0.3), 0 18px 40px rgba(0,0,0,0.35)`; `scale(1.035)` | `background: var(--fg); color: var(--ink); box-shadow: 0 18px 40px rgba(0,0,0,0.45)`; `scale(1.035)` | wie Schlicht |
| Symbol fokussiert | `--turq` | `--ink` | `#fff` (Platte bleibt) |
| Wert fokussiert | `rgba(235,235,245,0.75)`; Warnwert `--warn-moderate` | `rgba(28,28,30,0.6)`; Warnwert `#9a5b00` | wie Schlicht |
| Gefährliche Zeile fokussiert | Label `#ff8a80` | `#d70015` | `#d70015` |
| Haken (`.gl-check`) | `--turq` | `--accent` | `--accent` |
| Schalter an | `--turq` | `#30d158` | `#30d158` |
| Trennlinie `left` | 90 px (ohne Symbol 28; Mini 146) | wie Ordiscale | **102 px** (ohne Symbol 28; Mini 146) |
| Stage-Symbol | Farbe `#eaf3f6`; dahinter Kreis 150 px `rgba(10,166,180,0.18)` mit `0 0 110px 46px rgba(10,166,180,0.24)` | Farbe `rgba(235,235,245,0.85)`, Ring `inset 0 0 0 3px rgba(255,255,255,0.18)` auf 260 × 260 / Radius 64 | Fläche in `.c-*`-Farbe, weißes Symbol, `box-shadow: 0 40px 90px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)` |
| Startseite: gewählte Kachel | `#home-glow` + leichter Schatten `0 16px 36px rgba(0,0,0,0.35)` + Türkis-Rand | `--lift` + `--rim-lit`, kein Leuchten | wie Schlicht |
| Startseite: gewählte Agenda | Platte + Türkis-Innenring `inset 0 0 0 1.5px rgba(110,215,224,0.4)` + Leuchten | nur Platte | nur Platte |
| Türkis sonst | nur Haken/Schalter/Symbol/Leuchten (aktiv) | nirgends | nirgends |

Farbplatten (nur Farbig): `.c-blue #0a84ff`, `.c-indigo #5e5ce6`, `.c-purple #bf5af2`, `.c-pink #ff375f`, `.c-orange #ff9f0a`, `.c-green #30d158`, `.c-teal #30b0c7`, `.c-red #ff453a`, `.c-gray #8e8e93` (T:L1918).

Kein Emoji, kein Symbolzeichen aus einer Schrift irgendwo in der Oberfläche; was wie ein Zeichen aussieht (Haken, Stern, Pfeil), ist SVG oder Maske.

---

## 6. Do / Don't (was die Optik kaputt macht)

**Do**
- Fokus **immer** über eine Kombination aus Größe, hellerer Fläche/Ring und Schatten ausdrücken (Werte in 7); der fokussierte Text ist auf Weiß `#1c1c1e`.
- Ränder **innen** als `inset`-Schatten (`--rim`), Glanz als statischer Verlauf auf einer `::after`-Ebene über dem Inhalt.
- Fixe Bühne 1920 × 1080, absolute Positionen und feste px-Werte; Texte nach Rolle aus 2.6; Schriftgrößen mit `calc(Npx * var(--ts))` wo sie mitwachsen sollen.
- Barlow 300/400/500/600/700 lokal laden; Uhr 300, Überschriften 700, Listentexte 500, Namen 600.
- Seitenränder `--edge` = 120 px halten; Textblöcke auf Home und Seitenköpfe beginnen bei x = 120.
- Weiche Schatten großzügig; Abdunkelung über `box-shadow` mit großer Ausbreitung (Kamera-Loch).
- Animation nur `transform`/`opacity`; Fokusfahrt 0.1–0.12 s, Scrollen 0.22–0.25 s, `ease-out`.
- Bei Flex-`gap` den Rückfall unter `.no-flex-gap` ergänzen.

**Don't**
- **Kein `backdrop-filter`**, kein `filter: blur`, kein großer Live-Verlauf (Radial/Linear über der halben Bühne): bricht auf dem TV auf 4,6 fps ein. Glas ist nur Alpha-Weiß plus `--rim`.
- **Kein Weiß-auf-Weiß:** fokussierte Flächen sind `#f5f5f7` mit Text `#1c1c1e` und Zweittext `rgba(28,28,30,0.6)`; nie `--fg` auf `--fg`.
- **Kein Türkis im Ruhezustand** und nicht als Fläche außer dem Türöffner-Chip (`rgba(10,166,180,0.18)`) und Leuchten/aktiver Zeile in Ordiscale. Kein Türkis in Schlicht/Farbig.
- **Kein Rand als Schatten auf der Kachel** (verdeckt vom randlosen Symbol): immer `::after`.
- **Keine Emoji, keine Schriftsymbole** (Haken, Stern, Pfeil als Textzeichen) als Grafik; Symbole als SVG oder Maske.
- **Keine Rundung per `overflow: hidden`** auf Kacheln/Bildern; Rundung am Kind.
- **Kein Zoom auf Vollbild-Ebenen** animieren (Schwenken statt Skalieren).
- Keine zusätzlichen Farben erfinden: keine bunten Akzente außer Statusfarben (3.2), Markenkacheln, Farbplatten (nur Stil Farbig).
- Kein Layout-Wechsel durch Fokus: der Fokus verschiebt nichts (Agenda-Platte nutzt Padding + negativen Margin, Gruppenliste hat Luft im Port, Fokus nur per `transform`).
- Keine Skalierung der Uhr mit `--ts`; kein Rasterbruch (Home immer 5 Spalten à 300, Abstand 45).
- Keine Überschriften in Großbuchstaben auf Home (nur Gruppen-/Abschnittsköpfe der Seiten).
- Nicht `S`-Werte raten: `tvos.css` ist maßgeblich (Kachel 180 hoch, Radius 32, Fokus 1.12, Schrift 600).
- Nicht ohne Text-Schatten Text auf das Foto setzen (Uhr, Agenda): `0 2px 14px rgba(0,0,0,0.5)`.

---

## 7. Fokusdarstellung im Überblick

Der Fokus ist **eine** Sprache, in drei Ausprägungen:

| Ausprägung | Wo | Genaue Werte |
|---|---|---|
| **Weiße Fläche** („Fill“) | Zahnrad, Setup-Zeile, Menüpunkt, Dialog-Knopf, Chip (Hintergrund), Editor-Zeile, HA-Kachel, HA-Chip, HA-Knopf, Einstellungszeile (Plain/Farbig), „Weitere Kameras“, Wochen-Kopf „heute“ (statisch) | `background: #f5f5f7; color: #1c1c1e;` Schatten `--lift` bzw. `0 18px 40px rgba(0,0,0,0.45)`; Skalierung siehe 2.7 |
| **Weißer Ring** | Kamerakachel, Verlaufskarte, Hintergrund-Thumbnail | Kamera: `scale(1.04)`, `box-shadow: var(--lift), 0 0 0 5px var(--fg)`; Verlauf: `scale(1.02)`, `var(--lift), 0 0 0 4px var(--fg)`; Thumb: `scale(1.08)`, `var(--lift), 0 0 0 4px var(--fg)` (weil das Bild die weiße Fläche verdeckt) |
| **Türkis-Leuchten** (nur Ordiscale) | Einstellungszeile, App-/Konsolenkachel und Agenda auf Home | Zeile: siehe 5.1; Kachel: `#home-glow` + `box-shadow: 0 16px 36px rgba(0,0,0,0.35)` + Rand `inset 0 2px 0 rgba(255,255,255,0.55), inset 0 0 0 2px rgba(110,215,224,0.45)` |
| **Weiße Kachel mit hellem Rand** | App-/Konsolenkachel (Plain/Farbig), Vorschau-Kachel | `scale(1.12)`/`1.05`, `box-shadow: var(--lift)`, `::after`: Glanz 160° + `--rim-lit` |

Fokus-Regeln: genau ein fokussiertes Element je Ansicht; Fokus auf einer Kachel verändert Nachbarn nicht; Fokus auf einer Zeile wächst über den Gruppenkasten hinaus (deshalb Padding im Port: `16px 40px`); Kameras und Chips bleiben im Fokus innerhalb ihres Abstands (Chips `max-width: 900px`, Abstand 16).

---

## 8. Abnahme (Nachbau gegen Referenz-Screenshots prüfen)

### 8.1 Vorgehen

1. Nachbau in 1920 × 1080 (Gerätepixel 1:1, kein Zoom) rendern: gleiche Bedingungen wie die Referenz (Textgröße Standard, Schrift Barlow, Symbolstil Ordiscale, Namen „Bei Auswahl“, Layout „Uhr rechts“, ein HDMI-Gerät plus Fernsehen-Kachel, Mock-Daten).
2. Screenshot und Referenz in einem Bildprogramm übereinanderlegen (Differenz-Modus) oder abwechselnd blinken lassen; Positionen mit Linealpunkten messen.
3. Toleranzen: Kanten und Positionen ±1 px; Textoberkanten ±2 px (Schriftrendering); Farben mit Pipette auf **ruhigen** Flächen (nicht auf Verläufen), ±2 pro Kanal.
4. Jede Abweichung über 2 px sofort gegen die Tabellen in 2 und 3 prüfen, nicht „nach Gefühl“ nachziehen.

### 8.2 Globale Checks (jede Ansicht)

- [ ] Bühne exakt 1920 × 1080, nichts scrollt außerhalb; Mauszeiger nicht sichtbar.
- [ ] Schrift Barlow (Ziffern der Uhr dünn/300, Überschriften 700); kein Fallback sichtbar (Helvetica/Arial-Anmutung = Schrift fehlt).
- [ ] Grund `rgb(9,11,16)`; Seiten (außer Home) liegen mit `rgba(0,0,0,0.74)` über dem Foto (Foto schwach erkennbar).
- [ ] Fokussiertes Element: weiße Fläche `rgb(245,245,247)`, Text `rgb(28,28,30)`, Skalierung laut 2.7, weicher Schatten nach unten.
- [ ] Türkis (`rgb(10,166,180)`) erscheint nur an fokussierter Zeile/Kachel, Haken, Schalter an, Türöffner-Chip, Halte-Balken.
- [ ] Alle Rundungen laut 2.4; keine eckigen Flächen; Kachelrand durchgehend (auch bei randlosen Symbolen).
- [ ] Kein Verlauf außer Kachelglanz und Marken-Kachelgründen; keine Unschärfe hinter Glasflächen.
- [ ] Keine Emoji, keine Schriftsymbole; Symbole 2 px Strich (Zahnrad 1,8).
- [ ] Seitenränder x = 120 (Texte) bzw. 1800 (rechte Kante).

### 8.3 Messpunkte je Referenz-Screenshot

Koordinaten (x, y) = linke obere Ecke, Maße Breite × Höhe, Standardtextgröße.

**01-home.png** (Startseite in Ruhe, Fokus auf erster Favoritenkachel)
- Uhr: Ziffern 108 px hoch, Box-Oberkante y 46, rechte Kante x 1688; Datum Oberkante y 154 (28 px/500, Zweittext).
- Zahnrad 84 × 84 bei (1716, 78), Glas mit Rand, Symbol 44 px.
- Agenda: Text beginnt x 120; erste Zeile ≈ y 52 (30 px/600 „was“, 24 px „wann“ links, 28 px Spaltenabstand); Feiertagszeile 22 px mit 24-px-Symbol.
- Favoritenablage (1744 × 291) bei (88, 400), Radius 44, `rgba(255,255,255,0.07)`.
- Kacheln 300 × 180, Radius 32, Abstand 45: x = 120, 465, 810, 1155, 1500; y = 432.
- Fokussierte Kachel: 336 × 201,6 (×1,12) um den Mittelpunkt der Ruhekachel; Türkis-Leuchten ca. 72 px weich, 24 px Ausbreitung; Name darunter bei y 628 (26 px/600, `#f5f5f7`).
- Konsolenüberschrift „Konsolen“ (28 px/600, Zweittext) bei y 715; Kachel 536 × 160 bei (120, 775), Symbol 80 × 80 bei x 160, Name 34 px/700, „HDMI n“ 24 px, Punkt 14 px.
- „Weitere Apps“ ab y 959, Raster ab y 1019, Zeilenschritt 251.
- Keine Hinweisleiste.

**02-home-focus-agenda.png**: Agenda fokussiert: Glasplatte `rgba(255,255,255,0.16)`, Radius 32, reicht 26 px links/rechts und 16 px oben/unten über den Text hinaus (Box (94, 36)); Türkis-Innenring 1,5 px (`rgba(110,215,224,0.4)`); Text unverändert an derselben Stelle; Leuchten dahinter; keine Kachel fokussiert (Namen aller Kacheln unsichtbar).

**03-alle-apps.png**: Titel „Alle Apps“ 64 px/700 bei (120, 88); Zähler rechts bündig bei x 1800, 28 px; Raster 5 × 300 ab (120, 230), Spaltenschritt 345, Zeilenschritt 251, Kachel 300 × 170, Name 31 px hoch 16 px darunter; Fokus ×1,12 ohne Übergang.

**04-einstellungen.png**: Titel „Einstellungen“ 56 px/700 bei (120, 82) (kein Krümel); Stage-Symbol 260 × 260 bei (340, 230), Titel 44 px/700 bei y 530, Text 28 px bei y 599 (600 breit); Liste: x 900 … 1800, erste Gruppenkopf-Oberkante y 200 (22 px/600 uppercase, Einzug 28), erste Zeile (900, 239) 900 × 82; Zeilenicon bei x 928, Label bei x 990 (31 px/500), Pfeil `chevron-right` bei x 1742 (30 × 30); zweite Gruppe beginnt bei y 765 (34 px Abstand); Fokuszeile Türkis-Fläche mit 1,5-px-Ring und Leuchten, ×1,035 (931,5 × 84,9); Hinweisleiste bei (120, 994) mit zwei runden 38-px-Tasten.

**05-darstellung.png**: Krümel „Einstellungen“ 26 px bei (120, 58), Titel 56 px bei y 96; Vorschau 700 × 394 bei (120, 250), Radius 28, dünner weißer Rand; darin dieselbe Startseite im Maßstab 0,364583 (Favoritenablage bei x 88 × 0,3646 …); Stage-Text 28 px bei y 680; Liste wie 04; Schalter 84 × 48 bei x 1688 (Zeilenende 1800 − 28 − 84), Knopf 40 px.

**06-auswahlliste.png**: Eine Gruppe, Zeilen 82 px; gewählte Zeile mit Haken (30 × 30, `--turq` im Ordiscale-Stil) rechtsbündig bei x ≈ 1742; Fokuszeile wie 04; Krümel = Elternseite; in der Symbolstil-Liste ändert sich der Stil der ganzen Seite mit dem Fokus (Platten/Farben je Stil, 5.1).

**07-menue.png**: Overlay `rgba(0,0,0,0.5)`; Box x 640 … 1280 (640 breit), vertikal zentriert (Mitte y 540), Radius 40, Fläche `rgba(44,44,48,0.95)`, Padding 36; Titel 34 px/700; Zeilen 568 × 68, Radius 20, 30 px; fokussierte Zeile weiß mit `#1c1c1e`; Schatten `0 40px 100px` weich.

**08-bildschirmschoner.png**: Foto bildfüllend (leicht überstehend), Scrim unten 420 px (`rgba(3,4,7,0.55)` an der Unterkante); Beschriftung links bei x 120, Unterkante 96 px über dem Rand (26 px/600 uppercase, Abstand 0,18 em); Uhr in einer der vier Ecken (72 px/300, Datum 30 px), Rand 120/96 px; optional Wetter links mit 1-px-Trennlinie, darunter Termine (28 px, rechtsbündig, Linie `rgba(220,224,232,0.22)`).

**09-woche.png**: Titel „Diese Woche“ 64 px/700 bei (120, 88), Zeitraum rechts 28 px; sieben Spalten 228 × 780 ab (120, 190), Schritt 242 (Abstand 14); Spaltenkopf 200 × 45 bei (134, 204) – „heute“ weiß mit dunkler Schrift; Liste ab y 263; Titel 22 px/600 (max. 2 Zeilen), Zeit 19 px; Feiertag gelb hinterlegt (`rgba(255,214,10,0.2)`); nur Hinweis „Zurück – Home“.

**10-ersteinrichtung.png**: Titel 64 px/700 bei (120, 88) (z. B. „Wie schaust du fern?“), „Schritt 1 von 5“ rechts; Hinweis 28 px bei y 184; Zeilen 1100 × 89 ab (120, 278), Schritt 101; Radius 24, Glas mit Rand; erste Zeile fokussiert (weiß, ×1,03, Schatten `--lift`); Text 34 px/500.

**11-sicherheit.png**: Titel „Sicherheit“ 60 px/700 bei (120, 50); Kamerablock ab (120, 178) – bei drei Kameras 760 × 428 plus zwei 380 × 204 bei x 900 (y 178 und 402); Statuskarte (1310, 178) 490 × 150 (Punkt 28 px bei (1340, 216), Titel 34 px/700 bei x 1390); „Zuletzt“-Karte (1310, 348) 490 × 270; Abschnittstitel 20 px uppercase bei y 646; Chips 74 hoch ab y 684 (Abstand 16), Symbol 30 px bei +22; Abstand der Chip-Abschnitte gemessen 146 px (Chip-Oberkanten y 684 → 830 → 976); Kameranamen auf dunkler Platte links unten (14/12 px Abstand); Hinweisleiste unten.

**12-klingel-popup.png**: Kamera 1320 × 742 bei (300, 100), Radius 28; ringsum `rgba(4,6,10,0.94)`; Titel 44 px/700 bei (300, 872); rechts Aktionschip 96 hoch („Haustür öffnen“, 30 px); Live-Marke oben rechts im Bild (22/22 px Abstand, rot bei „Live“); bei Alarm roter 6-px-Ring.

**13-vollbild.png**: Bild füllt 1920 × 1080, `contain`; Name bei (120, 48) 36 px/600 mit Schatten; Live-Marke bei (rechts 120, y 44).

**14-lichtregler.png**: Panel 1000 × 320 bei (460, 380), Radius 28, `#141821`; Titel 36 px bei (516, 424); Spur 888 × 24 bei (516, 540) (`rgba(255,255,255,0.14)`, weiße Füllung); Prozent 30 px bei (516, 594); Rest des Bildes auf `rgba(4,6,10,0.88)` abgedunkelt.

**15-verlauf.png**: Panel 1000 × 940 bei (460, 70), Radius 28; Kopf „Zuletzt · letzte 12 Stunden“ 20 px uppercase bei (504, 104); Liste ab y 166, Zeilenhöhe 52, Schrift 28 px, Zeit-Spalte 96 px, Symbol 22 px.

**16-kopplung-qr.png**: Krümel „Home Assistant“, Titel „Mit dem Handy koppeln“ (56 px); links weiße QR-Fläche (Radius 36, Padding 22, Seitenlänge 360–440 px inkl. Ruhezone) horizontal mittig in der 700-px-Spalte ab x 120, Oberkante y 214, darunter „Öffnet <Host>“ 24 px; rechts ab (900, 214): drei Schritte (34 px/500, Nummernkreise 52 px), Code 104 px/600 in Glasfläche Radius 30 („7KQ 2MX“, Zellen 0,64 em), Restzeit „Noch m:ss“ 28 px.

### 8.4 Typische Abweichungen und ihre Ursache

| Beobachtung | Wahrscheinliche Ursache |
|---|---|
| Kacheln wirken flach/eckig | Radius 32 oder `::after`-Glanz fehlt; Rand als `box-shadow` auf `.tile` statt `::after` |
| Fokus wirkt schwach | Skalierung 1.12/Schatten `--lift` fehlt; `--ring`-Ring (S-Wert 1.07 + 5 px Ring) wurde statt tvos.css benutzt |
| Listen „zu hell“ | `.gl-box` zu hell (soll 0.07) oder `--glass` (0.11) statt 0.07 für Kästen |
| Home-Reihe zu hoch/niedrig | `padding-top: 400px` und Favoritenablage 32 px Padding prüfen; Kachelhöhe 180 (nicht 170/190) |
| Text zu fett/dünn | Barlow-Schnitte 300/500/600/700 prüfen (Uhr 300, Listen 500, Namen 600, Titel 700) |
| Türkis überall | Türkis nur fokussiert/aktiv; Ruhezustand neutral |
| Schriftgrößen „stimmen nicht“ | Faktor `--ts` ≠ 1 (Standard muss 1 sein) |

---

## Anhang A: Unsicheres, nicht Gelesenes und Annahmen

- **Navy/Deep** (`#06285A`, `#031A3A`) stehen nicht im UI-CSS (siehe Lesehilfe). Das Oberflächen-Blau-Schwarz ist `#090b10`; die Wallpaper-Datei (`src/img/bg.jpg`, `src/img/wallpapers/*`) bestimmt den sichtbaren Hintergrund und trägt den eingebrannten Lesbarkeits-Verlauf. Ohne diese Bilder sieht Home deutlich anders aus.
- **`img/tiles/*.svg`** (vorgefärbte Markenlogos) erzeugt `scripts/build-marks.mjs`; nicht gelesen. `src/js/brands.js` enthält die Kachelfarben je Marke (Auszug): YouTube `#e62117`/`#fff`, Netflix `#141414`/`#e50914`, Prime Video `linear-gradient(135deg,#0b4f7a,#1aa0e0)`, Disney+ `linear-gradient(135deg,#091550,#1f5bd8)`, Apple TV `#1c1c1e`, Spotify `#121212`/`#1ed760`, ARD `#003480`, ZDF `#fa7d19`, Joyn `linear-gradient(135deg,#120a2e,#4b1fd1)`, RTL+ `#141414`, waipu `#e8125c`, MagentaTV `#e20074`, Zattoo `linear-gradient(135deg,#d9480f,#ff9d00)`, Fernsehen `linear-gradient(135deg,#0b2a4a,#1f6fd1)`, Home Assistant `linear-gradient(135deg,#0d8fc4,#18bcf2)`, PlayStation `linear-gradient(135deg,#00205c,#0070d1)`, Xbox `linear-gradient(135deg,#0a3a0a,#16a016)`, Switch `linear-gradient(135deg,#b3000e,#ff2a2a)` (vollständig in `src/js/brands.js`).
- **Zeilenhöhen** `normal` hängen von der Barlow-Datei ab (gemessen: 26 → 31, 28 → 34, 34 → 39,1, 22 → 27 px). Mit einer anderen Schrift verschieben sich Höhen um wenige Pixel (Reihenversatz von Home, Seitenhöhen im Cockpit).
- **Gemessene Werte** stammen aus einer Chromium-Vorschau, nicht vom TV (dort Chromium 76/85); Schriftrendering und Glättung dort leicht anders.
- **Dynamische Inhalte** (Termine, Zahl der Apps, Kameras, Wetter, Textlängen) ändern Höhen (z. B. Agenda-Platzmodell, Kamerablock). Referenzen zeigen Mock-Daten.
- **Schriftgrößen der Alert-/Bildschirmschoner-Zeilen** wurden nicht gemessen, nur aus dem CSS übernommen.
- **Weitere Ansichten ohne eigenes Referenzbild:** Hintergrund (`#bg-settings`), App-Editor (`#homeapps`), Lab, Sound/Netzwerk/Erweitert-Seiten (nutzen das Standardskelett aus 3.3).
- **Spiel `#runner-game`** (Canvas 1920 × 1080, Lab-Gimmick) ist nicht Teil des Designsystems.

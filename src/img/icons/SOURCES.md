# Interface icons (Settings)

- Source: Lucide (lucide-static 1.61.0, see VERSION.txt), ISC licence (parts from Feather, MIT); licence text unchanged in `LICENSE`.
- Copied unchanged from the Ordiscale brand package (`Ordiscale-Marke/build/paket/04-icons/lucide-komplett/`, Markenhandbuch Kap. 7: grid 24, stroke 2, round caps and joins).
- Only the icons the app uses. `node scripts/build-icons.mjs [--from <lucide-dir>]` copies them and writes `src/js/icons.js` (inline markup, drawn in the text colour); a new icon = add its name to `NAMES` there.
- The build ships `icons.js` and this folder's `LICENSE`, not the SVG copies (`scripts/build.sh`).
- Brand rules: white on dark, never stretched, turquoise #0AA6B4 only for active states (the focused row in the style "Ordiscale").

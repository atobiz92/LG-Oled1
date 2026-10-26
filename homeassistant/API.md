# Kopplungs-API Ordiscale TV (Version 0.1.0)

Vertrag zwischen dem Ordiscale Launcher (TV) und der Home-Assistant-Integration `ordiscale_tv`. Geprüft mit Home Assistant 2026.10.4.

## Ablauf in Kürze

1. TV: `POST /api/ordiscale_tv/pair/start` → erhält `pairing_id`, `poll_secret`, `user_code`, `approve_url`.
2. TV zeigt einen QR-Code mit `{HA-Adresse}{approve_url}` und daneben groß den `user_code`. Der QR-Code enthält **nie** den Code, das `poll_secret` oder Tokens.
3. Person scannt, meldet sich in Home Assistant an (Browser oder Companion-App), gibt den Code ein und tippt „Freigeben“. Nur Administratoren dürfen freigeben.
4. TV fragt alle `interval` Sekunden `POST /api/ordiscale_tv/pair/poll` ab, bis `approved`, `denied` oder `expired`.
5. Bei `approved` speichert der TV `refresh_token` und `client_id` und holt sich künftig Zugriffsschlüssel über `/auth/token`.

Alle Antworten sind JSON und tragen `Cache-Control: no-store`.

## Zeitlimits und Grenzen

| Wert | Größe |
|---|---|
| Gültigkeit einer Kopplung | 300 s ab `start` (`expires_in`) |
| Nachfrist nach Freigabe | mindestens 30 s, falls kurz vor Ablauf freigegeben |
| Empfohlenes Abfrageintervall | `interval` = 2 s |
| Offene Kopplungen | höchstens 5 insgesamt, höchstens 2 je Quell-IP |
| Rate-Limit `start` | 5 Aufrufe je 10 min und Quell-IP |
| Rate-Limit `poll` | 60 Aufrufe je 60 s und Quell-IP |
| Falsche Codes | nach 3 Fehlversuchen `denied` |
| Request-Body | höchstens 1024 Byte |
| TV-Name | optional, höchstens 40 Zeichen, Steuerzeichen werden entfernt |
| Zugriffsschlüssel (`access_token`) | 1800 s |
| Refresh-Token | verfällt nach 90 Tagen **ohne Nutzung**; jede Nutzung verlängert |

Offene Kopplungen liegen nur im Arbeitsspeicher. Nach einem Neustart von Home Assistant ist jede offene Kopplung weg (`poll` → `expired`); der TV startet dann neu.

## `POST /api/ordiscale_tv/pair/start`

Ohne Anmeldung. Body optional.

```http
POST /api/ordiscale_tv/pair/start
Content-Type: application/json

{"name": "Wohnzimmer"}
```

Antwort `200`:

```json
{
  "pairing_id": "p4Qm2Ls9VbN7eRtYxuIwoPaS3dF6gH8j",
  "poll_secret": "q3V…(43 Zeichen)…",
  "user_code": "7KQ2MX",
  "approve_url": "/ordiscale-tv-pair/p4Qm2Ls9VbN7eRtYxuIwoPaS3dF6gH8j",
  "expires_in": 300,
  "interval": 2
}
```

- `pairing_id`: 192 Bit, URL-sicher (Base64url, 32 Zeichen). Nicht geheim (steht im QR-Code).
- `poll_secret`: 256 Bit, URL-sicher (43 Zeichen). Geheim, bleibt auf dem TV, nie im QR-Code, nie loggen.
- `user_code`: 6 Zeichen aus `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (ohne 0, 1, I, O), erzeugt mit Pythons `secrets`. Der TV zeigt ihn an, gern als `7KQ 2MX`.
- `approve_url`: Pfad der Freigabeseite. QR-Inhalt = HA-Adresse ohne abschließenden Schrägstrich + `approve_url`, z. B. `http://192.168.1.10:8123/ordiscale-tv-pair/p4Qm2…`.

Fehler:

| HTTP | `error` | Bedeutung | TV-Reaktion |
|---|---|---|---|
| 400 | `invalid_request` | Body kein JSON-Objekt oder zu groß | Fehler anzeigen |
| 404 | – | Integration nicht installiert | „Integration Ordiscale TV in Home Assistant installieren“ |
| 429 | `too_many_pairings` | zu viele offene Kopplungen | später erneut (z. B. nach 60 s) |
| 429 | `rate_limited` (+ `retry_after` in s) | Rate-Limit | nach `retry_after` erneut |
| 503 | `pairing_disabled` | Kopplung in den Optionen aus oder Integration nicht geladen | Hinweis anzeigen |

## `POST /api/ordiscale_tv/pair/poll`

Ohne Anmeldung.

```http
POST /api/ordiscale_tv/pair/poll
Content-Type: application/json

{"pairing_id": "p4Qm2Ls9VbN7eRtYxuIwoPaS3dF6gH8j", "poll_secret": "q3V…"}
```

Antworten:

| HTTP | Body | Bedeutung |
|---|---|---|
| 200 | `{"status": "pending"}` | weiter abfragen |
| 200 | `{"status": "denied"}` | abgelehnt oder 3 falsche Codes; Abfrage beenden |
| 410 | `{"status": "expired"}` | abgelaufen, unbekannt, bereits abgeholt, falsches `poll_secret` oder Kopplung abgeschaltet; Abfrage beenden |
| 200 | siehe unten | freigegeben, Zugang wird **genau einmal** ausgeliefert |
| 400 | `{"error": "invalid_request"}` | Felder fehlen |
| 409 | `{"error": "user_unavailable", "status": "denied"}` | TV-Benutzer fehlt, ist deaktiviert oder Administrator |
| 429 | `{"error": "rate_limited", "retry_after": 12}` | zu schnell abgefragt |

Freigegeben:

```json
{
  "status": "approved",
  "client_id": "https://ordiscale.de/tv-launcher/",
  "refresh_token": "…",
  "access_token": "…",
  "token_type": "Bearer",
  "expires_in": 1800
}
```

Danach ist die Kopplung gelöscht; jede weitere Abfrage liefert `410 expired`. Der TV muss `refresh_token` und `client_id` sofort speichern. `access_token` ist eine Bequemlichkeit für die erste Verbindung und läuft nach `expires_in` Sekunden ab.

Ein falsches `poll_secret` sieht absichtlich genauso aus wie eine unbekannte Kopplung (Vergleich in konstanter Zeit).

## Zugang nutzen

WebSocket wie bisher, nur mit dem kurzlebigen Zugriffsschlüssel (ZUGRIFFSSCHLUESSEL steht für den Wert als JSON-String):

```json
{"type": "auth", "access_token": ZUGRIFFSSCHLUESSEL}
```

Neuen Zugriffsschlüssel holen (vor Ablauf oder nach `auth_invalid`):

```http
POST /auth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&client_id=https%3A%2F%2Fordiscale.de%2Ftv-launcher%2F&refresh_token=<refresh_token>
```

Antwort `200`: `{"access_token": "…", "token_type": "Bearer", "expires_in": 1800}`. Fehler: `400 invalid_grant` = Zugang widerrufen oder abgelaufen → neu koppeln; `403 access_denied` = Benutzer deaktiviert oder Anfrage nicht aus dem lokalen Netz (Benutzer „nur lokal“).

### CORS

`start`, `poll` und `/auth/token` sind in Home Assistant als `cors_allowed` registriert. Home Assistant erlaubt dafür jede Herkunft: Es spiegelt den `Origin` des Aufrufers in `Access-Control-Allow-Origin` (auch `null` und `file://`), ohne `Access-Control-Allow-Credentials`, und beantwortet den Preflight (`OPTIONS`) für `POST` mit `Content-Type`. Die Endpunkte arbeiten ohne Cookies, deshalb ist das unbedenklich. Wer den Preflight sparen will, darf den JSON-Body bei `start`/`poll` auch als `text/plain` senden.

### Kein eigener Token-Endpunkt

Ein `POST /api/ordiscale_tv/token` wurde bewusst **nicht** gebaut:

- Für: wäre unabhängig davon, wie Home Assistant `/auth/token` künftig für CORS freigibt.
- Wider: `/auth/token` ist in HA 2026.10 bereits für alle Herkünfte CORS-fähig (getestet), prüft „nur lokal“, deaktivierte Benutzer und Widerruf. Ein Nachbau müsste genau das duplizieren und wäre eine zusätzliche offene Stelle, die Tokens ausgibt.

Sollte `/auth/token` auf dem TV doch an CORS scheitern, zuerst die Antwort-Header am TV protokollieren (ohne Token) und dann neu entscheiden.

## Freigabeseite und WebSocket-Befehle (nur zur Information)

Die Seite `/ordiscale-tv-pair/<pairing_id>` ist ein verstecktes Panel (kein Eintrag in der Seitenleiste). Home Assistant verlangt davor die normale Anmeldung. Die Seite nutzt diese Befehle über die bestehende, angemeldete WebSocket-Verbindung; alle nur für Administratoren (sonst Fehler `unauthorized`):

| Befehl | Felder | Ergebnis |
|---|---|---|
| `ordiscale_tv/info` | `pairing_id` | `name`, `status`, `expires_in`, `attempts_left` (nie der Code) |
| `ordiscale_tv/approve` | `pairing_id`, `code` | wie `info`, `status: "approved"` |
| `ordiscale_tv/deny` | `pairing_id` | wie `info`, `status: "denied"` |

Fehlercodes (`error.code`, Platzhalter in `error.translation_placeholders`): `pairing_disabled`, `not_found`, `not_pending`, `denied`, `invalid_code` (`attempts_left`), `invalid_format` (zählt nicht als Versuch, `attempts_left`), `user_unavailable`, `unauthorized`.

Code-Eingabe: Groß-/Kleinschreibung egal, Leerzeichen und Bindestriche werden ignoriert. Enthält die Eingabe 0, O, 1 oder I, ist sie ungültig (`invalid_format`), ohne einen Versuch zu verbrauchen, weil diese Zeichen im Code nie vorkommen.

## Empfehlungen für die TV-Seite

- `poll_secret`, `refresh_token`, `access_token` nie loggen, nie in URLs, nie exportieren.
- Abfrage beenden bei `approved`, `denied`, `expired` oder nach `expires_in`; „Neuen Code anzeigen“ startet `start` neu.
- Bei `429` `retry_after` beachten, sonst das `interval` einhalten.
- Ablaufanzeige auf dem TV aus `expires_in` berechnen.
- Den bisherigen Langzeit-Token nach erfolgreicher Kopplung löschen.

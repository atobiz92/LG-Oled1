# Ordiscale TV für Home Assistant

Benutzerdefinierte Integration (`ordiscale_tv`), mit der sich der Ordiscale Launcher auf einem Samsung-TV per QR-Code mit Home Assistant koppelt. Kein Token-Abtippen am Fernseher: Der TV zeigt einen QR-Code und einen sechsstelligen Code, ein Administrator scannt mit dem Handy, gibt den Code ein und tippt „Freigeben“. Danach hat der TV einen eigenen, jederzeit widerrufbaren Zugang. Alles läuft lokal in Home Assistant, ohne externen Dienst.

Version 0.1.0, getestet mit Home Assistant 2026.10.4. Schnittstelle für die TV-Seite: [API.md](API.md).

## Installation

### Über HACS (benutzerdefiniertes Repository)

Voraussetzung: Dieser Ordner (`homeassistant/`) liegt als **Wurzel** eines eigenen Git-Repositorys vor (HACS liest `hacs.json` und `custom_components/` nur aus der Repository-Wurzel). Aus dem Launcher-Repository heraus geht das z. B. mit einem eigenen Repository oder `git subtree split --prefix homeassistant`.

1. HACS öffnen → Menü (drei Punkte) → **Benutzerdefinierte Repositories**.
2. Adresse des Repositorys eintragen, Typ **Integration**, **Hinzufügen**.
3. „Ordiscale TV“ suchen → **Herunterladen**.
4. Home Assistant neu starten.

### Manuell

1. Den Ordner `custom_components/ordiscale_tv` nach `<config>/custom_components/ordiscale_tv` kopieren (`<config>` ist der Ordner mit `configuration.yaml`).
2. Home Assistant neu starten.

## Einrichtung

1. **Einstellungen → Geräte & Dienste → Integration hinzufügen → „Ordiscale TV“.**
2. Benutzer für die Fernseher wählen:
   - **Neuen Benutzer „Ordiscale TV“ anlegen (empfohlen):** Gruppe „Benutzer“ (`system-users`, kein Administrator), „nur lokal“ (Zugriff nur aus dem Heimnetz), ohne Kennwort, kann sich also nicht interaktiv anmelden.
   - oder einen vorhandenen Benutzer. Angeboten werden nur aktive Benutzer, die weder Administrator noch Eigentümer sind.
3. Fertig. Die Kopplung ist sofort aktiv.

Optionen (**Ordiscale TV → Konfigurieren**):

- **Kopplung neuer Fernseher erlauben** (Standard an). Aus = `start` antwortet mit `pairing_disabled`, offene Kopplungen verfallen sofort. Bereits gekoppelte TVs behalten ihren Zugang.
- **Zugang widerrufen für:** Liste der gekoppelten Fernseher („Ordiscale TV · Wohnzimmer (25.10.2026 14:03)“). Ausgewählte verlieren ihren Zugang sofort.

Die Rechte des TV entsprechen denen des gewählten Benutzers. Was der Launcher anzeigt, steuern weiterhin das Label „TV“ und die Gruppe `group.tv`.

## Koppeln

1. Am TV: Einstellungen → Home Assistant → Adresse eintragen → „Mit dem Handy koppeln“.
2. QR-Code mit dem Handy scannen. Es öffnet sich Home Assistant (Anmeldung, falls nötig) mit der Seite „Fernseher koppeln“.
3. Code vom Fernseher eingeben (Groß-/Kleinschreibung egal) → **Freigeben**. Oder **Ablehnen**.
4. Der TV meldet sich nach wenigen Sekunden an.

Nur Administratoren können freigeben: Wer freigibt, vergibt einen Zugang zu Home Assistant. Andere Benutzer sehen einen Hinweis.

## Sicherheitsmodell

**Was ein Angreifer im Heimnetz kann:** `start` und `poll` sind ohne Anmeldung erreichbar. Wer sie aufruft, erzeugt nur eine Kopplungsanfrage. Ohne dass ein angemeldeter **Administrator** auf der Freigabeseite den **Code vom Bildschirm dieses TV** eingibt, entsteht kein Zugang. Den Code sieht nur, wer vor dem Fernseher sitzt; er geht nie über das Netz zur Freigabeseite, nur vom Menschen ins Eingabefeld.

Weitere Maßnahmen:

- **Zwei getrennte Geheimnisse:** Der QR-Code enthält nur die Kopplungs-ID (192 Bit, nicht geheim). Das Abholgeheimnis `poll_secret` (256 Bit) bleibt auf dem TV. Wer nur den QR-Code fotografiert, kann den Zugang nicht abholen.
- **Code:** 6 Zeichen aus 32 Zeichen (rund 1 Milliarde Möglichkeiten), erzeugt mit `secrets`; nach 3 Fehlversuchen ist die Kopplung gesperrt. Vergleiche von Code und Geheimnis laufen in konstanter Zeit.
- **Kurzlebig und flüchtig:** Eine Kopplung gilt 300 s und liegt nur im Arbeitsspeicher; nach Ablauf oder Neustart ist sie weg.
- **Genau einmal:** Der Zugang wird erst beim Abholen erzeugt und nur einmal ausgeliefert; danach ist die Kopplung gelöscht.
- **Begrenzung:** höchstens 5 offene Kopplungen, 2 je IP; Rate-Limit je IP für `start` (5 je 10 min) und `poll` (60 je min). Ein einzelnes Gerät im Netz kann so keine Kopplung blockieren; wer viele Adressen nutzt, kann das Koppeln stören, aber nie einen Zugang erzeugen.
- **Nie Administrator:** Der TV-Benutzer wird bei Einrichtung, Freigabe und Ausgabe geprüft. Wird er später zum Administrator gemacht, deaktiviert oder gelöscht, gibt es keinen neuen Zugang mehr.
- **Eigener Zugang je TV:** ein eigener Refresh-Token mit Namen „Ordiscale TV · <Name>“, einzeln widerrufbar. Der TV holt sich damit 30-Minuten-Zugriffsschlüssel über `/auth/token`. Ein Token, der 90 Tage nicht genutzt wurde, verfällt (HA-Standard).
- **Kein Logging von Geheimnissen:** Die Integration protokolliert nur die gekürzte Kopplungs-ID (6 Zeichen) und das Ergebnis, nie Code, `poll_secret` oder Tokens.

**Grenzen:**

- Der TV speichert den Refresh-Token im localStorage (anders geht es auf Tizen für Web-Apps nicht). Wer Entwicklerzugriff auf den TV hat, kann ihn lesen. Deshalb Benutzer ohne Admin-Rechte, „nur lokal“, und Widerruf bei Verdacht.
- Ohne HTTPS laufen Code-Eingabe und Tokens im Heimnetz unverschlüsselt (wie jede HA-Anmeldung über `http://`).
- Schaltet man für Home Assistant das Debug-Logging von `websocket_api` ein, protokolliert **Home Assistant selbst** eingehende WebSocket-Nachrichten, auch den eingetippten Code. Der Code ist nach Ablauf (300 s) wertlos und allein nutzlos, Debug-Logging trotzdem nur kurz einschalten.

## Zugang widerrufen

- **Einzelner TV:** Ordiscale TV → **Konfigurieren** → „Zugang widerrufen für“ → TV auswählen → Absenden.
- **Alle TVs:** Einstellungen → Personen → Benutzer → „Ordiscale TV“ → **Aktiv** ausschalten (sperrt sofort, umkehrbar) oder Benutzer löschen.
- **Profil → Sicherheit → Aktualisierungs-Tokens:** zeigt die Zugänge einzeln mit Namen, aber nur dem angemeldeten Benutzer selbst. Beim empfohlenen Benutzer ohne Kennwort ist das nicht erreichbar; dafür gibt es die Optionen oben. Hat der gewählte Benutzer eine Anmeldung, kann er dort einzeln widerrufen.

Der TV merkt den Widerruf beim nächsten Zugriffsschlüssel (`invalid_grant`) und muss neu gekoppelt werden.

## Entfernen

**Einstellungen → Geräte & Dienste → Ordiscale TV → Löschen.** Dabei

- wird der von der Integration angelegte Benutzer „Ordiscale TV“ samt allen Zugängen gelöscht,
- bzw. bei einem vorhandenen Benutzer werden nur die Zugänge dieser Integration widerrufen (andere Tokens des Benutzers bleiben).

Danach die Dateien über HACS (Herunterladen rückgängig) oder manuell aus `custom_components/` entfernen und neu starten.

## Entwicklung und Tests

```sh
python3.14 -m venv .venv && . .venv/bin/activate
pip install -r requirements_test.txt home-assistant-frontend
pytest
```

`home-assistant-frontend` wird nur für die Tests gebraucht (die Freigabeseite registriert ein Panel). Die Tests decken Einrichtung, Optionen, Entfernen, `start`/`poll`/Freigabe, 3 falsche Codes, Ablauf, einmalige Auslieferung, Nicht-Admin, Rate-Limits, CORS und das Logging ab.

## Lizenz und Herkunft

Eigener Code, keine fremden Bestandteile. Die Freigabeseite nutzt nur Home Assistants eigenes Frontend (keine CDNs, keine externen Schriften). Der QR-Code wird auf dem TV erzeugt, nicht von dieser Integration. Lizenz für ein eigenes Repository noch festzulegen.

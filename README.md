# Überführung – Software für Fahrzeugüberführungen

Webanwendung (Desktop, Smartphone, iPad) zum Planen, Dokumentieren und Abrechnen von Fahrzeugüberführungen.

## Funktionen

**Kunden & Aufträge**
- Kundenverwaltung (Firma/Privat) mit fortlaufenden Kundennummern
- Aufträge mit Abhol-/Zustelladresse, Terminen, Ansprechpartnern, Fahrerzuweisung, Referenz, Überführungsart (eigene Achse, Anhänger, LKW)
- Preis pauschal oder pro Kilometer, Status-Workflow (Angelegt → Geplant → Unterwegs → Zugestellt → Abgerechnet), Verlauf je Auftrag
- Aufträge im Büro vorbereiten und vor Ort vervollständigen: nur der Kunde ist Pflicht, „Zwischenspeichern“, Hinweis auf noch fehlende Angaben, Eingaben werden zusätzlich lokal auf dem Gerät gesichert (Funkloch/Neuladen)
- Adressen per Knopfdruck vom Kunden übernehmen oder über den **aktuellen Standort** (GPS) ermitteln
- **Automatische Streckenberechnung** (km & Fahrzeit) aus Abhol- und Zieladresse – jederzeit überschreibbar
- Filter (aktiv, unterwegs, abzurechnen, „Meine“) und Suche nach Kennzeichen, FIN, Kunde, Ort
- Direktlinks zu Google Maps (Adresse & Route) und Telefon

**Fahrzeugbestand**
- Übersicht aller bekannten Fahrzeuge – wird beim Speichern von Aufträgen automatisch gepflegt (Zuordnung über FIN, sonst Kennzeichen)
- Beim Anlegen eines Auftrags bekanntes Fahrzeug suchen und übernehmen; bei Eingabe einer bekannten FIN/eines Kennzeichens erscheint ein Übernahme-Hinweis
- Fahrzeugdetails mit Auftragshistorie, letztem Kilometerstand und zuletzt dokumentierten Schäden
- Neues Fahrzeug direkt aus dem **Fahrzeugschein** anlegen (Foto oder PDF) – die Daten werden ausgelesen und das Dokument am Fahrzeug gespeichert

**Fahrzeug & Zustand**
- Fotos direkt aus der Handykamera, getrennt nach *Abholung* und *Übergabe*, mit Kategorien (Front, Heck, Innenraum, Tacho, FIN …); Bilder werden vor dem Upload im Browser verkleinert
- **Automatische Erkennung** per Foto: Kennzeichen, Marke, Modell, Fahrgestellnummer (FIN), Farbe, Erstzulassung – auch vom Fahrzeugschein. Wahlweise lokal per OCR oder per KI (siehe unten). Alle Werte bleiben manuell editierbar.
- Interaktive **Schadensskizze**: Bereich antippen → Art, Schwere, Beschreibung und Foto erfassen
- Vergleich der Schäden bei Übergabe mit dem Zustand bei Abholung

**Übergabeprotokolle**
- Abhol- und Übergabeprotokoll mit Datum, Ort, Kilometerstand, Tank-/Ladestand, Sauberkeit, Zubehör-Checkliste (Schlüssel, Papiere, Warndreieck, Ladekabel …) und Bemerkungen
- **Digitale Unterschrift** von Kunde/Empfänger und Fahrer (Finger, Stift, Maus)
- PDF mit Schadensskizze, Schadensliste, Unterschriften und Fotodokumentation
- Abschluss setzt den Auftragsstatus automatisch weiter

**Belege & Spesen**
- Belege (Bahn, Hotel, Tanken, Maut, Spesen …) fotografieren oder als PDF hochladen
- **Automatisches Auslesen** von Aussteller, Datum, Betrag, USt-Satz und Kategorie (lokal per OCR oder per KI)
- Kennzeichnung „weiterberechnen“ – fließt automatisch in die Rechnung ein

**Rechnungen**
- Rechnung per Klick aus dem Auftrag (Überführungsleistung + weiterberechnete Auslagen netto)
- Frei bearbeitbarer Entwurf, dann **Festschreiben** mit fortlaufender Rechnungsnummer (z. B. `RE-2026-0001`)
- PDF nach DIN-5008-Layout mit Absender, Logo, Bankverbindung, Fußzeile und **GiroCode (EPC-QR)** zum Bezahlen per Banking-App
- Kleinunternehmerregelung (§ 19 UStG), mehrere Steuersätze, Zahlungsziel, Status offen/überfällig/bezahlt
- Stornierung erzeugt automatisch eine **Stornorechnung**
- Zentrale Einstellungen: Firmenname, Adresse, Kontakt, Steuernummer/USt-IdNr., IBAN/BIC, Einleitungs- und Schlusstext, Protokoll-Hinweistext

**Benutzer & Teams**
- Registrierung per E-Mail/Passwort, **Login mit Google oder Apple**
- Jede Registrierung erhält eine eigene **Instanz** (Firma); weitere Personen können per Einladungslink/E-Mail eingeladen werden
- Rollen: Inhaber, Administrator, Mitarbeiter; Wechsel zwischen mehreren Instanzen
- Als App installierbar (PWA) auf iPhone/iPad/Android

## Technik

- Next.js 15 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 4
- MySQL 8 via Prisma ORM
- Auth.js (NextAuth v5) – Credentials, Google, Apple
- PDF-Erzeugung mit PDFKit, QR-Codes mit `qrcode`
- Erkennung: lokal mit Tesseract (OCR, WebAssembly), Bildaufbereitung mit `sharp` (Schattenausgleich, Grünkanal gegen Formularlinien, mehrere Durchläufe mit Abstimmung) + `unpdf` für PDF-Belege, optional Claude-API (Anthropic, Vision + Structured Outputs)
- Dateien lokal (Docker-Volume) oder S3-kompatibel (für mehrere Instanzen)
- Docker-Image (standalone, non-root) mit automatischen Datenbank-Migrationen und Healthcheck (`/api/health`)

## Schnellstart mit Docker

```bash
cp .env.example .env
# AUTH_SECRET setzen:  openssl rand -base64 32
# AUTH_URL / APP_URL auf die öffentliche Adresse setzen
docker compose up -d --build
```

Danach ist die Anwendung unter http://localhost:3000 erreichbar. Beim ersten Start werden die Tabellen automatisch angelegt.

### Skalieren

Die App ist zustandslos (JWT-Sessions), daher können beliebig viele Container parallel laufen:

1. `STORAGE_DRIVER=s3` und die `S3_*`-Variablen setzen (AWS S3, MinIO, Hetzner, Cloudflare R2 …), damit alle Instanzen dieselben Dateien sehen.
2. `docker compose up -d --scale app=3` (bzw. Kubernetes/Swarm) und einen Load-Balancer davor schalten (Port-Mapping in der Compose-Datei dann entfernen).
3. Migrationen laufen beim Start jeder Instanz; mit `RUN_MIGRATIONS=false` lässt sich das auf einen Job beschränken.

## Konfiguration

Alle Variablen sind in [`.env.example`](.env.example) beschrieben. Die wichtigsten:

| Variable | Beschreibung |
| --- | --- |
| `DATABASE_URL` | MySQL-Verbindung, z. B. `mysql://user:pass@host:3306/db` |
| `AUTH_SECRET` | Geheimer Schlüssel für Sessions (Pflicht) |
| `AUTH_URL`, `APP_URL` | Öffentliche URL (OAuth-Callbacks, Einladungslinks) |
| `AUTH_GOOGLE_ID/SECRET` | Google-Login (optional) |
| `AUTH_APPLE_ID/SECRET` | Apple-Login (optional) |
| `ANTHROPIC_API_KEY` | Schaltet die Erkennung von lokaler OCR auf KI um (optional) |
| `OCR_ENABLED` | Lokale OCR an/aus (Standard: an) |
| `GEO_ENABLED`, `GEOCODER_URL`, `ROUTING_URL`, `ORS_API_KEY` | Standort- und Streckenberechnung (siehe unten) |
| `STORAGE_DRIVER` | `local` oder `s3` |
| `SMTP_*` | E-Mail-Versand für Einladungen (optional – sonst wird ein Link angezeigt) |

### Google-Login einrichten
In der [Google Cloud Console](https://console.cloud.google.com/apis/credentials) eine OAuth-Client-ID (Webanwendung) anlegen. Autorisierte Weiterleitungs-URI: `https://<deine-domain>/api/auth/callback/google`.

### Apple-Login einrichten
Im Apple-Developer-Konto eine *Services ID* anlegen, „Sign in with Apple“ aktivieren und als Return-URL `https://<deine-domain>/api/auth/callback/apple` eintragen. `AUTH_APPLE_ID` ist die Services ID, `AUTH_APPLE_SECRET` das daraus generierte Client-Secret (JWT, max. 6 Monate gültig – siehe [Auth.js-Doku](https://authjs.dev/getting-started/providers/apple)). Apple erfordert HTTPS.

### Automatische Erkennung & Datenschutz

Die Anwendung wählt die Erkennungsmethode automatisch:

| | **Ohne** `ANTHROPIC_API_KEY` – lokale OCR | **Mit** `ANTHROPIC_API_KEY` – KI |
| --- | --- | --- |
| Verarbeitung | Auf dem eigenen Server (Tesseract), Sprachdaten im Image enthalten | Claude-API von Anthropic (USA) |
| Datenweitergabe | keine | Bilder werden an Anthropic übermittelt → AV-Vertrag, Datenschutzerklärung, Drittlandtransfer (SCC) beachten |
| Kosten | keine | pro Erkennung (API-Nutzung) |
| FIN | gut (Plausibilitätsprüfung, Korrektur typischer OCR-Fehler) | sehr gut |
| Marke | aus der FIN (Herstellerkennung) oder Fahrzeugschein | auch vom Fahrzeugfoto |
| Modell, Farbe, Erstzulassung | nur vom Fahrzeugschein (Felder D.3, R, B) | Fahrzeugschein & Foto |
| Kennzeichen | wenn formatfüllend fotografiert | auch auf Fahrzeugfotos |
| Belege | PDFs mit Textebene sehr gut; Fotos: Betrag, Datum, USt meist, Aussteller/Kategorie über bekannte Anbieter (DB, Aral, Motel One …) | sehr gut, auch zerknitterte Bons |

Tipps für die lokale OCR: Fahrzeugschein, FIN-Plakette oder Kennzeichen scharf und formatfüllend fotografieren. Schatten und leichte Schräglage gleicht die Aufbereitung aus; stark verwackelte Fotos bleiben schwierig. Beim Fahrzeugschein wird der feste Aufbau der Zulassungsbescheinigung Teil I ausgewertet (Felder A, B, D.1, D.3, E), die Plausibilität der FIN geprüft (Herstellerkennung, Prüfziffer) – unsichere Werte bleiben lieber leer als falsch. Mit `OCR_ENABLED=false` lässt sich die lokale Erkennung abschalten. Das KI-Modell ist über `ANTHROPIC_MODEL` änderbar (Standard `claude-opus-5-5`).

### Standort & Streckenberechnung

„📍 Mein Standort“ nutzt das GPS des Geräts (Browser fragt nach Erlaubnis, funktioniert nur über **HTTPS**) und ermittelt daraus die Adresse. Die Strecke wird automatisch berechnet, sobald bei Abholung und Zustellung PLZ oder Ort eingetragen sind.

Standardmäßig werden die freien OpenStreetMap-Dienste verwendet ([Nominatim](https://nominatim.org) & [OSRM](https://project-osrm.org)). Deren öffentliche Server sind nur für geringe Nutzung gedacht – für den Produktivbetrieb empfiehlt sich ein eigener Server (`GEOCODER_URL`, `ROUTING_URL`) oder ein kostenloser [OpenRouteService](https://openrouteservice.org)-Schlüssel (`ORS_API_KEY`). An diese Dienste werden nur Adressen bzw. Koordinaten übermittelt, keine Kunden- oder Fahrzeugdaten. Mit `GEO_ENABLED=false` lassen sich die Funktionen abschalten.

## Lokale Entwicklung

```bash
npm install
cp .env.example .env         # DATABASE_URL anpassen
docker run -d --name mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=cartransport -p 3306:3306 mysql:8.4
DATABASE_URL="mysql://root:root@localhost:3306/cartransport" npx prisma migrate dev
npm run dev
```

Nützliche Befehle: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:studio`.

## Projektstruktur

```
prisma/schema.prisma           Datenmodell (Instanzen, Kunden, Aufträge, Fotos, Schäden, Protokolle, Belege, Rechnungen)
src/auth.ts                    Auth.js-Konfiguration (E-Mail, Google, Apple)
src/app/(auth)/                Login, Registrierung, Einladungen
src/app/(app)/                 Dashboard, Aufträge, Kunden, Rechnungen, Einstellungen
src/app/api/                   Datei-Auslieferung, PDF-Endpunkte, Healthcheck
src/lib/recognition.ts         Auswahl der Erkennung (KI oder lokale OCR)
src/lib/ocr.ts, ocr-parse.ts   Lokale Texterkennung & Auswertung (FIN, Kennzeichen, Fahrzeugschein, Belege)
src/lib/ai.ts                  KI-Erkennung (Claude Vision)
src/lib/pdf/                   Rechnungs- und Protokoll-PDFs
src/lib/storage.ts             Datei-Speicher (lokal / S3)
```

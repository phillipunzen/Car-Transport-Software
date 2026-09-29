# Überführung – Software für Fahrzeugüberführungen

Webanwendung (Desktop, Smartphone, iPad) zum Planen, Dokumentieren und Abrechnen von Fahrzeugüberführungen.

## Funktionen

**Kunden & Aufträge**
- Kundenverwaltung (Firma/Privat) mit fortlaufenden Kundennummern
- Aufträge mit Abhol-/Zustelladresse, Terminen, Ansprechpartnern, Fahrerzuweisung, Referenz, Überführungsart (eigene Achse, Anhänger, LKW)
- Preis pauschal oder pro Kilometer, Status-Workflow (Angelegt → Geplant → Unterwegs → Zugestellt → Abgerechnet), Verlauf je Auftrag
- Filter (aktiv, unterwegs, abzurechnen, „Meine“) und Suche nach Kennzeichen, FIN, Kunde, Ort
- Direktlinks zu Google Maps (Adresse & Route) und Telefon

**Fahrzeug & Zustand**
- Fotos direkt aus der Handykamera, getrennt nach *Abholung* und *Übergabe*, mit Kategorien (Front, Heck, Innenraum, Tacho, FIN …); Bilder werden vor dem Upload im Browser verkleinert
- **Automatische Erkennung** per Foto: Kennzeichen, Marke, Modell, Fahrgestellnummer (FIN), Farbe, Erstzulassung – auch vom Fahrzeugschein. Alle Werte bleiben manuell editierbar.
- Interaktive **Schadensskizze**: Bereich antippen → Art, Schwere, Beschreibung und Foto erfassen
- Vergleich der Schäden bei Übergabe mit dem Zustand bei Abholung

**Übergabeprotokolle**
- Abhol- und Übergabeprotokoll mit Datum, Ort, Kilometerstand, Tank-/Ladestand, Sauberkeit, Zubehör-Checkliste (Schlüssel, Papiere, Warndreieck, Ladekabel …) und Bemerkungen
- **Digitale Unterschrift** von Kunde/Empfänger und Fahrer (Finger, Stift, Maus)
- PDF mit Schadensskizze, Schadensliste, Unterschriften und Fotodokumentation
- Abschluss setzt den Auftragsstatus automatisch weiter

**Belege & Spesen**
- Belege (Bahn, Hotel, Tanken, Maut, Spesen …) fotografieren oder als PDF hochladen
- **Automatisches Auslesen** von Aussteller, Datum, Betrag, USt-Satz und Kategorie
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
- Bilderkennung mit der Claude-API (Anthropic, Vision + Structured Outputs)
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
| `ANTHROPIC_API_KEY` | Aktiviert die automatische Erkennung von Fahrzeugdaten und Belegen (optional) |
| `STORAGE_DRIVER` | `local` oder `s3` |
| `SMTP_*` | E-Mail-Versand für Einladungen (optional – sonst wird ein Link angezeigt) |

### Google-Login einrichten
In der [Google Cloud Console](https://console.cloud.google.com/apis/credentials) eine OAuth-Client-ID (Webanwendung) anlegen. Autorisierte Weiterleitungs-URI: `https://<deine-domain>/api/auth/callback/google`.

### Apple-Login einrichten
Im Apple-Developer-Konto eine *Services ID* anlegen, „Sign in with Apple“ aktivieren und als Return-URL `https://<deine-domain>/api/auth/callback/apple` eintragen. `AUTH_APPLE_ID` ist die Services ID, `AUTH_APPLE_SECRET` das daraus generierte Client-Secret (JWT, max. 6 Monate gültig – siehe [Auth.js-Doku](https://authjs.dev/getting-started/providers/apple)). Apple erfordert HTTPS.

### Automatische Erkennung
Mit gesetztem `ANTHROPIC_API_KEY` werden Fotos von Fahrzeug, Kennzeichen, FIN, Tacho oder Fahrzeugschein sowie Belege über die Claude-API ausgelesen (Standardmodell `claude-opus-5-5`, über `ANTHROPIC_MODEL` änderbar). Ohne Schlüssel funktioniert alles weiterhin – die Felder werden dann manuell ausgefüllt.

## Lokale Entwicklung

```bash
npm install
cp .env.example .env         # DATABASE_URL anpassen
docker run -d --name mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=cartransport -p 3306:3306 mysql:8.4
DATABASE_URL="mysql://root:root@localhost:3306/cartransport" npx prisma migrate dev
npm run dev
```

Nützliche Befehle: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:studio`.

## Projektstruktur

```
prisma/schema.prisma           Datenmodell (Instanzen, Kunden, Aufträge, Fotos, Schäden, Protokolle, Belege, Rechnungen)
src/auth.ts                    Auth.js-Konfiguration (E-Mail, Google, Apple)
src/app/(auth)/                Login, Registrierung, Einladungen
src/app/(app)/                 Dashboard, Aufträge, Kunden, Rechnungen, Einstellungen
src/app/api/                   Datei-Auslieferung, PDF-Endpunkte, Healthcheck
src/lib/ai.ts                  Fahrzeug- und Belegerkennung (Claude Vision)
src/lib/pdf/                   Rechnungs- und Protokoll-PDFs
src/lib/storage.ts             Datei-Speicher (lokal / S3)
```

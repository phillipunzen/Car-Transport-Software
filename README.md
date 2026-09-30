# Überführung – Software für Fahrzeugüberführungen

Webanwendung (Desktop, Smartphone, iPad) zum Planen, Dokumentieren und Abrechnen von Fahrzeugüberführungen.

## Funktionen

**Geführter Ablauf je Auftrag**
- Schrittleiste oben in jedem Auftrag: Vorbereiten → Fotos Abholung → Abholprotokoll → Fotos Übergabe → Übergabeprotokoll → Rechnung → Bezahlt
- Ein Hinweis „Nächster Schritt“ mit genau einer Schaltfläche führt direkt zur richtigen Stelle
- Schritte bewusst überspringen (rückgängig machbar, im Verlauf protokolliert): Vorbereiten, Fotos bei Abholung/Übergabe und „Keine Rechnung erforderlich“. Die Protokolle lassen sich nicht überspringen. Vergessene Schritte werden gesondert markiert und können nachträglich ignoriert werden

**Kunden & Aufträge**
- Kundenverwaltung (Firma/Privat) mit fortlaufenden Kundennummern
- **Konditionen je Kunde:** eigener km-Preis, Zahlungsziel, Skonto (z. B. 2 % in 7 Tagen), Rückreise-Regel und Leitweg-ID – werden bei Aufträgen, Angeboten und Rechnungen automatisch vorgeschlagen
- **Rückreise des Fahrers** je Auftrag: nicht berechnen, Pauschale, Preis pro km oder nach Belegen (Bahn, Bus, Taxi) – Standard in den Einstellungen
- Aufträge mit Abhol-/Zustelladresse, Terminen, Ansprechpartnern, Fahrerzuweisung, Referenz, Überführungsart (eigene Achse, Anhänger, LKW)
- Preis pauschal oder pro Kilometer, Status-Workflow (Angelegt → Geplant → Unterwegs → Zugestellt → Abgerechnet), Verlauf je Auftrag
- Aufträge im Büro vorbereiten und vor Ort vervollständigen: nur der Kunde ist Pflicht, „Zwischenspeichern“, Hinweis auf noch fehlende Angaben, Eingaben werden zusätzlich lokal auf dem Gerät gesichert (Funkloch/Neuladen)
- Adressen per Knopfdruck vom Kunden übernehmen oder über den **aktuellen Standort** (GPS) ermitteln
- **Automatische Streckenberechnung** (km & Fahrzeit) aus Abhol- und Zieladresse – jederzeit überschreibbar
- Filter (aktiv, unterwegs, abzurechnen, „Meine“) und Suche nach Kennzeichen, FIN, Kunde, Ort
- Direktlinks zu Google Maps (Adresse & Route) und Telefon
- **Status-Link für den Kunden** (ohne Anmeldung): zeigt, ob das Fahrzeug abgeholt/zugestellt ist, mit Protokoll-Download; teilen per WhatsApp, E-Mail oder Share-Sheet, jederzeit deaktivierbar
- Optional **automatische E-Mail an den Kunden** bei Abholung und Zustellung (mit Status-Link bzw. Übergabeprotokoll)

**Angebote & Anfragen**
- Angebot aus Eckdaten: Strecke (automatisch berechnet), Kundenkonditionen und Rückreise ergeben die Positionen – danach frei anpassbar
- Angebots-PDF, Versand per E-Mail, Status (Entwurf, versendet, angenommen, abgelehnt, abgelaufen)
- „Angenommen“ legt den Auftrag mit allen Daten an; die Rechnung übernimmt später die Angebotspositionen
- **Öffentliches Anfrageformular** (Link oder per `<iframe>` auf der eigenen Website) mit Spamschutz; Anfragen werden mit einem Klick zum Angebot oder Auftrag, der Kunde wird automatisch zugeordnet bzw. angelegt

**Tourenplanung & Kalender**
- Wochenplan je Fahrer, „Noch einzuplanen“-Liste mit schnellem Einplanen (Fahrer + Termin), Umplanen per Klick
- **Kalender-Abo (iCal)** für iPhone/iPad/Mac, Google Kalender/Android und Outlook – persönlicher, erneuerbarer Link; Anleitung Schritt für Schritt direkt in der App (Kalender → Kalender-Abo)
- **Fahreransicht „Heute“**: eigene Touren des Tages mit Navigation, Anruf beim Ansprechpartner und dem nächsten Arbeitsschritt; überfällige und morgige Touren

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
- **Schadensmeldung (PDF):** neue Schäden bei der Übergabe im direkten Vergleich zur Abholung, mit Fotos beider Zeitpunkte und Unterschriften – als Anhang per E-Mail versendbar

**Übergabeprotokolle**
- Abhol- und Übergabeprotokoll mit Datum, Ort, Kilometerstand, Tank-/Ladestand, Sauberkeit, Zubehör-Checkliste (Schlüssel, Papiere, Warndreieck, Ladekabel …) und Bemerkungen
- **Digitale Unterschrift** von Kunde/Empfänger und Fahrer (Finger, Stift, Maus)
- PDF mit Schadensskizze, Schadensliste, Unterschriften und Fotodokumentation
- **Per E-Mail an den Kunden senden:** Abhol-/Übergabeprotokoll (und Rechnung) als PDF-Anhang direkt aus der App – Empfänger, Betreff und Text vorbelegt, Versand wird im Verlauf protokolliert
- Abschluss setzt den Auftragsstatus automatisch weiter

**Belege & Spesen**
- Belege (Bahn, Hotel, Tanken, Maut, Spesen …) fotografieren oder als PDF hochladen
- **Automatisches Auslesen** von Aussteller, Datum, Betrag, USt-Satz und Kategorie (lokal per OCR oder per KI)
- Kennzeichnung „weiterberechnen“ – fließt automatisch in die Rechnung ein (Fahrtkosten sind bei pauschaler Rückreise automatisch nicht weiterberechnet)
- **Verpflegungspauschale** wird aus der Abwesenheit (Abholung bis Übergabe + Rückfahrt) vorgeschlagen: 14 € ab 8 Std. bzw. An-/Abreisetag, 28 € je vollem Tag (Beträge einstellbar)
- **Belegschutz (GoBD):** Sobald die Rechnung zum Auftrag festgeschrieben ist, sind die Belege gesperrt; bereits abgerechnete Belegdateien werden nie gelöscht

**Belege & Dokumente (Archiv)**
- Zentrale Übersicht aller Belege aus Aufträgen und aller Fahrzeugdokumente (z. B. Fahrzeugschein)
- Automatische Tags aus dem Auftrag: Kunde, Kennzeichen, Auftragsnummer, Kategorie – anklickbar zum Filtern
- Suche, Filter nach Kunde, Kennzeichen, Kategorie, Zeitraum und Typ; Summen der gefilterten Belege
- Export der gefilterten Belege als ZIP (sprechende Dateinamen + Übersicht.csv) oder CSV – z. B. für den Steuerberater

**Rechnungen**
- Rechnung per Klick aus dem Auftrag (Überführungsleistung + weiterberechnete Auslagen netto)
- Frei bearbeitbarer Entwurf, dann **Festschreiben** mit fortlaufender Rechnungsnummer (z. B. `RE-2026-0001`)
- PDF nach DIN-5008-Layout mit Absender, Logo, Bankverbindung, Fußzeile und **GiroCode (EPC-QR)** zum Bezahlen per Banking-App
- Kleinunternehmerregelung (§ 19 UStG), mehrere Steuersätze, Zahlungsziel und Skonto je Kunde, Status offen/überfällig/bezahlt
- Stornierung erzeugt automatisch eine **Stornorechnung**
- **E-Rechnung:** festgeschriebene Rechnungen sind ZUGFeRD/Factur-X-PDFs (PDF/A-3b mit eingebetteter XML, Profil XRechnung); zusätzlich reine **XRechnung-XML** (UN/CEFACT CII, EN 16931) zum Download oder als E-Mail-Anhang, inkl. Leitweg-ID, Skonto und Stornobezug. Geprüft mit dem Mustang-Validator (XRechnung-3.0-Schematron) und veraPDF
- **Mahnwesen:** Zahlungserinnerung, 1. und 2. Mahnung mit einstellbaren Gebühren und Fristen, Mahn-PDF mit GiroCode über den Gesamtbetrag, Versand per E-Mail (Rechnung im Anhang), Filter „Überfällig“
- Zentrale Einstellungen: Firmenname, Adresse, Kontakt, Steuernummer/USt-IdNr., IBAN/BIC, Einleitungs- und Schlusstext, Protokoll-Hinweistext

**Funkloch-sicher (Offline)**
- Ohne Verbindung bleiben Formulareingaben erhalten und werden automatisch gesendet, sobald wieder Netz da ist
- Protokolle inkl. Unterschriften werden zusätzlich auf dem Gerät gesichert (überstehen Neuladen/Schließen)
- Fotos, Belege und Schäden landen offline in einer Warteschlange auf dem Gerät und werden später automatisch hochgeladen
- Hinweisleiste mit ausstehenden Uploads, Offline-Seite statt Browser-Fehlermeldung
- Nicht offline möglich: Seiten neu öffnen, Erkennung, Streckenberechnung, Rechnungen

**Benutzer & Teams**
- Registrierung per E-Mail/Passwort, **Login mit Google oder Apple**
- Jede Registrierung erhält eine eigene **Instanz** (Firma); weitere Personen können per Einladungslink/E-Mail eingeladen werden
- Rollen: Inhaber, Administrator, Mitarbeiter; Wechsel zwischen mehreren Instanzen
- Als App installierbar (PWA) auf iPhone/iPad/Android

## Technik

- Next.js 15 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 4
- MySQL 8 via Prisma ORM
- Auth.js (NextAuth v5) – Credentials, Google, Apple
- PDF-Erzeugung mit PDFKit (eingebettete Schrift Liberation Sans, SIL Open Font License – siehe `assets/fonts/LICENSE.txt`), QR-Codes mit `qrcode`
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
| `SMTP_*` | E-Mail-Versand für Einladungen, Protokolle und Rechnungen (optional – ohne SMTP: PDF-Download + vorbereitete E-Mail im eigenen Mailprogramm) |

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

### Kundenservice, E-Mail & öffentliche Seiten

- **E-Mail-Versand** (Protokolle, Rechnungen, Angebote, Mahnungen, Einladungen, automatische Status-Mails, Benachrichtigung über neue Anfragen) läuft über SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. Ohne SMTP funktionieren alle Funktionen außer dem Versand.
- **Öffentliche Seiten** ohne Anmeldung: Status-Link (`/t/…`), Anfrageformular (`/anfrage/…`) und Kalender-Abo (`/api/calendar/….ics`). Alle Links enthalten einen zufälligen, nicht erratbaren Schlüssel und lassen sich jederzeit deaktivieren bzw. erneuern. Links in E-Mails und Kalendern verwenden `APP_URL`.
- Anfrageformular aktivieren: Einstellungen → Kundenservice. Einbinden auf der eigenen Website per `<iframe src="…/anfrage/<schlüssel>?embed=1">` (Code wird dort angezeigt).

### E-Rechnung

Festgeschriebene Rechnungen werden als ZUGFeRD/Factur-X erzeugt (PDF/A-3b mit eingebetteter `factur-x.xml`, Profil XRechnung 3.0 / EN 16931). Für Behörden-Portale gibt es die reine XRechnung-XML (Rechnung → „XRechnung (XML) herunterladen“ oder als E-Mail-Anhang). Voraussetzungen, auf die die App hinweist: vollständige Firmenanschrift, E-Mail, Telefon, USt-IdNr. oder Steuernummer, IBAN sowie die E-Mail-Adresse des Kunden; für öffentliche Auftraggeber die **Leitweg-ID** am Kunden. Hinweis: Die Ausgabe wurde mit dem Mustang-Validator (inkl. XRechnung-Schematron und veraPDF) geprüft; eine Prüfung mit dem offiziellen KoSIT-Validator bzw. durch den Steuerberater wird vor dem Produktiveinsatz empfohlen.

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
prisma/schema.prisma           Datenmodell (Instanzen, Kunden, Aufträge, Fotos, Schäden, Protokolle, Belege, Rechnungen, Mahnungen, Angebote, Anfragen)
src/auth.ts                    Auth.js-Konfiguration (E-Mail, Google, Apple)
src/app/(auth)/                Login, Registrierung, Einladungen
src/app/(app)/                 Dashboard, Heute, Kalender, Aufträge, Angebote, Anfragen, Kunden, Rechnungen, Einstellungen
src/app/t/, src/app/anfrage/   Öffentlicher Status-Link und Anfrageformular
src/app/api/                   Datei-Auslieferung, PDF-/XML-Endpunkte, Kalender-Abo (ICS), Healthcheck
src/lib/einvoice.ts            E-Rechnung (XRechnung/ZUGFeRD, CII)
src/lib/pricing.ts             Konditionen, Rückreise, Positionen für Angebote und Rechnungen
src/lib/calendar.ts            Wochenplanung und ICS-Erzeugung
src/lib/recognition.ts         Auswahl der Erkennung (KI oder lokale OCR)
src/lib/ocr.ts, ocr-parse.ts   Lokale Texterkennung & Auswertung (FIN, Kennzeichen, Fahrzeugschein, Belege)
src/lib/ai.ts                  KI-Erkennung (Claude Vision)
src/lib/pdf/                   PDFs: Rechnung, Angebot, Mahnung, Protokolle, Schadensmeldung
src/lib/storage.ts             Datei-Speicher (lokal / S3)
```

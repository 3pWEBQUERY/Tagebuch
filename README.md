# Tagebuch

Eine installierbare Tagebuch-App (PWA) für Gedanken und Gefühle – privat geführt, mit
optionalem sozialem Teil: Profile, Feed, Folgen, Herzen und Kommentare.

**Der Grundsatz:** Jeder Eintrag ist privat und bleibt es, bis er ausdrücklich veröffentlicht
wird. Es gibt keinen Automatismus und keine Voreinstellung, die das ändert. Ein Tagebuch,
das versehentlich öffentlich wird, wäre ein Schaden, den man nicht zurücknehmen kann.

Geschrieben wird zuerst auf das Gerät (IndexedDB), danach gleicht die App im Hintergrund
mit einer **Postgres-Datenbank** ab. Ohne Netz bleibt alles bedienbar; Änderungen gehen beim
nächsten Abgleich mit.

Der Zugang läuft über ein Konto: registrieren mit E-Mail und Passwort, danach anmelden. Einträge
hängen am Konto und sind für andere Konten unsichtbar – auch dann, wenn jemand die id eines
fremden Eintrags errät. Passwörter liegen als scrypt-Hash, die Sitzung ist ein signiertes
HttpOnly-Cookie mit einem Jahr Laufzeit.

## Funktionen

- **Schreiben** – Titel (optional), Fließtext, Themen-Tags, Favoriten. Automatisches Sichern
  beim Tippen, leere Einträge verschwinden von selbst.
- **Stimmung** – fünf Stufen von „Schwer“ bis „Großartig“, jede mit eigener Farbe.
- **Finden** – Volltextsuche über Titel, Text und Themen, dazu Filter für Favoriten,
  gute und schwere Tage. Treffer werden hervorgehoben.
- **Verlauf** – Serie in Tagen, Anzahl Einträge, Wörter, Ø Stimmung, Stimmungskurve der
  letzten 30 Tage, Verteilung und häufige Themen.
- **Aussehen** – Hell / Dunkel / System, sechs Akzentfarben, respektiert
  `prefers-reduced-motion`.
- **PWA** – installierbar, offline nutzbar, App-Shortcut „Neuer Eintrag“.
- **Bedienung** – Tastatur (`N` neuer Eintrag, `/` Suche, `Esc` schließen), sichtbarer
  Fokus, Screenreader-Beschriftungen, Touch-Ziele ≥ 44 px.

## Technik

| | |
|---|---|
| Framework | Next.js 16 (App Router, React 19, TypeScript) |
| Datenbank | PostgreSQL über `pg`: Konten, Einträge, Folgen, Herzen, Kommentare; Schema legt sich beim ersten Zugriff selbst an |
| Speicher | IndexedDB (führende Kopie), localStorage (Theme, Akzentfarbe, Sync-Marken) |
| Styling | eigenes CSS-Design-System, keine UI-Bibliothek |
| Offline | eigener Service Worker (`public/sw.js`) |

## Entwicklung

```bash
npm install
cp .env.example .env.local   # DATABASE_URL eintragen
npm run dev
```

Für die lokale Entwicklung genügt eine eigene Datenbank:

```bash
createdb tagebuch_dev
```

Produktionsbuild und Start:

```bash
npm run build
npm start
```

> Der Service Worker ist nur im Produktionsbuild aktiv, damit die Entwicklung nicht
> gegen den Cache läuft.

## Deployment auf Railway

Das Projekt enthält zwei Dienste: `Postgres` und `Tagebuch`. Die App bekommt die
Verbindung als Referenz, damit sie immer auf den richtigen Dienst zeigt:

```bash
railway variables --service Tagebuch --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
railway variables --service Tagebuch --set "AUTH_SECRET=$(openssl rand -hex 32)"
railway up --service Tagebuch
```

`AUTH_SECRET` signiert die Sitzungen – ändert man ihn, müssen sich alle Geräte neu anmelden.
Mit `SIGNUP_CODE` lässt sich die Registrierung auf Eingeweihte beschränken.

Die interne Adresse `postgres.railway.internal` ist **nur innerhalb von Railway**
erreichbar. Wer vom eigenen Rechner auf dieselbe Datenbank will, aktiviert beim
Postgres-Dienst den TCP-Proxy und nutzt dessen `DATABASE_PUBLIC_URL`.

## Aufbau

```
app/            Layout, Seite, globales Design-System (globals.css)
app/api/entries Abgleich-Endpunkt: Änderungen entgegennehmen und ausliefern
app/api/feed    Feed, Profile, Folgen, Herzen, Kommentare
components/     Oberfläche: Journal, Editor, Verlauf, Einstellungen, Navigation
lib/            IndexedDB, Zustand, Abgleich (sync.ts), Formate, Typen
lib/server/     Datenbankpool, Schema, Konten, soziale Abfragen – nur serverseitig
public/         Manifest, Service Worker, Icons
```

## Datenschutz

Die Einträge liegen auf dem Gerät und in der eigenen Datenbank – es gibt keine Dritten,
keine Analyse, kein Tracking. Solange kein Zugangsschutz davor liegt, ist die laufende App
allerdings für jeden erreichbar, der die Adresse kennt.

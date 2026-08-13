# Tagebuch

Eine installierbare Tagebuch-App (PWA) für Gedanken und Gefühle – mit Stimmungs­erfassung,
Verlauf, Hell-/Dunkelmodus und einer Oberfläche im Liquid-Glass-Stil.

Alle Einträge liegen **ausschließlich auf dem Gerät** (IndexedDB). Kein Konto, kein Server,
keine Übertragung. Der Export als JSON ist die Sicherung.

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
| Ausgabe | statischer Export (`output: "export"`) – läuft auf jedem Static-Host |
| Speicher | IndexedDB (Einträge), localStorage (Theme, Akzentfarbe) |
| Styling | eigenes CSS-Design-System, keine UI-Bibliothek |
| Offline | eigener Service Worker (`public/sw.js`) |

## Entwicklung

```bash
npm install
npm run dev
```

Produktionsbuild – erzeugt den statischen Export nach `out/`:

```bash
npm run build
```

Das Ergebnis lässt sich direkt ausliefern, z. B.:

```bash
npx serve out
```

> Der Service Worker ist nur im Produktionsbuild aktiv, damit die Entwicklung nicht
> gegen den Cache läuft.

## Aufbau

```
app/        Layout, Seite, globales Design-System (globals.css)
components/ Oberfläche: Journal, Editor, Verlauf, Einstellungen, Navigation
lib/        Daten (IndexedDB), Zustand, Datums- und Textformate, Typen
public/     Manifest, Service Worker, Icons
```

## Datenschutz

Es werden keine Daten erhoben, gesendet oder mit Dritten geteilt. Wer die App deinstalliert
oder die Websitedaten löscht, löscht auch die Einträge – deshalb vorher exportieren.

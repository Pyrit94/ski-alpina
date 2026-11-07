# Ski Alpina

Zu zweit ein Skigebiet am Matterhorn aufbauen – in Runden, mit Ereignissen, Medaillen und einer Endwertung. Gelände nach Copernicus DEM GLO-30 (Zermatt), Server autoritativ, Wirtschaft flussbasiert (Max-Flow über Lifte und Pisten).

## So wird gespielt

1. **Anmelden** mit Google (nur freigeschaltete Konten) und **«Gemeinsam bauen»** – beide landen im selben Tal.
2. **Partie starten** (Rundenleiste oben): *Kurz* 6 Runden, *Normal* 12, *Lang* 18. Eine Runde sind zehn Spieltage.
3. **Planen:** Lifte, Pisten, Restaurants, Hotels bauen. Die Vorschau zeigt sofort, was der Ausbau bringt.
4. **Runde beenden:** Wenn alle Anwesenden bereit sind, rechnet das Spiel zehn Tage durch und zeigt den Wochenbericht. Wer nicht online ist, blockiert nichts.
5. **Ereignisse** (Weltcup-Anfrage, Föhnsturm, Lawinengefahr …) verlangen einen Entscheid.
6. **Saisonziel:** Bronze, Silber oder Gold für die Gäste einer Saison. Am Ende zählen Kasse, halber Anlagewert, Gäste, Zufriedenheit und Medaillen – Bestenliste pro Raum.

Was zählt:

- **Gäste kommen wegen der Pisten.** Kilometer, Abwechslung (blau/rot/schwarz/Park), Komfort, Prestige (Sterne) und Ruf ziehen an. Parkhäuser, Bus und Hotels sind nur die Türen ins Tal.
- **Lifte und Pisten müssen ein Netz bilden** – vom Dorf hinauf und zurück. Der Engpass steht im Betrieb-Panel.
- **Der Schnee geht.** Gegen Saisonende steigt die Schneegrenze; Beschneiung und höher gelegene Pisten verlängern die Saison.
- **Ticketpreis** ist der tägliche Hebel: zu teuer vertreibt Gäste, zu billig verschenkt Geld.

**Pisten bauen** (Bauen → Pisten → Piste):

- **Zeichnen:** an der Bergstation drücken und talwärts ziehen (am Handy: Raster zielen und stempeln). Der Start rastet an Bergstationen und Pistenenden ein.
- **Route:** Start und Ziel antippen, Ziel-Schwierigkeit wählen (blau/rot/schwarz/egal) – das Spiel schlägt die passende Linie vor.
- **Breite:** schmal / normal / breit (Kapazität, Preis, Unterhalt; breite blaue Pisten ziehen Anfänger an).
- Live: Länge, Gefälle, Schwierigkeit, Kapazität, Preis, Unterhalt, **Höhenprofil mit Schneegrenze**, ✓/✗ ob Start und Ende angeschlossen sind.
- **Zurück** (Backspace), **Fertig** (Enter), **Abbrechen** (Esc). Gebaute Pisten lassen sich umbenennen und verbreitern/verschmälern.

**Forschung** (Tab «Forschung», am Handy über «Ziele»): Forschungspunkte entstehen aus Gästen und Höhenmetern. 21 Verbesserungen in fünf Zweigen – Bahnen, Pisten & Schnee, Gäste & Marketing, Betrieb und **Allianz**. Allianz-Forschung startet erst, wenn alle Anwesenden zugesagt haben (z. B. Gemeinsamer Einkauf −8 % Baukosten, Funkverbindung +50 % Teamwork-Bonus). Warteschlange bis 3, mit Geld beschleunigen möglich.

**Spielregeln** (beim Start unter «Spielregeln anpassen», fast alles auch zwischen den Runden im Tab «Ziele»):

| Regel | Optionen |
| --- | --- |
| Kasse | **Gemeinsam** · **Berg & Tal** (eine:r baut Bahnen/Pisten/Schnee, die andere Person Hotels/Gastro/Dienste; jede Rolle hat eine Kasse, Einnahmen-Aufteilung per Regler, Überweisungen im Tab «Team») · **Duell** (jede:r eigenes Geld, verdient an den eigenen Bahnen, eigene Wertung) – gilt für die ganze Partie |
| Ereignisse | Aus · Wer zuerst entscheidet · Abstimmen (uneinig = beide Optionen zur Hälfte) |
| VIP-Gäste | Wünsche mit Frist («Familie Meier will 2 km blaue Pisten») – Geld und Sterne oder ein Stern weniger |
| Geheime Ziele | Jede:r ein verdecktes Ziel für Bonuspunkte, aufgedeckt am Ende |
| Forschung | Forschungsbaum inkl. Allianz-Zweig |
| Teamwork-Bonus | Bauen alle in einer Runde etwas: 4'000 CHF und ein Stern |
| Fotoalbum | Ein Bild pro Runde (auf dem Gerät gespeichert), am Ende als Zeitraffer |

Zu zweit:

- **Team-Chat** mit Schnell-Reaktionen (Tab «Team», am Handy die Sprechblase); Nachrichten bleiben im Gebiet.
- **Markierungen** auf der Karte: Auge / Hammer / Warnschild wählen, auf die Stelle tippen – die andere Person sieht einen Pin mit «Schau mal», «Hier bauen?» oder «Problem».
- **Teamwork-Bonus:** Bauen beide in einer Runde etwas, gibt es 4'000 CHF und einen Stern.
- **Push aufs Handy** (ntfy, optional): «Michael hat Runde 3 beendet und wartet auf dich» – siehe `docs/deploy-coolify.md`.
- **Auszeichnungen** am Partie-Ende (Pistenkönig:in, Bahnbau-Profi, Gastgeber:in …) und Rekorde im Wochenbericht.

**Grafiken:** freie Texturen und Fotos (CC0) lädt `tools/textures/Get-Textures.ps1` – Anleitung in [`tools/textures/README.md`](tools/textures/README.md).

Daneben gibt es das **freie Spiel** ohne Ende: Die Zeit läuft in Echtzeit, aber nur, solange jemand im Raum ist.

Balancing-Zahlen stehen ausschliesslich in `packages/config/src/` (`economy.ts`, `match.ts`, `items.ts`, `quests.ts`).

## Lokal

```bash
npm ci --legacy-peer-deps
npm run dev
```

Spieler treten dem Raum `zermatt` bei und bauen gemeinsam. Spielstand liegt serverseitig (PGlite lokal, Postgres in Coolify). Ohne Google-Konfiguration lokal mit `VITE_AUTH_ENABLED=false npm run dev` spielen.

```bash
npm test
npm run typecheck
npm run terrain:build
```

## Deploy (rasselbande.work)

Läuft als Coolify-Ressource (Docker Compose, `docker-compose.coolify.yml`) unter
**https://ski.rasselbande.work**. Push auf `main` → GitHub Actions prüft, Coolify
deployt. Einrichtung, Variablen und Checks: [`docs/deploy-coolify.md`](docs/deploy-coolify.md).

Lokal wie in Produktion (Variablen siehe `.env.example`):

```bash
docker compose -f docker-compose.coolify.yml --env-file .env up --build
```

## Architektur

| Pfad | Rolle |
| --- | --- |
| `packages/config` | Balancing (Kosten, Quests, DEM-Fenster) |
| `packages/shared` | Zod-Protokoll, Validierung, Fluss-Sim |
| `apps/api` | Fastify HTTP + WS |
| `apps/sim` | Worker (Redis/BullMQ, sonst In-Process) |
| `src/` | Mobile-First Client (TanStack Start / Grok-Host) |

Client sendet nur Intents. Sichtbare Skifahrer sind Visualisierung, gedeckelt.

## Attribution

Enthält modifizierte Copernicus-Daten (DEM GLO-30), © European Union / ESA.

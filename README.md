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

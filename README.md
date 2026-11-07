# Ski Builder

Mehrspieler-Skigebiet-Simulator im SimCity-Stil. Lifte, Pisten, Hotellerie und Quests auf einem Gelände nach Copernicus DEM GLO-30 (Zermatt / Matterhorn). Server ist autoritativ, die Wirtschaft ist flussbasiert.

## Lokal

```bash
npm ci --legacy-peer-deps
npm run dev
```

Spieler treten dem Raum `zermatt` bei und bauen gemeinsam. Spielstand liegt serverseitig (PGlite lokal, Postgres in Coolify).

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

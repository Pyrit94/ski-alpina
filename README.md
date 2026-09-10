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

## Docker / Coolify

Ein Container (Dockerfile, Port **8080**):

```bash
docker compose up --build
```

Oder der volle Stack:

```bash
docker compose -f infra/docker-compose.yml up --build
```

Coolify: Build Pack Dockerfile, Port 8080. Host-Ports nur am Proxy via `$PORT`.

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

# Ski Alpina

3D-Skigebiet-Simulator im SimCity-Stil. Lifte, Pisten, Hotellerie, Verkehr und Quests auf einem Gelände nach Walliser Gipfeln (Matterhorn, Klein Matterhorn, Gornergrat). Mobile-first, Deutsch, mit Docker- und Coolify-Support.

## Lokal starten

```bash
npm ci --legacy-peer-deps
npm run dev
```

Dann im Browser öffnen. Spielstand liegt in `localStorage`.

```bash
npm run build
npm run typecheck
```

## Docker

```bash
docker compose up --build
```

Der Container lauscht auf Port **8080**. Healthcheck: `GET /`.

Nur Image bauen:

```bash
docker build -t ski-alpina .
docker run --rm -p 8080:8080 -e PORT=8080 ski-alpina
```

## Coolify

1. Neue Resource → Git-Repository (`Pyrit94/ski-alpina`).
2. Build Pack: **Dockerfile**.
3. Port: **8080** (oder `$PORT`).
4. Optional: Healthcheck `GET /`.
5. Deploy.

Keine Datenbank und kein Login nötig. Der Spielstand bleibt im Browser.

## Steuerung

| Gerät | Aktion |
| --- | --- |
| Handy | Unten: Drehen/Schieben, Bauen, Ziele, Info. Karte mit einem Finger drehen, mit zwei Fingern zoomen. |
| Laptop | Linke Spalte bauen, rechte Spalte Info/Quests. Karte mit Maus drehen und zoomen. |

Baue zuerst einen Schlepplift (zwei Stationen tippen), dann eine blaue Piste talwärts.

## Stack

TanStack Start, React, Three.js / React Three Fiber, Zustand, Tailwind. Wetter live von Open-Meteo (Zermatt).

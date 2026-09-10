# SKI BUILDER

Mehrspieler-Skigebiet-Aufbausimulator im Look von SimCity BuildIt.
Echtes Alpengelände (Copernicus DEM GLO-30), Echtzeit-Koop, Mobile-First, self-hosted via Docker/Coolify.

## Nicht verhandelbar

1. **Server ist autoritativ.** Der Client sendet Absichten, nie Ergebnisse. Jede Bau-, Kauf- und
   Preisaktion wird serverseitig validiert (Budget, Terrain, Kollision, Steigung, Rechte).
2. **Simulation ist flussbasiert, nicht agentenbasiert.** Die Wirtschaft rechnet Personenströme
   pro Stunde über einen gerichteten Graphen (Knoten = Stationen/Pistenenden, Kanten = Lifte und
   Pisten mit Kapazität und Fahrzeit). Sichtbare Skifahrer und Gondeln sind reine Visualisierung,
   nur im Frustum gespawnt, hart gedeckelt. Eine Agentensimulation pro Gast ist verboten.
3. **Balancing ist Data-Driven.** Jede Anlagen-, Gebäude-, Quest- und Kostendefinition liegt als
   typisierte Config in `packages/config/`. Keine Balancing-Zahl im Code.
4. **Mobile-First.** Jede UI wird zuerst für 390 px Breite gebaut, dann für Desktop erweitert.
   Keine Funktion darf Hover voraussetzen. Zielflächen >= 44 px.
5. **Geodaten sind Wahrheit fürs Gameplay, nicht für die Optik.** Höhe, Hangneigung und Exposition
   kommen aus dem DEM. Mikro-Relief wird beim Rendern prozedural ergänzt und beeinflusst nie die Logik.

## Stack (dieses Repo)

Grok App Builder hostet das Frontend als TanStack Start auf Port 8080 (`src/`).
Spiel-Logik lebt in `packages/shared`, Balancing in `packages/config`.
`apps/api` und `apps/sim` sind die Coolify-Prozesse. Im Preview läuft dieselbe
Engine im Vite-Prozess (PGlite, In-Process-Tick). Redis/Postgres sobald gesetzt.

## Struktur

```
apps/web         → src/ (Grok-Host / Vite)
apps/api         Fastify HTTP + WS
apps/sim         Simulations-Worker
packages/shared  Typen, Spiel-Logik, Zod-Schemas
packages/config  Balancing-Daten
tools/terrain    DEM-Pipeline
infra/           docker-compose.yml, nginx.conf, init-db.sql
docs/phases/     Phasenspezifikationen
```

Spiel-Logik, die Client und Server beide brauchen, gehört **immer** nach `packages/shared`.

## Konventionen

- TypeScript strict. Kein `any`, kein `@ts-ignore` in packages/*.
- Keine Default-Exports in `packages/` und `apps/`.
- Bezeichner im Code: Englisch. UI-Texte: Deutsch, Schweizer Orthografie, kein ß.
- Zod-Schema für jeden API- und WS-Payload in `packages/shared/src/protocol/`.
- Neue Spielmechanik ohne Test wird nicht akzeptiert.

## Performance-Budget (hart)

- 60 fps Ziel, 40 fps Minimum auf einem Mittelklasse-Handy.
- < 150 Draw Calls. InstancedMesh für Bäume, Stützen, Gondeln, Skifahrer.
- Adaptive Qualität. Kein Post-Processing auf Mobile ausser optionalem FXAA.

## Design-Tokens

| Zweck | Wert |
|---|---|
| Primärblau | `#2F6FED` |
| Navy | `#16305C` |
| Hellblau | `#A8CBF5` |
| Erfolg | `#34A853` |
| Münzen | `#F4B942` |
| Grau | `#7C8DA6` |
| Radius Karten | 16–20 px |
| Schrift | Poppins Bold / Medium / Regular |

Bau-States: Verfügbar = grün, Ausgewählt = blau, Nicht möglich = grau, Zu teuer = orange.

## Lizenz-Pflicht

Copernicus DEM: Attribution im Info-Dialog und im Footer.
Text: «Enthält modifizierte Copernicus-Daten (DEM GLO-30), © European Union / ESA».

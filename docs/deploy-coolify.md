# Deployment auf Coolify (privat, zwei Konten)

Ziel: das Skigebiet laeuft unter einer eigenen Domain, Spielstand in Postgres,
und **nur die Konten auf der Allowlist** kommen rein — Login via Google.

## Topologie im Container

Ein Container, zwei Prozesse (`scripts/docker-serve.mjs`):

| Prozess | Port | Rolle |
| --- | --- | --- |
| `vite preview` | `$PORT` (8080) | App, SSR, `/api/auth/*` |
| `scripts/ws-server.mjs` | 127.0.0.1:8788 | autoritativer Spiel-Socket auf `/ws` |

`preview.proxy` leitet `/ws` an den Socket-Prozess. Dadurch ist alles **eine
Origin**, und der Browser schickt das Session-Cookie beim WebSocket-Upgrade mit
— das ist die Grundlage der Zugangspruefung.

Stirbt einer der beiden Prozesse, beendet sich der Container, damit Coolify
neu startet statt eine halb tote Instanz weiterlaufen zu lassen.

## Coolify-Einstellungen

- Build Pack: **Dockerfile**
- Port: **8080**
- Healthcheck: `GET /`
- Eine **Postgres**-Ressource anlegen und deren URL als `DATABASE_URL` setzen

## Umgebungsvariablen

### Build **und** Runtime

`VITE_`-Variablen werden in das Browser-Bundle gebacken, muessen also schon
beim **Build** gesetzt sein:

| Variable | Wert |
| --- | --- |
| `VITE_AUTH_ENABLED` | `true` |

### Nur Runtime

| Variable | Wert |
| --- | --- |
| `DATABASE_URL` | `postgres://…` aus der Coolify-Postgres-Ressource |
| `BETTER_AUTH_URL` | die oeffentliche URL, z. B. `https://ski.example.ch` |
| `BETTER_AUTH_SECRET` | zufaellig, min. 32 Byte: `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | aus der Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | dito |
| `ALLOWED_EMAILS` | optional — ohne Angabe gelten die beiden Konten aus `DEFAULT_ROSTER` |

`GOOGLE_CLIENT_ID`/`SECRET` schalten den Login von der Grok-Broker-Federation
auf **direktes Google OAuth** um. Der Broker existiert nur innerhalb der
Grok-Plattform; eine eigene Instanz muss selbst mit Google sprechen.

## Google OAuth einrichten

1. Google Cloud Console → **APIs & Services** → **Credentials**
2. **Create Credentials** → **OAuth client ID** → Typ **Web application**
3. **Authorized redirect URI** exakt:

   ```
   https://DEINE-DOMAIN/api/auth/oauth2/callback/grok-google
   ```

4. Client ID und Secret als Umgebungsvariablen setzen

Der Consent Screen kann auf **External / Testing** bleiben; dann beide
Gmail-Adressen als Test-User eintragen. Eine Google-Verifizierung ist fuer zwei
Nutzer nicht noetig.

## Allowlist

Ohne `ALLOWED_EMAILS` gilt `DEFAULT_ROSTER` aus `src/lib/auth/allowlist.ts` —
die beiden Konten, denen dieses Skigebiet gehoert. Das ist **kein** Loch in der
Fail-closed-Regel: die Tuer bleibt zu, nur eben fuer diese zwei statt fuer
niemanden. Eine vergessene Variable macht das Gebiet also fuer euch spielbar
und fuer alle anderen nicht.

`ALLOWED_EMAILS` **ersetzt** diese Liste, sie ergaenzt sie nicht — sonst liesse
sich jemand nicht mehr entfernen. Eine Liste, die nur Unsinn enthaelt, laesst
niemanden rein: das hat jemand so geschrieben und faellt nicht still zurueck.

Getrennt wird mit Komma, Semikolon oder Zeilenumbruch. Gmail-Punkte und
`+tags` werden normalisiert: `m.uessle+ski@gmail.com` und `muessle@gmail.com`
sind dasselbe Postfach und damit derselbe Zugang.

Die Liste wird an **drei** Stellen geprueft:

1. bei der Kontoanlage — ein fremdes Konto entsteht gar nicht erst
2. bei jeder Session-Aufloesung — wer von der Liste fliegt, ist sofort draussen
   und nicht erst wenn sein Cookie ablaeuft
3. beim WebSocket-Upgrade — ohne gueltige Session gibt es keinen Socket

**Fail-closed:** sobald `DATABASE_URL` gesetzt ist, gilt die Allowlist
unbedingt. Ist `ALLOWED_EMAILS` dann leer, kommt **niemand** rein. Das ist
Absicht — eine vergessene Variable darf nicht bedeuten, dass jedes
Google-Konto der Welt mitbauen kann.

## Datenbank

`npm run build` fuehrt `scripts/migrate.mjs` aus. Angewendet werden die
`.sql`-Dateien direkt in `migrations/` (nicht rekursiv):

- `0001_auth.sql` — Better-Auth-Schema (aus `migrations/auth/` hochkopiert, weil
  diese App Login nutzt)
- `0002_ski_builder.sql` — Tabelle `resorts` mit dem Spielstand-Snapshot

Der Socket-Prozess laedt beim Start alle Raeume aus `resorts` und schreibt sie
alle paar Sekunden zurueck.

## Nach dem Deploy pruefen

1. `https://DEINE-DOMAIN` oeffnen → Google-Login erscheint
2. Mit einer Adresse **von** der Liste anmelden → Spiel startet, Panel „Betrieb"
   zeigt Zahlen
3. Mit einer Adresse **nicht** von der Liste anmelden → wird abgewiesen
4. In den Container-Logs steht beim Start:
   `[ws] game socket on 127.0.0.1:8788 — roster enforced (2 allowed)`

## Was hier nicht laeuft

`apps/api` (Fastify) authentifiziert Sockets **nicht** und startet ohne
`SKI_API_ALLOW_ANONYMOUS=1` gar nicht. Es gehoert zum Stack in
`infra/docker-compose.yml`, wo nginx davor steht und der Port nicht
veroeffentlicht wird. Fuer Coolify ist der Dockerfile-Pfad oben der richtige.

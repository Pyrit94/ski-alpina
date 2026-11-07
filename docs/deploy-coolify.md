# Deployment auf Coolify (rasselbande.work)

Ziel: das Skigebiet läuft unter **https://ski.rasselbande.work** auf dem NUC,
hinter dem Cloudflare-Tunnel, Spielstand in Postgres, und **nur die Konten auf
der Allowlist** kommen rein — Login via Google. Jeder Push auf `main` deployt
automatisch (GitHub-App `coolify-rasselbande`), GitHub Actions prüft vorher.

```
Push auf main ──► GitHub Actions (Lint, Typecheck, Tests, Build, Docker-Smoke)
      └────────► Coolify (GitHub-App) baut docker-compose.coolify.yml ──► NUC
Browser ─HTTPS─► Cloudflare ─Tunnel─► Traefik :80 ─► app:8080 ─► db (Postgres, Volume ski-db)
```

## Einmalig einrichten

1. **GitHub-App freigeben:** GitHub → Settings → Applications → `coolify-rasselbande`
   → Configure → Repository access → `ski-alpina` hinzufügen. In Coolify danach
   **Refresh Repository List**.
2. **Coolify:** Projekt *Deployments*, Umgebung *production* → **New Resource →
   Private Repository (with GitHub App)** → `Pyrit94/ski-alpina`, Branch `main`.
   - Build Pack **Docker Compose**, Location **`/docker-compose.coolify.yml`**
   - Domain nur beim Service `app`: **`http://ski.rasselbande.work:8080`**
     (mit `http://`, TLS macht Cloudflare; ein automatisch angelegtes `www.` wieder entfernen)
   - Volume `ski-db` steht in der Compose-Datei, nichts von Hand anlegen.
3. **Variablen:** Datenbank-Passwort (`SERVICE_PASSWORD_POSTGRES`) und Auth-Secret
   (`SERVICE_PASSWORD_64_BETTERAUTH`) erzeugt Coolify selbst. Von Hand nur
   `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` (dieselben Werte wie bei der
   Wissensablage/dem Portal, Client «Rasselbande Web»), optional `NTFY_URL` und
   `ALLOWED_EMAILS`. `BETTER_AUTH_URL` hat den Standard `https://ski.rasselbande.work`.
4. **Google:** Client „Rasselbande Web“ (Projekt *Wissensablage*) → Authorized redirect URI
   `https://ski.rasselbande.work/api/auth/oauth2/callback/grok-google` ergänzen.
5. **Cloudflare:** Networking → Tunnels → `rasselbande-server` → Routes → Add route →
   Published application: Subdomain `ski`, Domain `rasselbande.work`,
   Service URL `http://192.168.20.100:80`.
6. **Deploy** in Coolify. Ab dann deployt jeder Push auf `main` von selbst.
7. **GitHub → Settings → General → Allow auto-merge** einschalten, damit Dependabot-
   Updates nach grüner CI selbst durchlaufen.

## Topologie im Container

Ein Container, zwei Prozesse (`scripts/docker-serve.mjs`):

| Prozess | Port | Rolle |
| --- | --- | --- |
| `vite preview` | `$PORT` (8080) | App, SSR, `/api/auth/*` |
| `scripts/ws-server.mjs` | 127.0.0.1:8788 | autoritativer Spiel-Socket auf `/ws` |

`preview.proxy` leitet `/ws` an den Socket-Prozess. Dadurch ist alles **eine
Origin**, und der Browser schickt das Session-Cookie beim WebSocket-Upgrade mit
— das ist die Grundlage der Zugangsprüfung.

Beim Start wendet `docker-serve.mjs` zuerst die Migrationen an (mit Wiederholung,
bis Postgres bereit ist). Beim Stoppen schreibt der Socket den Spielstand ein
letztes Mal. Stirbt einer der beiden Prozesse, beendet sich der Container, damit
Coolify neu startet.

Vite lässt nur bekannte Hostnamen durch: der Host aus `BETTER_AUTH_URL` ist
automatisch erlaubt, weitere über `ALLOWED_HOSTS`.

## Umgebungsvariablen

| Variable | Wert |
| --- | --- |
| `SERVICE_PASSWORD_POSTGRES` | erzeugt Coolify; geht als `PGPASSWORD` an die App (Sonderzeichen sicher) |
| `BETTER_AUTH_URL` | `https://ski.rasselbande.work` |
| `SERVICE_PASSWORD_64_BETTERAUTH` | erzeugt Coolify; wird zu `BETTER_AUTH_SECRET` |
| `GOOGLE_CLIENT_ID` | Client „Rasselbande Web“ |
| `GOOGLE_CLIENT_SECRET` | dito |
| `ALLOWED_EMAILS` | optional — ohne Angabe gelten die beiden Konten aus `DEFAULT_ROSTER` |
| `ALLOWED_HOSTS` | optional — weitere Hostnamen |
| `NTFY_URL` | optional — ntfy-Thema für Push «du bist dran», z. B. `https://ntfy.sh/ski-alpina-<zufall>` |

`GOOGLE_CLIENT_ID`/`SECRET` schalten den Login von der Grok-Broker-Federation
auf **direktes Google OAuth** um. Der Broker existiert nur innerhalb der
Grok-Plattform; eine eigene Instanz muss selbst mit Google sprechen.

## Google OAuth

Kein neuer Client nötig: der bestehende Client **„Rasselbande Web“** (Projekt
*Wissensablage*, „In Produktion“) reicht. Dort unter **Authorized redirect URIs**
exakt ergänzen:

```
https://ski.rasselbande.work/api/auth/oauth2/callback/grok-google
```

Wer einen eigenen Client will: Typ **Web application**, dieselbe Redirect-URI. Steht
das Projekt auf **Testing**, beide Gmail-Adressen als Test-User eintragen.

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

Der Container führt beim Start `scripts/migrate.mjs` aus. Angewendet werden die
`.sql`-Dateien direkt in `migrations/` (nicht rekursiv):

- `0001_auth.sql` — Better-Auth-Schema (aus `migrations/auth/` hochkopiert, weil
  diese App Login nutzt)
- `0002_ski_builder.sql` — Tabelle `resorts` mit dem Spielstand-Snapshot

Der Socket-Prozess laedt beim Start alle Raeume aus `resorts` und schreibt sie
alle paar Sekunden zurueck.

## Nach dem Deploy pruefen

1. `https://ski.rasselbande.work` oeffnen → Google-Login erscheint
2. Mit einer Adresse **von** der Liste anmelden → Spiel startet, Panel „Betrieb"
   zeigt Zahlen
3. Mit einer Adresse **nicht** von der Liste anmelden → wird abgewiesen
4. In den Container-Logs steht beim Start:
   `[ws] game socket on 127.0.0.1:8788 — push on — roster enforced (2 allowed)`
   (`push off`, solange `NTFY_URL` fehlt)

## Was hier nicht laeuft

`apps/api` (Fastify) authentifiziert Sockets **nicht** und startet ohne
`SKI_API_ALLOW_ANONYMOUS=1` gar nicht. Es gehoert zum Stack in
`infra/docker-compose.yml`, wo nginx davor steht und der Port nicht
veroeffentlicht wird. Fuer Coolify ist der Dockerfile-Pfad oben der richtige.

## Push aufs Handy (ntfy, optional)

Wenn eine Person «Runde beenden» drückt und die andere offline ist, kommt bei ihr eine
Push-Nachricht («Michael hat Runde 3 beendet und wartet auf dich»). Ebenso nach jeder
gespielten Runde (Gäste, Gewinn, Medaille) und bei Chat-Nachrichten (höchstens alle 2 Min.).

1. In der ntfy-App (Android/iOS) ein **neues, geheimes Thema** abonnieren, z. B.
   `ski-alpina-` plus ein langes Zufallswort. Nicht das Thema der Server-Alarme nehmen.
2. Johanna abonniert dasselbe Thema.
3. In Coolify `NTFY_URL=https://ntfy.sh/<thema>` setzen, **Redeploy**.
4. Im Log steht danach `push on`. Ein Antippen der Nachricht öffnet das Spiel.

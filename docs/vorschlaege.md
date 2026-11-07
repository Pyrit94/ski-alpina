# Prüfung & Vorschläge (November 2026)

Stand nach einer Durchsicht von Engine, Server, Client und Deployment. Behoben ist,
was den Betrieb auf rasselbande.work gefährdet hätte. Der Rest ist nach Wirkung
sortiert und als Arbeitsliste gedacht.

## Bereits behoben (dieser Branch)

| Problem | Folge | Fix |
| --- | --- | --- |
| `/api/auth/*` hatte keine Route (404) | Anmeldung unmöglich, der Socket wies **jeden** ab | `src/routes/api/auth/$.ts` |
| Kein Anmelde-Schritt im Startbildschirm | niemand kam überhaupt zum Login | Google-Button in `StartScreen.tsx` |
| Vite blockt fremde Hostnamen | jede Anfrage über `ski.rasselbande.work` → 403 | `preview.allowedHosts` aus `BETTER_AUTH_URL` |
| Migrationen nur beim Build | in Coolify gibt es beim Build keine DB → Tabelle `resorts` fehlt, nichts wird gespeichert | Migration beim Container-Start, mit Wiederholung |
| `hydrate` schluckte DB-Fehler | leerer Raum überschreibt nach 4 s den echten Spielstand | Prozess bricht ab, defekte Zeilen werden nie überschrieben |
| Spieler-ID zufällig pro Serverstart | nach jedem Deploy „neue“ Person, eigene Bauten gehören niemandem | ID aus dem Konto abgeleitet |
| Welt tickt ohne Spieler weiter | ein Wochenende weg ≈ 25 Spieljahre ohne euch | Simulation pausiert, solange niemand online ist |
| Speichern alle 4 s auch ohne Änderung | ~21'600 Schreibvorgänge pro Raum und Tag | nur geänderte Räume |
| Kein Save beim Stoppen | bis 4 s Bauarbeit pro Deploy verloren | letzter Save bei SIGTERM |
| Exception im Tick | Crash-Loop mit demselben Stand | try/catch pro Raum |

## Umgesetzt in Runde 2

| Vorschlag | Stand |
| --- | --- |
| Parkhaus-Exploit, Nachfrage aus Attraktivität | umgesetzt (`flow.ts`): Spam verliert jetzt Geld, siehe `match.test.ts` |
| Upgrades ab Stufe 1, Upgrade auf Station | behoben, alte Spielstände werden migriert |
| Pisten ohne Zusammenhang | behoben (`validatePistePath`) |
| Vielfalt zählt auch geschlossene Pisten | behoben |
| Sterne ohne Funktion | Sterne = Prestige, +1 % Nachfrage je Stern (max. +40 %) |
| Tote Sommerrunden | Partie-Saison = Winter + Schneeschmelze, Sommer wird übersprungen |
| Partie-Modus mit Runden, Bereitschaft, Bericht, Endwertung | umgesetzt (`engine/match.ts`, `hud/MatchHUD.tsx`) |
| Ereigniskarten, Wetterprognose | 12 Karten in `config/src/match.ts`, Prognose in der Rundenleiste |
| HUD entrümpeln, Entwickler-Sprache, Umlaute, Zahlenformat | umgesetzt |
| Gesperrt/zu teuer sichtbar, Farben pro Typ | umgesetzt |
| Belohnung (Level-up, Medaille, Bericht), Ton | umgesetzt |
| Partner sichtbar (Avatare, Bereit-Status) | umgesetzt |
| Name vereinheitlicht | «Ski Alpina» |
| Ticketpreis und Gebietsname bedienbar | neu (vorher gab es dafür keine Bedienung) |

## Noch offen / nächste Schritte

- **Feintuning nach echten Partien.** Die Zahlen sind mit Simulationen kalibriert
  (Skripte prüfen: vernünftige Strategie ≈ Bronze/Silber, Parkhaus-Spam ≈ Verlust).
  Nach ein, zwei Abenden spielen: `MATCH.goals`, `ECONOMY.demandPerKm`, Preise.
- **Rollen mit Budget-Split** (Bergbahnen & Pisten / Dorf & Gastro) – bewusst noch
  nicht gebaut, erst schauen, ob ihr es vermisst.
- **Schlanker Produktions-Container** (Nitro-Preset `node-server` statt `vite preview`):
  spart Speicher und Image-Grösse (heute ~1,1 GB), braucht aber einen eigenen
  WebSocket-Proxy. Lohnt sich erst, wenn der NUC knapp wird.

## Ursprüngliche Befunde (Runde 1)

## Spielmechanik: Bugs und Exploits

1. **Parkhaus-Spam ist die beste Strategie.** Nachfrage ist fix pro Ankunftspunkt
   (`flow.ts`, 140 Gäste/h pro Parkhaus). Simuliert: 1 Schlepplift + 1 Piste + 9 Parkhäuser
   → von 85k auf 1,7 Mio. CHF in einem Spieljahr. Danach spielt Geld keine Rolle.
   **Vorschlag:** Nachfrage aus der *Attraktivität* ableiten (Pisten-km je Schwierigkeit,
   Vielfalt, Liftkapazität, Ruf, Schnee). Parkhäuser/Bus/Hotel sind nur *Kapazität*, um
   diese Nachfrage ins Gebiet zu lassen.
2. **Liftkapazität ist fast egal** – ein Schlepplift trägt 9 Parkhäuser. Folgt aus 1.
3. **Upgrades starten bei Stufe 1** (`apply.ts`): alle Lifte haben ab Bau +38 %, die erste
   Upgrade-Stufe ist nie kaufbar.
4. **Upgrade auf die Station statt auf den Lift** (`store.ts` Auswahl, `validate.ts`):
   Geld weg, Simulation unverändert. Ebenso Restaurant-Upgrades ohne Wirkung.
5. **Pisten müssen nicht zusammenhängen** (`validate.ts`): `[Gipfel, Tal]` mit 9 Hex Abstand
   wird akzeptiert – „Teleport-Piste“ für 1/7 des Preises, Steilstücke nie geprüft.
6. **Zufriedenheit klebt am Deckel (99 %)**, der Vielfaltsbonus zählt auch geschlossene
   oder unverbundene Pisten.
7. **Sterne haben keine Funktion; Frühling/Sommer (~38 % des Jahres) sind tote Zeit.**
8. Kleinkram: Pisten > 48 Hex werden mit „Nachricht abgelehnt“ verworfen (Client begrenzt
   nicht), `next_tutorial` schliesst nie, veraltete Kommentare „nothing can be demolished“.

## Der wichtigste Umbau: Partien statt Endlosspiel

Ihr wollt etwas, das an ein paar Abenden fertig ist. Vorschlag **„Partie“**:

- **Einstellungen beim Start:** Länge (z. B. *Kurz* 2 Saisons, *Normal* 3, *Lang* 5),
  Runden pro Saison (z. B. 8 Wochen), Startkapital, Schwierigkeit (Wetter, Konkurrenz).
- **Runden statt Echtzeit:** In einer Runde baut ihr beide gleichzeitig (Planungsphase).
  Jede:r drückt **„Runde beenden“** – erst wenn beide bereit sind, simuliert der Server
  eine Woche am Stück und zeigt einen **Wochenbericht** (Gäste, Umsatz, Engpässe, Wetter
  der nächsten Woche). Kein Warten, kein Verpassen, auch asynchron spielbar.
- **Ziel und Ende:** Bronze/Silber/Gold-Ziele pro Saison (z. B. Gäste, Ruf, Gewinn) und am
  Schluss eine **Endwertung** mit Rückblick und Highscore-Liste eurer Partien.
- **Entscheidungen pro Runde:** Wetterprognose (deterministisch vorhanden) macht
  Beschneiung, Ticketpreis und Personal zu echten Entscheiden. Ereigniskarten
  („Föhnsturm“, „Weltcup-Anfrage“, „Pistenbully defekt“) mit 2 Optionen.
- **Koop-Würze:** optionale Rollen (*Bergbahnen & Pisten* / *Dorf & Gastro*) mit Budget-Split
  pro Runde; gemeinsame Ziele, aber jede:r sieht im Bericht den eigenen Beitrag.

**Wo es andockt** (Engine ist dafür gut vorbereitet):

| Datei | Änderung |
| --- | --- |
| `packages/shared/src/types.ts` | `ResortState.match` (Modus, Runde, Bereitschaft, Verlauf) und `clockMs` |
| `engine/state.ts` | Defaults + Migration (alte Saves → `mode: "sandbox"`) |
| `protocol/intents.ts`, `engine/validate.ts` | Intents `start_match`, `end_round`; Bauen gesperrt bei `finished` |
| neu `engine/round.ts` | `resolveRound()`: tickt deterministisch eine Woche, erzeugt `RoundReport`, Endwertung |
| `engine/apply.ts`, `runtime/room.ts` | `state.clockMs` statt `Date.now()` für Bauzeiten; Runde auflösen, wenn alle bereit |
| `packages/config/src/economy.ts` | `MATCH`-Presets; `daysPerYear` kürzer |
| `store.ts`, `GameHUD.tsx` | Knopf „Runde beenden (1/2 bereit)“, Wochenbericht-Sheet, Endbildschirm |

Reihenfolge: zuerst Balancing (Punkt 1–4 oben), sonst bleibt Parkhaus-Spam auch in Partien
die Lösung. Danach Partie-Modus, danach Ereigniskarten.

## Design: vom Prototyp zum Spiel

Aus Screenshots (Desktop 1440 px, iPhone 14):

**Was schon gut ist:** Startbild mit Matterhorn, klare Farbpalette, runde Karten, Lippen-Buttons,
Mobile-Bottom-Bar mit grossem „Bauen“.

**Die grössten Hebel:**

1. **Die Welt ist zu flach und grau.** Von oben wirkt das Gelände wie eine graue Fläche mit
   schwarzen Punkten. Vorschläge: Standard-Kamera schräg (ca. 50–55°) statt Draufsicht,
   stärkeres Hillshading mit warmem Sonnenlicht und blauen Schatten, Ambient Occlusion in
   Mulden, Bäume als Gruppen mit hellerer Spitze, Felsen grau-braun statt fast schwarz,
   Horizont mit Matterhorn als Skybox-Silhouette. Tageszeit sichtbar machen (Morgenrot,
   Abendlicht) – die Simulation hat `timeOfDay` schon.
2. **Zu viele Panels gleichzeitig (Desktop).** Links Bau-Menü + Liste + Schnellwahl, rechts
   fünf gestapelte Karten, unten zwei Leisten → über 40 % der Fläche verdeckt. Vorschlag:
   eine schlanke Top-Bar (Geld, Gäste/h, Zufriedenheit, Woche/Saison), eine Dock-Leiste
   unten wie auf dem Handy, alles andere als ein- und ausklappbares Sheet. Karte immer
   im Zentrum.
3. **Entwickler-Sprache raus.** „Intents gehen an den Server. Skifahrer sind nur
   Visualisierung.“, „Autoritative Simulation“ usw. gehören nicht ins Spiel. Texte
   aus Spielersicht schreiben („Michael hat eine Gondel gebaut“).
4. **Echte Umlaute und einheitliche Zahlen.** Katalog und Hinweise nutzen „Gaeste“,
   „Baeume“, „fuer“. Zahlen mischen `85.0K`, `4'500` und `1.800`. Einheitlich Schweizer
   Format (`85'000 CHF`, `1'800 P/h`), Kurzform nur in der Top-Bar (`85k`).
5. **Bauobjekte unterscheidbar machen.** Alle Lifte haben dasselbe Icon; gesperrte Stufen
   (Lv 9, Lv 12) sehen aus wie kaufbare. Eigene Illustrationen/Icons pro Typ, gesperrt =
   entsättigt mit Schloss, „zu teuer“ = Preis orange (steht so schon in den Tokens).
6. **Belohnung sichtbar machen.** Beim Fertigstellen einer Bahn: kurze Kamerafahrt,
   Konfetti/Schneeflocken, Münzen fliegen in die Top-Bar, Sound. Level-Up als eigener Moment.
   Wochenbericht im Partie-Modus als Karte mit Kennzahlen-Trend.
7. **Koop spürbar.** Farbiger Cursor/Ring der Partnerin auf der Karte (Fokus existiert),
   Avatare oben, „Johanna baut gerade …“, gemeinsames Ziel-Banner.
8. **Handy:** Tutorial-Karte und Warnbanner verdecken die untere Hälfte und den Dorfnamen.
   Tutorial als kleine Sprechblase am Objekt, Warnung als Badge an der Statistik-Taste.
9. **Name & Marke vereinheitlichen.** Repo heisst *ski-alpina*, Spiel *Ski Builder*,
   Untertitel *Baue dein Traum-Skigebiet* bzw. *Wallis · Zermatt*. Einen Namen wählen
   (z. B. „Alpina“) und App-Icon, Titel, Manifest anpassen.

Technisch: Produktion läuft über `vite preview` mit Nitro-Preset `vercel`. Funktioniert,
ist aber ein Umweg. Mittelfristig Preset `node-server` und ein schlanker Laufzeit-Container
ohne Dev-Abhängigkeiten (Image heute > 1 GB).

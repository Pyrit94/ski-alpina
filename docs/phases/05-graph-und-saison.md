# Phase 05 — Echter Fluss-Graph, Wirtschaft, Saison

**Status:** umgesetzt

## Fluss-Graph

Die Phase-03-Simulation war keine Flusssimulation: `tickFlow` teilte die Nachfrage
gleichmaessig auf alle Lifte und den Durchsatz gleichmaessig auf alle Pisten. Ein
Lift im Nirgendwo brachte genau so viel wie einer am Dorf, damit war Spamming die
optimale Strategie und das Layout mechanisch bedeutungslos.

- Knoten = Stationen, Pistenenden und Ankunftsorte, geclustert ueber `FLOW.linkRadius`
- Kanten = Lifte, Pisten und Strassen mit Kapazitaet aus `packages/config`
- Nachfrage entsteht dort, wo Gaeste ankommen: Dorf, Parkhaus, Busbahnhof, Hotel
- Routing per Max-Flow (Dinic) in `engine/maxflow.ts`
- Zwei Ebenen (`ground`/`ski`): erst eine Liftfahrt macht aus einem Gast einen
  bedienten Gast, sonst wuerde ein Parkhaus direkt am Ausgang Phantom-Besucher buchen
- Abnahme: unverbundene Kapazitaet traegt niemanden; die engste Kante eines
  Rundlaufs bestimmt den Durchsatz (`engine/graph.test.ts`)

## Gelaende

`dem.slope` teilte die Hoehendifferenz durch `2*e*12` und nahm damit an, eine
Welteinheit sei ~12 m. Das Fenster spannt ~18.6 km ueber 196 Einheiten, also ~92 m.
Jede Neigung las sich rund achtmal zu steil: auf 4921 Hexen waren Berghuette, rote
Piste, Snowpark, Aussichtspunkt, Flutlicht und Beschneiung auf **null** Hexen
baubar, blaue Pisten auf vier. `maxSlope` sind echte Tangenten, jetzt auch der
Massstab (`TERRAIN.metresPerWorldUnit`).

## Wirtschaft

- Unterhalt pro Anlage und Betriebstag, faellig auch ohne Gaeste
- Ticketpreis als Zahlungsbereitschaftskurve mit innerem Optimum statt einer
  Regel, die erst ueber 90 CHF griff und 90 damit strikt optimal machte
- Zufriedenheit des letzten Ticks speist die Nachfrage: Schlangen kosten Gaeste
- Gastro und Retail sind Kapazitaetsgeschaefte, kein `max(1, n)`-Multiplikator
- Itemwirkungen liegen als Felder am Item (`seatsPerHour`, `upkeepCut`,
  `satisfactionBonus`, `summerDraw`), nicht als Typ-Konstante im Engine-Code

## Saison

- Jahr aus `SEASON`: Winter, Schneeschmelze, Sommerbetrieb
- Schneegrenze in Metern aus Jahreszeit, Wetter und Beschneiung
- Eine Abfahrt unter der Schneegrenze verliert ihren blanken Teil und schliesst
- Im Sommer traegt nur, was auch talwaerts faehrt; Museum und Spa holen etwas zurueck
- Wetter wird serverseitig und deterministisch pro Tag gewuerfelt
  (`engine/weather.ts`) — vorher war es reine Client-Deko und erreichte die Sim nie

## Progression

- Daueraufträge (`repeatable`) wachsen pro Abschluss weiter, statt zu enden
- Katalog reicht bis Level 16 statt bis 8: Funitel, Gletscherbahn, Resort-Hotel,
  Bergrestaurant XL, Betriebszentrale, Bahnen-Museum
- Spielstaende werden beim Eintritt in die Engine migriert (`migrateResort`)

## Offen

- Kein Abriss. Unterhalt ist deshalb bewusst mild gehalten und Muenzen sind bei 0
  abgefangen, sonst wuerde ein ueberbautes Gebiet den Spielstand blockieren.
- `validateIntent` prueft bei Pisten keine Hoehengrenzen, der Client via
  `validateHex` schon — Server und Client sind hier nicht deckungsgleich.
- Ein Jahr dauert bei `daysPerYear: 90` und `daySecondsReal: 90` rund 2¼ Stunden.
  Wer den Saisonzyklus in einer Sitzung sehen will, senkt `daysPerYear`.

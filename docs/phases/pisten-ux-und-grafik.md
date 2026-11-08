# Pisten-UX und realistischere Grafik

**Status:** PR A (Pistenbau einfach machen) und PR B (Grafik, erster Teil) umgesetzt

## Ausgangslage: die Verbindungsregel bis jetzt

Der Fluss-Graph (`packages/shared/src/engine/graph.ts`) kannte zwei Ebenen pro
Ort, `ground` (noch nichts gefahren) und `ski` (auf dem Berg). Ausgänge gab es nur
im **Dorf** und an **Türen** (Parkhaus, Bus, Hotel), und zwar nur in der Ebene
`ski`. Pisten waren eine einzige Kante von ihrem oberen zu ihrem unteren Ende;
verbunden wurde nur, was innerhalb von `FLOW.linkRadius` (2 Hexfelder) eines
**Endes** lag.

Daraus folgte für Spielerinnen und Spieler:

| Situation | bisher | gefühlt richtig |
| --- | --- | --- |
| Lift B, dessen Piste nur zur eigenen Talstation führt (erreicht über eine Piste von Lift A) | befördert niemanden | verbunden |
| Zweite Piste, die **mitten** in eine andere mündet | Sackgasse, befördert niemanden | verbunden |
| Piste, die von der Mitte einer anderen abzweigt | kommt niemand an | verbunden |
| Talstation im Tal, 3–9 Felder neben dem Dorf | braucht eine «Zufahrt» | zu Fuss / Skibus erreichbar |

Jede Bahn brauchte also eine eigene, exakt getroffene Abfahrt bis ins Dorf. Auf
dem Handy hiess das: von der Bergstation Feld für Feld bis auf zwei Hexfelder an
die Talstation tippen. Die rote Meldung «Diese Anlage befördert niemanden …»
erklärte nicht, was zu tun ist.

## Neue Regel (PR A)

**Lift rauf, Piste runter, fertig.**

- Eine Piste ist verbunden, wenn ihr Ende bei einer **Talstation (irgendeiner)**,
  im **Dorf**, bei einer **Tür** oder auf **einer anderen Piste** liegt – auch
  mitten auf ihr. Pisten dürfen sich treffen, verzweigen und zusammenlaufen.
- Ein Lift ist verbunden, sobald man von seiner Bergstation über Pisten (und
  andere Lifte) zu einer Talstation oder ins Dorf kommt. Nicht jeder Lift braucht
  eine eigene Abfahrt ins Dorf.
- Talstationen im Tal (≤ `FLOW.villageAccessRadius` Felder vom Dorf und höchstens
  `FLOW.villageAccessRise` m darüber) erreichen die Gäste ohne Strasse.

### Umsetzung im Graphen

- **Drei Ebenen** pro Ort: `ground` → (Lift) → `up` → (Piste) → `down`. Der Tag
  eines Gastes endet im Dorf, an einer Tür **oder an jeder Talstation**, aber nur
  in `down`: wer zählt, ist mindestens einmal hinaufgefahren und hinuntergefahren.
- **Verzweigungen**: `junctionsOn()` teilt eine Piste überall dort, wo eine
  Station, ein Pistenende oder eine Tür innerhalb des Link-Radius auf ihrer
  Strecke liegt. Jede Teilstrecke hat die volle Breite der Piste; unterhalb einer
  Einmündung teilen sich beide Ströme diese Breite.
- **Status ohne Verkehr**: `FlowNetwork.reach()` liest aus der Gestalt des Graphen
  (nicht aus dem Verkehr) für jeden Lift `ok | no-descent | no-access` und für
  jede Piste `ok | dead-end | unreached`. Das landet in `FlowEdgeViz.link` und wird
  im Client mit `resortLinks()` auch für Anlagen im Bau berechnet.
- **Runden**: Max-Flow beendet jeden Gast an der ersten erreichten Talstation und
  füllt eine Piste, bevor er die nächste anfasst. `addLaps()` lässt danach Gäste
  auf leeren, verbundenen Liften und Pisten Zusatzrunden fahren (Zyklen, Anteil
  `FLOW.lapShare`). Die Runden zeigen, **wo** Gäste sind (Karte, Auslastung,
  «leere Anlagen»). Einnahmen, Wartezeit und Engpass bleiben bei den Gästen, die
  hereinkommen – das Balancing ändert sich dadurch nicht.
- Die Schutzregeln bleiben: Kapazität ohne Zugang trägt niemanden, Lifte ohne
  Piste tragen niemanden (`graph.test.ts`, `flow.test.ts`).

### Bedienung

- **«Abfahrt anlegen»**: `suggestDescent()` sucht mit einer A*-Suche über alle
  Ziele zugleich (`routeToAny()`) von der Bergstation entlang dem Hang zum
  günstigsten Ziel – Talstation, Dorf, Tür oder eine Piste, die selbst weiterführt.
  Der Vorschlag öffnet den Pisteneditor bereits gezeichnet, mit Preis, Farbe und
  Höhenprofil. «Bauen» schickt ein normales `place_piste`; der Server prüft wie
  immer (`validatePistePath`). «Zurück» und Weiterzeichnen funktionieren wie bei
  jeder Piste.
- **Nach dem Liftbau** erscheint sofort das Angebot «… steht – noch keine
  Abfahrt» mit «Abfahrt anlegen».
- **Status-Chip** im Lift- und Pistenpanel («Verbunden ✓», «Noch keine Abfahrt»,
  «Kein Zugang», «Endet im Nichts», «Kein Lift oben») mit einem Satz Erklärung.
- **Auf der Karte**: gestrichelte Vorschau der fehlenden Abfahrt und ein Chip an
  der Bergstation, der die Abfahrt mit einem Tipp anlegt (eine Linie, ein
  Draw Call; höchstens sechs Chips).
- **Einrasten**: Pistenstart und -ende rasten auf Stationen, Dorf, Türen und
  **jede Stelle einer Piste** ein. Das Ziel leuchtet grün; offene Enden sind grau
  statt orange.
- **Zufahrt → Strasse**: heisst jetzt «Strasse», steht unter «Dienste» statt bei
  den Pisten und wird nur noch für Talstationen weit weg vom Dorf gebraucht. Die
  Engine behält `road` für alte Spielstände.
- **Tutorial** in drei Schritten: Lift rauf · Piste runter · Gäste fahren.
- Der Sessellift ist ab Level 1 baubar (`packages/config/src/items.ts`), damit
  der Abnahmeablauf in einem neuen Spiel funktioniert.

### Tests

`packages/shared/src/engine/descent.test.ts` spielt die Abnahme durch: neues
Spiel → Sessellift → `suggestDescent` → `place_piste` (über `validateIntent`) →
Lift «ok», Gäste fahren, keine leere Anlage; eine zweite Piste, die mitten in die
erste mündet, ist verbunden und wird befahren. `graph.test.ts` deckt Talstation
als Ziel, Zugang, Einmündung, Sackgasse und `junctionsOn` ab.

## Grafik (PR B) – Reihenfolge

Budget bleibt: < 150 Draw Calls, 40 fps auf einem Mittelklasse-Handy, mobil keine
Nachbearbeitung ausser optional FXAA. Vorhanden sind schon: ACES-Tonemapping,
Fels nach Neigung im Terrain-Shader, durchhängende Seile, instanzierte
Sessel/Gondeln/Bäume, adaptive Auflösung.

1. **Pisten als präparierter Schnee** statt farbiger Bänder: Ribbon mit
   Cord-Struktur im Shader (prozedural, keine Textur nötig), Schwierigkeit über
   **Markierungsstangen** (ein `InstancedMesh` für alle) und eine dezente Randlinie.
2. **Schnee**: Glitzern (Hash-Funkeln, nur `high`), Tiefschnee neben den Pisten
   rauer und etwas bläulicher; Makrovariation gegen Kachelmuster.
3. **Nadelbäume** in Varianten mit Schnee auf den Ästen, instanziert, mit
   einfacher Distanz-Stufe (Billboard-Kegel in der Ferne).
4. **Lifte**: glaubwürdigere Stationen (Dach, Umlenkrad).
5. **Himmel und Licht**: Verlauf, Höhendunst, Sonne je Wetter; ACES bleibt.
6. Alles über `quality.ts` steuerbar, `quality.test.ts` hält «mobil nie teurer».

Messung vorher/nachher (Draw Calls, Dreiecke, Bildrate im Headless-Browser)
kommt in den PR-Text; die Bildrate aus SwiftShader ist nur relativ aussagekräftig.

## Grafik (PR B) – umgesetzt

- **Pisten** (`canvas/piste-mesh.ts`): eine geglättete (Catmull-Rom),
  aufs Gelände gelegte Fläche pro Piste, rund doppelt so breit wie vorher,
  weisser Cord mit Spurbahnen der Pistenraupe, Randlinie in der Pistenfarbe und
  weicher Aussenrand. Feine Rippen nur auf `high` (`QUALITY.pisteRibs`). Strassen
  im selben Material als Asphalt mit gestrichelter Mittellinie. Alle Pisten in
  **einem** Draw Call.
- **Markierungsstangen** links und rechts im Wechsel, alle in einem
  `InstancedMesh` (`QUALITY.poles`, `poleSpacing`).
- **Wald**: zwei Baumarten (Fichte, schlanke Tanne), Schnee auf den Ästen nach
  einem Geometrie-Attribut und der Schneegrenze des Tages
  (`canvas/snow-shaders.ts`); Pisten und Liftlinien sind als **Schneisen**
  freigeschlagen.
- **Glitzern** im Schnee nahe der Kamera, nur `high`
  (`TERRAIN_DETAIL.high.glitter`).
- `quality.test.ts` prüft weiter, dass die Handy-Stufe nirgends teurer ist.

Gemessen im Headless-Chromium (SwiftShader, Bildrate nur relativ), Szene mit
einem Sessellift und drei Pisten:

| | Draw Calls vorher | nachher | Dreiecke vorher | nachher |
| --- | --- | --- | --- | --- |
| Desktop 1440×900 | 28 | 30 | 184 238 | 188 254 |
| Handy 390 px | 20 | 21 | 92 078 | 92 912 |

Noch offen aus dem Plan: glaubwürdigere Liftstationen, Himmelsverlauf je
Wetter und eine Distanz-Stufe für Bäume. Das Budget lässt dafür Luft.

## Risiken

- **Balancing**: Talstationen als Ausgang und Einmündungen lassen mehr Layouts
  Gäste tragen. Die Nachfrage hängt weiter an Pistenkilometern; Einnahmen kommen
  nur von Gästen, die hereinkommen. Die bestehenden Wirtschaftstests bleiben grün.
- **Leistung**: Mehr Knoten (drei Ebenen, Teilstrecken) und ein Runden-Durchgang
  pro Lift. Bei Spielgrössen von einigen Dutzend Anlagen ist das im Bereich von
  Millisekunden pro Tick; `resortLinks()` im Client rechnet nur bei Bauänderungen.
- **Vorschläge, die nicht gehen**: `routeToAny` hält dieselben Regeln ein wie der
  Server; wenn kein Hang passt, sagt der Knopf das und man zeichnet selbst.
- **Alte Spielstände**: `road` bleibt gültig, `FlowEdgeViz.link` ist optional.
- **Grafik auf dem Handy**: jede Massnahme bekommt eine `low`-Stufe; Draw Calls
  werden vor und nach gemessen.

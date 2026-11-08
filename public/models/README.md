# Modelle: Gebäude, Bahnen, Dorf, Wald, Verkehr, Deko

Hier liegen Modelle, die die eingebauten Gebäude ersetzen. Fehlt eine Datei,
bleibt das eingebaute Modell. So lässt sich Gebäude für Gebäude umstellen.

## Am einfachsten: das Import-Werkzeug

```bash
npm run modelle -- ordner-mit-glb-dateien
```

Die Dateien heissen wie das, was sie ersetzen (`hotel1.glb`, `hotel1-3.glb` für
Ausbaustufe 3, `station-chair.glb`, `house-2.glb`, `tree-spruce.glb`, … — alle
Namen in der Liste unten). Das Werkzeug fügt die Teile zusammen, reduziert auf
etwa 2500 Dreiecke (`--dreiecke 1500` für weniger; Bäume, Figuren und Deko
automatisch auf ihr kleineres Budget), färbt Modelle ohne Farbe nach Dach, Wand
und Sockel ein, legt sie hier ab und trägt sie in `manifest.json` ein.

Namen aus der Liste bleiben ganz: `house-3.glb` ist das dritte Dorfhaus, nicht
`house` in Ausbaustufe 3. Eine Endung `-2`…`-4` ist sonst immer eine Ausbaustufe.

## Alle Dateinamen

Fehlt eine Datei, bleibt das eingebaute Modell (oder, wo angegeben, die nächste
Datei der Kette). Grösse: so breit (bzw. so hoch) wird das Modell im Spiel
gezeichnet, in Welteinheiten (ein Hexfeld ≈ 2.1). Vorderseite immer nach **+z**.

| Datei | Was | Ersatz, wenn sie fehlt | Grösse | Dreiecke |
| --- | --- | --- | --- | --- |
| `<item-id>.glb`, `<item-id>-2..4.glb` | Gebäude aus dem Katalog (`restaurant`, `hut`, `hotel1`, `hotel3`, `hotel5`, `hotel-resort`, `shop`, `skischool`, `ticket`, `apres`, `spa`, `parking`, `bus`, `snowmaker`, `gastro-hall`, …) und ihre Ausbaustufen | tiefere Stufe, sonst eingebaut | Breite 2.1 | 1500–3000 |
| `station-tbar.glb`, `station-chair.glb`, `station-gondola.glb`, `station-tram.glb`, `station-funitel.glb`, `station-glacier.glb`, `station-cog.glb` | Tal- und Bergstation je Bahntyp (Seil läuft auf +z hinaus, Seilhöhe 1.6) | `station` → eingebaut | Breite 2.4 (Zahnrad 1.8) | 1500–2500 |
| `station.glb` | Station aller Bahnen ohne eigene | eingebaut | Breite 2.4 | 1500–2500 |
| `station-mid.glb` | Mittelstation | `station-<typ>` → `station` → eingebaut | Breite 2.4 | 1500–2500 |
| `pylon.glb` | Liftmast, auf seine Höhe skaliert | eingebaut | Höhe 3.4 | 300–600 |
| `carrier-chair.glb` | Sessel | eingebaut | Breite 0.65 | 300–800 |
| `carrier-cabin.glb` | Gondelkabine (Gondel, Funitel, Gletscher) | eingebaut | Breite 0.5 | 300–800 |
| `carrier-tram.glb` | Kabine der Pendelbahn | `carrier-cabin` → eingebaut | Breite 0.8 | 300–800 |
| `carrier-tbar.glb` | Schleppbügel | eingebaut | Breite 0.45 | 300–800 |
| `carrier-train.glb` | Wagen der Zahnradbahn | eingebaut | Breite 1.25 | 300–800 |
| `house-1.glb` … `house-6.glb` | Dorfhäuser; jedes Haus bekommt fest eine der vorhandenen Varianten | eingebautes Chalet | Breite 1.1 (× 0.8–2 je Haus) | 600–1500 |
| `church.glb` | Dorfkirche, einmal nahe der Dorfmitte | ein Dorfhaus | Breite 1.8 | 800–1500 |
| `tree-spruce.glb` | Fichte (die meisten Waldstücke) | eingebaut | Höhe 1.75 | ≤ 150 |
| `tree-larch.glb` | Lärche (jedes dritte Waldstück) | eingebaute Tanne | Höhe 1.75 | ≤ 150 |
| `skier.glb` | Skifahrer auf den Pisten | eingebaut | Höhe 0.42 | ≤ 200 |
| `snowboarder.glb` | jede fünfte Figur | `skier` | Höhe 0.42 | ≤ 200 |
| `car.glb` | Auto auf der Talstrasse | eingebaut | Länge 0.7 | 300–800 |
| `coach.glb` | jedes vierte Fahrzeug ein Reisebus | Auto | Länge 1.3 | 300–800 |
| `groomer-vehicle.glb` | Pistenfahrzeuge, abends und nachts auf den längsten Pisten | keine | Länge 0.9 | 500–1000 |
| `bench.glb` | Bank auf den Terrassen von Restaurant, Hütte, Après-Ski | keine | Breite 0.45 | ≤ 200 |
| `parasol.glb` | Sonnenschirm auf denselben Terrassen | keine | Höhe 0.8 | ≤ 200 |
| `flag.glb` | Fahne neben jeder Station | keine | Höhe 1.4 | ≤ 200 |
| `sign.glb` | Pistenschild am Start jeder Piste | keine | Höhe 0.6 | ≤ 200 |

Alles wird pro Modell als Instanzen gezeichnet (ein Draw Call pro Datei, plus
Schatten), Deko mit einer festen Obergrenze pro Art.

**Animation**: Knoten mit den Namen `anim_spin_*` (dreht sich um die eigene
Y-Achse) und `anim_flag*` (weht) werden **noch nicht** bewegt. Beim
Zusammenfassen zu Instanzen gehen die Knoten verloren; die Teile werden fest
mitgezeichnet. Die Namen trotzdem so vergeben: dann laufen sie, sobald es
unterstützt wird.

Ausprobieren vorher: im Spiel `/werkbank` öffnen, die Datei hineinziehen, Grösse
und Drehung einstellen und die Zeile fürs Manifest kopieren.

## So kommt ein Modell ins Spiel (von Hand)

1. Datei als **glTF binär (`.glb`)** hier ablegen, z. B. `hotel1.glb`.
2. In `manifest.json` eintragen:

```json
{
  "hotel1": { "file": "hotel1.glb" },
  "parking": { "file": "parking.glb", "levels": { "3": "parking-3.glb" } },
  "restaurant": { "file": "restaurant.glb", "footprint": 2.2, "yaw": 90 }
}
```

- Schlüssel ist die Item-ID aus `packages/config/src/items.ts` oder ein Name
  aus der Liste oben (ohne `.glb`), z. B. `station-mid`, `house-4`, `car`.
- Ist für eine Ausbaustufe keine eigene Datei da, wird das Modell der tieferen
  Stufe pro Stufe etwas breiter und höher gezeichnet.
- Item-IDs:
  (`restaurant`, `hut`, `hotel1`, `hotel3`, `hotel5`, `hotel-resort`, `shop`,
  `skischool`, `ticket`, `apres`, `spa`, `parking`, `bus`, `snowmaker`, …).
- `levels`: eigene Modelle für Ausbaustufen 2–4. Ohne Eintrag gilt das
  Modell der nächsttieferen Stufe.
- `footprint`: Breite in Welteinheiten (ein Hexfeld ≈ 2.1). Das Modell wird
  automatisch zentriert, auf den Boden gestellt und auf diese Breite skaliert
  (bei Namen, die in der Liste oben nach «Höhe» gehen, auf diese Höhe).
- `yaw`: Drehung in Grad, falls das Modell in die falsche Richtung schaut.

## Was ein Modell mitbringen sollte

- **Low-Poly**: bis etwa 3000 Dreiecke pro Gebäude, weniger für alles, was oft
  vorkommt (Budgets in der Liste oben; Handy, < 150 Draw Calls).
- **Farbe** als Materialfarbe, Vertex-Farbe oder **Paletten-Textur**
  (eine kleine Textur mit Farbfeldern, wie bei Kenney oder Quaternius).
  Fotorealistische Texturen gehen beim Zusammenfassen verloren: Pro Ecke wird
  eine Farbe übernommen.
- Leuchtende Fenster: Material mit Emission (> 0.4) wird als Licht übernommen.
- Alle Gebäude werden mit einer gemeinsamen Palette und weicher
  Cel-Beleuchtung gezeichnet, damit Modelle aus verschiedenen Quellen
  zusammenpassen.

## Woher

- **Fertige Pakete, frei (CC0)**: Kenney (kenney.nl, z. B. «City Kit»,
  «Holiday Kit», «Nature Kit»), Quaternius (quaternius.com). Ohne
  Namensnennung nutzbar.
- **KI aus Bild oder Text**: Meshy, Tripo, Rodin (Hyper3D) oder Hunyuan3D.
  Am besten zuerst ein Konzeptbild im gewünschten Stil erzeugen (z. B. mit
  Gemini oder Grok), dann daraus das 3D-Modell. Danach in Blender auf
  Low-Poly reduzieren und als `.glb` exportieren. Lizenz des Dienstes prüfen
  (bei Gratis-Stufen oft nur mit Namensnennung).

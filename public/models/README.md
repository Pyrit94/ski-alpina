# Gebäude-Modelle

Hier liegen Modelle, die die eingebauten Gebäude ersetzen. Fehlt eine Datei,
bleibt das eingebaute Modell. So lässt sich Gebäude für Gebäude umstellen.

## So kommt ein Modell ins Spiel

1. Datei als **glTF binär (`.glb`)** hier ablegen, z. B. `hotel1.glb`.
2. In `manifest.json` eintragen:

```json
{
  "hotel1": { "file": "hotel1.glb" },
  "parking": { "file": "parking.glb", "levels": { "3": "parking-3.glb" } },
  "restaurant": { "file": "restaurant.glb", "footprint": 2.2, "yaw": 90 }
}
```

- Schlüssel ist die Item-ID aus `packages/config/src/items.ts`
  (`restaurant`, `hut`, `hotel1`, `hotel3`, `hotel5`, `hotel-resort`, `shop`,
  `skischool`, `ticket`, `apres`, `spa`, `parking`, `bus`, `snowmaker`, …).
- `levels`: eigene Modelle für Ausbaustufen 2–4. Ohne Eintrag gilt das
  Modell der nächsttieferen Stufe.
- `footprint`: Breite in Welteinheiten (ein Hexfeld ≈ 2.1). Das Modell wird
  automatisch zentriert, auf den Boden gestellt und auf diese Breite skaliert.
- `yaw`: Drehung in Grad, falls das Modell in die falsche Richtung schaut.

## Was ein Modell mitbringen sollte

- **Low-Poly**: bis etwa 3000 Dreiecke pro Gebäude (Handy, < 150 Draw Calls).
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

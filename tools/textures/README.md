# Grafiken laden (Windows, PowerShell)

`Get-Textures.ps1` lädt freie Grafiken (Lizenz **CC0**, also ohne Bedingungen nutzbar) ins Repo:

| Was | Woher | Wohin |
| --- | --- | --- |
| Gelände-Texturen: Schnee, Fels, Waldboden (Farbe + Normal-Map, 1K) | [Poly Haven](https://polyhaven.com), Ausweichquelle [ambientCG](https://ambientcg.com) | `public/textures/pbr/` |
| Fotos für die Baukarten (Sessellift, Hotel, Pistenraupe …) | [Openverse](https://openverse.org), nur CC0 | `public/textures/cards/` |

Das Spiel findet die Dateien über `manifest.json` von selbst. Fehlt etwas, nimmt es die eingebaute Darstellung.

## Schritt für Schritt

1. **PowerShell im Repo öffnen.** Im Explorer den Ordner `ski-alpina` öffnen, in die Adresszeile `powershell` tippen, Enter.
2. **Neuesten Stand holen:**

   ```powershell
   git pull
   ```

3. **Skript starten** (die Ausführungsrichtlinie gilt nur für diesen einen Aufruf):

   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\textures\Get-Textures.ps1 -Preview
   ```

   Dauert ein bis drei Minuten. Jede Zeile meldet `[ok]`, `[--]` (schon vorhanden) oder `[!!]` (nicht geklappt, wird übersprungen). Am Ende öffnet sich eine Vorschau mit allen Bildern im Browser.

4. **Fotos prüfen.** Die Suche ist automatisch – ein Foto kann daneben liegen. Für ein unpassendes Foto das nächste Suchergebnis nehmen:

   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\textures\Get-Textures.ps1 -Replace chair,hotel1 -Preview
   ```

   Oder das Foto einfach löschen (z. B. `public\textures\cards\chair.jpg`) und die Liste neu schreiben – dann zeigt das Spiel dort wieder das Symbol:

   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\textures\Get-Textures.ps1 -ManifestOnly
   ```

5. **Lokal ansehen** (optional): `npm run dev`, dann <http://localhost:8080>.
6. **Hochladen** – Coolify deployt danach von selbst:

   ```powershell
   git add public/textures
   git commit -m "Grafiken (CC0) ergänzt"
   git push
   ```

## Optionen

| Option | Wirkung |
| --- | --- |
| `-Preview` | Vorschau-Seite im Browser öffnen |
| `-Only snow,rock` | Nur diese Einträge (Gelände: `snow`, `rock`, `ground`; Baukarten: Objekt-Ids wie `chair`, `gondola`, `hotel1`) |
| `-Replace chair` | Für diese Baukarten das nächste Suchergebnis nehmen |
| `-SkipTerrain` / `-SkipCards` | Einen der beiden Teile auslassen |
| `-Force` | Alles neu laden, auch was schon da ist |
| `-ManifestOnly` | Nichts laden, nur die Listen aus den vorhandenen Dateien neu schreiben |
| `-Resolution 2k` | Gelände in 2K statt 1K (schärfer, aber grösser – 1K reicht) |
| `-DelayMs 3000` | Mehr Pause zwischen Anfragen, falls Openverse «zu viele Anfragen» meldet |

Die Suchbegriffe für die Baukarten stehen oben im Skript (`$CardQueries`) und lassen sich anpassen.

## Wenn etwas nicht klappt

- **«Die Ausführung von Skripts ist auf diesem System deaktiviert»:** den Aufruf genau wie oben mit `-ExecutionPolicy Bypass` verwenden.
- **Viele `[!!]` bei den Baukarten:** Openverse begrenzt anonyme Anfragen. Später nochmals starten – fertige Fotos werden übersprungen – oder `-DelayMs 3000`.
- **Ein Gelände-Eintrag fehlt:** Poly Haven hat das Asset umbenannt. Das Skript sucht dann selbst im Katalog und weicht auf ambientCG aus; klappt beides nicht, bleibt die eingebaute Darstellung.
- **Ruckelt das Spiel danach auf einem Gerät:** im Spielmenü «Fotostrukturen: Aus».

Herkunft und Urheber:innen jeder Datei stehen danach in `public/textures/LICENSES.md`.

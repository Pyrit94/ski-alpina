<#
.SYNOPSIS
  Lädt freie Grafiken (CC0) für Ski Alpina herunter: Gelände-Texturen und Fotos für die Baukarten.

.DESCRIPTION
  Gelände (Schnee, Fels, Waldboden):
    Poly Haven (polyhaven.com), Ausweichquelle ambientCG (ambientcg.com). Beide CC0.
    Pro Oberfläche eine Farb- und eine Normal-Map in 1K. Ziel: public/textures/pbr/

  Baukarten (ein Foto pro Bauobjekt, z. B. Sessellift, Hotel, Pistenraupe):
    Openverse (openverse.org), nur Bilder mit Lizenz CC0. Ziel: public/textures/cards/

  Das Spiel liest public/textures/pbr/manifest.json und public/textures/cards/manifest.json.
  Fehlt eine Datei, nimmt es die eingebaute Darstellung. Nichts geht kaputt, wenn ein
  Download scheitert.

  Funktioniert mit Windows PowerShell 5.1 und PowerShell 7.

.PARAMETER Only
  Nur diese Einträge laden, z. B. -Only snow,rock oder -Only chair,gondola.

.PARAMETER Replace
  Für diese Baukarten ein anderes Foto wählen (das nächste Suchergebnis), z. B. -Replace tbar,hotel1.

.PARAMETER SkipTerrain
  Keine Gelände-Texturen laden.

.PARAMETER SkipCards
  Keine Fotos für die Baukarten laden.

.PARAMETER Force
  Vorhandene Dateien neu laden.

.PARAMETER ManifestOnly
  Nichts herunterladen, nur die Manifeste aus den vorhandenen Dateien neu schreiben
  (z. B. nachdem du ein unpassendes Foto gelöscht hast).

.PARAMETER Preview
  Am Ende eine Vorschau-Seite mit allen Bildern im Browser öffnen.

.EXAMPLE
  cd C:\Projects\Privat\ski-alpina
  powershell -ExecutionPolicy Bypass -File tools\textures\Get-Textures.ps1 -Preview

.EXAMPLE
  # Ein Foto gefällt nicht: nächstes Suchergebnis nehmen
  powershell -ExecutionPolicy Bypass -File tools\textures\Get-Textures.ps1 -Replace chair -Preview
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [ValidateSet('1k', '2k')]
  [string]$Resolution = '1k',
  [string[]]$Only = @(),
  [string[]]$Replace = @(),
  [switch]$SkipTerrain,
  [switch]$SkipCards,
  [switch]$Force,
  [switch]$ManifestOnly,
  [switch]$Preview,
  [int]$DelayMs = 1500,
  # Für Tests überschreibbar. Im Normalfall nicht anfassen.
  [string]$PolyHavenApi = 'https://api.polyhaven.com',
  [string]$AmbientCgApi = 'https://ambientcg.com/api/v2',
  [string]$OpenverseApi = 'https://api.openverse.org/v1'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # macht Invoke-WebRequest in PS 5.1 viel schneller
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

$UserAgent = 'SkiAlpina-Grafiken/1.0 (+https://github.com/Pyrit94/ski-alpina)'

# Mit "powershell -File" kommt "-Only snow,rock" als ein einziger Text an, nicht als Liste.
$Only = @($Only | ForEach-Object { $_ -split '[,;\s]+' } | Where-Object { $_ })
$Replace = @($Replace | ForEach-Object { $_ -split '[,;\s]+' } | Where-Object { $_ })

if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path ([IO.Path]::Combine($PSScriptRoot, '..', '..'))).Path
}
if (-not (Test-Path (Join-Path $RepoRoot 'package.json'))) {
  throw "Repo nicht gefunden unter '$RepoRoot'. Starte das Skript im Ordner ski-alpina oder gib -RepoRoot an."
}
$PbrDir = [IO.Path]::Combine($RepoRoot, 'public', 'textures', 'pbr')
$CardDir = [IO.Path]::Combine($RepoRoot, 'public', 'textures', 'cards')
$TempDir = Join-Path ([IO.Path]::GetTempPath()) ('ski-alpina-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $PbrDir, $CardDir, $TempDir | Out-Null

# ---------------------------------------------------------------------------
# Was geladen wird
# ---------------------------------------------------------------------------

# Gelände: bevorzugte Poly-Haven-Assets, Suchwörter für den Katalog, ambientCG als Ausweichquelle.
$TerrainSlots = @(
  @{ Slot = 'snow';   PolyHaven = @('snow_02', 'snow_03', 'snow_field_aerial'); Keywords = @('snow');
     AmbientCg = @('Snow006', 'Snow004', 'Snow010'); AmbientQuery = 'snow' },
  @{ Slot = 'rock';   PolyHaven = @('aerial_rocks_02', 'rock_face', 'rocky_terrain_02'); Keywords = @('rock', 'cliff', 'rocks');
     AmbientCg = @('Rock030', 'Rock035', 'Rock023'); AmbientQuery = 'rock' },
  @{ Slot = 'ground'; PolyHaven = @('forest_ground_04', 'forrest_ground_01', 'brown_mud_leaves_01'); Keywords = @('forest', 'ground', 'grass');
     AmbientCg = @('Ground037', 'Ground054', 'Ground048'); AmbientQuery = 'forest ground' }
)

# Baukarten: Objekt-Id im Spiel -> Suchbegriff (englisch, das findet mehr).
$CardQueries = [ordered]@{
  'tbar'            = 't-bar ski lift'
  'chair'           = 'chairlift ski'
  'gondola'         = 'gondola lift ski resort'
  'tram'            = 'aerial tramway mountain'
  'funitel'         = 'cable car snow mountain'
  'glacier'         = 'glacier cable car'
  'restaurant'      = 'mountain restaurant ski'
  'hut'             = 'alpine hut snow'
  'hotel1'          = 'mountain hotel snow'
  'hotel3'          = 'alpine hotel winter'
  'hotel5'          = 'luxury hotel alps winter'
  'hotel-resort'    = 'ski resort hotel'
  'gastro-hall'     = 'mountain restaurant terrace'
  'shop'            = 'ski rental shop'
  'skischool'       = 'ski school children'
  'ticket'          = 'ski lift ticket office'
  'apres'           = 'apres ski'
  'spa'             = 'spa mountains winter'
  'piste'           = 'groomed ski slope'
  'snowpark'        = 'snowboard terrain park'
  'road'            = 'mountain road winter'
  'tree'            = 'swiss stone pine snow'
  'rock'            = 'boulder mountain'
  'viewpoint'       = 'matterhorn view'
  'lights'          = 'night skiing'
  'snowmaker'       = 'snow cannon'
  'groomer'         = 'snow groomer'
  'workshop'        = 'cable car maintenance'
  'depot'           = 'cable car station'
  'parking'         = 'parking garage'
  'clinic'          = 'mountain rescue'
  'bus'             = 'postbus switzerland'
  'cablecar-museum' = 'historic cable car'
}

# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

function Get-Prop($Object, [string]$Name) {
  if ($null -eq $Object) { return $null }
  if ($Object -is [System.Collections.IDictionary]) {
    if ($Object.Contains($Name)) { return $Object[$Name] }
    return $null
  }
  $p = $Object.PSObject.Properties[$Name]
  if ($null -ne $p) { return $p.Value }
  return $null
}

function Get-Path($Object, [string[]]$Names) {
  $cur = $Object
  foreach ($n in $Names) {
    $cur = Get-Prop $cur $n
    if ($null -eq $cur) { return $null }
  }
  return $cur
}

function Wait-Polite { if ($DelayMs -gt 0) { Start-Sleep -Milliseconds $DelayMs } }

function Get-Json([string]$Url) {
  Write-Verbose "GET $Url"
  return Invoke-RestMethod -Uri $Url -UserAgent $UserAgent -TimeoutSec 60
}

function Test-ImageFile([string]$Path) {
  if (-not (Test-Path $Path)) { return $false }
  $info = Get-Item $Path
  if ($info.Length -lt 2048) { return $false }
  $bytes = New-Object byte[] 4
  $fs = [IO.File]::OpenRead($Path)
  try { [void]$fs.Read($bytes, 0, 4) } finally { $fs.Dispose() }
  $jpeg = ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8 -and $bytes[2] -eq 0xFF)
  $png = ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and $bytes[2] -eq 0x4E -and $bytes[3] -eq 0x47)
  return ($jpeg -or $png)
}

function Save-Download([string]$Url, [string]$Path) {
  Write-Verbose "DL  $Url"
  $tmp = "$Path.part"
  Invoke-WebRequest -Uri $Url -OutFile $tmp -UserAgent $UserAgent -UseBasicParsing -TimeoutSec 180 | Out-Null
  Move-Item -Force $tmp $Path
}

function Save-Image([string]$Url, [string]$Path) {
  Save-Download $Url $Path
  if (-not (Test-ImageFile $Path)) {
    Remove-Item -Force -ErrorAction SilentlyContinue $Path
    throw "Keine gültige Bilddatei: $Url"
  }
}

function Write-Ok([string]$Text) { Write-Host "  [ok]   $Text" -ForegroundColor Green }
function Write-Skip([string]$Text) { Write-Host "  [--]   $Text" -ForegroundColor DarkGray }
function Write-Warn2([string]$Text) { Write-Host "  [!!]   $Text" -ForegroundColor Yellow }

function Read-Manifest([string]$Path) {
  if (-not (Test-Path $Path)) { return @{} }
  try {
    $raw = Get-Content -Raw -Encoding UTF8 $Path | ConvertFrom-Json
    $map = @{}
    $entries = Get-Prop $raw 'entries'
    if ($null -ne $entries) {
      foreach ($p in $entries.PSObject.Properties) { $map[$p.Name] = $p.Value }
    }
    return $map
  } catch {
    Write-Warn2 "Manifest $Path nicht lesbar, wird neu geschrieben."
    return @{}
  }
}

function Write-Utf8([string]$Path, [string]$Text) {
  # Ohne BOM, damit der Browser das JSON sicher liest (PS 5.1 schreibt sonst mit BOM).
  $enc = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path, $Text, $enc)
}

function Write-Manifest([string]$Path, [hashtable]$Entries, [string]$Kind) {
  $ordered = [ordered]@{}
  foreach ($k in ($Entries.Keys | Sort-Object)) { $ordered[$k] = $Entries[$k] }
  $doc = [ordered]@{
    version   = 1
    kind      = $Kind
    generated = (Get-Date).ToString('yyyy-MM-dd')
    entries   = $ordered
  }
  Write-Utf8 $Path ($doc | ConvertTo-Json -Depth 6)
}

function Want([string]$Name) {
  if ($Only.Count -eq 0) { return $true }
  return ($Only -contains $Name)
}

# ---------------------------------------------------------------------------
# Gelände: Poly Haven
# ---------------------------------------------------------------------------

$script:PolyCatalog = $null

function Get-PolyHavenMaps([string]$AssetId) {
  try { $files = Get-Json "$PolyHavenApi/files/$AssetId" } catch { return $null }
  $color = Get-Path $files @('Diffuse', $Resolution, 'jpg', 'url')
  $normal = Get-Path $files @('nor_gl', $Resolution, 'jpg', 'url')
  if (-not $color) { return $null }
  return @{ Id = $AssetId; Color = $color; Normal = $normal }
}

function Find-PolyHaven([hashtable]$Slot) {
  foreach ($id in $Slot.PolyHaven) {
    $maps = Get-PolyHavenMaps $id
    if ($maps) { return $maps }
    Wait-Polite
  }
  # Bevorzugte Assets nicht (mehr) vorhanden: im Katalog nach Stichwort suchen.
  if ($null -eq $script:PolyCatalog) {
    try { $script:PolyCatalog = Get-Json "$PolyHavenApi/assets?t=textures" } catch { $script:PolyCatalog = $false }
  }
  if (-not $script:PolyCatalog) { return $null }
  $candidates = @()
  foreach ($p in $script:PolyCatalog.PSObject.Properties) {
    $a = $p.Value
    $words = @()
    $words += @(Get-Prop $a 'categories')
    $words += @(Get-Prop $a 'tags')
    $hit = $false
    foreach ($k in $Slot.Keywords) { if ($words -contains $k) { $hit = $true } }
    if ($hit) {
      $count = Get-Prop $a 'download_count'
      if ($null -eq $count) { $count = 0 }
      $candidates += [pscustomobject]@{ Id = $p.Name; Count = [int64]$count }
    }
  }
  foreach ($c in ($candidates | Sort-Object Count -Descending | Select-Object -First 5)) {
    $maps = Get-PolyHavenMaps $c.Id
    if ($maps) { return $maps }
    Wait-Polite
  }
  return $null
}

# ---------------------------------------------------------------------------
# Gelände: ambientCG (Ausweichquelle)
# ---------------------------------------------------------------------------

function Get-AmbientZipLink($Asset) {
  $downloads = Get-Path $Asset @('downloadFolders', 'default', 'downloadFiletypeCategories', 'zip', 'downloads')
  if ($null -eq $downloads) { return $null }
  $want = ($Resolution.ToUpper()) + '-JPG'
  foreach ($d in @($downloads)) {
    if ((Get-Prop $d 'attribute') -eq $want) { return (Get-Prop $d 'downloadLink') }
  }
  return $null
}

function Find-AmbientCg([hashtable]$Slot) {
  $assets = @()
  foreach ($id in $Slot.AmbientCg) {
    try {
      $r = Get-Json "$AmbientCgApi/full_json?id=$id&include=downloadData"
      $assets += @(Get-Prop $r 'foundAssets')
    } catch { }
    Wait-Polite
  }
  if ($assets.Count -eq 0) {
    try {
      $q = [uri]::EscapeDataString($Slot.AmbientQuery)
      $r = Get-Json "$AmbientCgApi/full_json?type=Material&q=$q&include=downloadData&sort=Popular&limit=5"
      $assets += @(Get-Prop $r 'foundAssets')
    } catch { }
  }
  foreach ($a in $assets) {
    if ($null -eq $a) { continue }
    $link = Get-AmbientZipLink $a
    if ($link) { return @{ Id = (Get-Prop $a 'assetId'); Zip = $link } }
  }
  return $null
}

function Expand-AmbientMaps([hashtable]$Found, [string]$Slot) {
  $zip = Join-Path $TempDir "$Slot.zip"
  $out = Join-Path $TempDir $Slot
  Save-Download $Found.Zip $zip
  Expand-Archive -Force -Path $zip -DestinationPath $out
  $color = Get-ChildItem -Recurse -Path $out -Filter '*_Color.jpg' | Select-Object -First 1
  $normal = Get-ChildItem -Recurse -Path $out -Filter '*_NormalGL.jpg' | Select-Object -First 1
  if (-not $color) { throw "Im Archiv von $($Found.Id) fehlt die Farb-Map." }
  return @{ Color = $color.FullName; Normal = $(if ($normal) { $normal.FullName } else { $null }) }
}

# ---------------------------------------------------------------------------
# Ablauf
# ---------------------------------------------------------------------------

$pbrManifestPath = Join-Path $PbrDir 'manifest.json'
$cardManifestPath = Join-Path $CardDir 'manifest.json'
$pbrEntries = Read-Manifest $pbrManifestPath
$cardEntries = Read-Manifest $cardManifestPath
$failed = @()

Write-Host ''
Write-Host 'Ski Alpina – Grafiken laden' -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"
Write-Host ''

if (-not $SkipTerrain -and -not $ManifestOnly) {
  Write-Host 'Gelände-Texturen (CC0)' -ForegroundColor Cyan
  foreach ($slot in $TerrainSlots) {
    $name = $slot.Slot
    if (-not (Want $name)) { continue }
    $colorPath = Join-Path $PbrDir "${name}_color.jpg"
    $normalPath = Join-Path $PbrDir "${name}_normal.jpg"
    if ((Test-ImageFile $colorPath) -and -not $Force) { Write-Skip "$name ist schon da (-Force lädt neu)"; continue }
    try {
      $ph = Find-PolyHaven $slot
      if ($ph) {
        Save-Image $ph.Color $colorPath
        if ($ph.Normal) { Save-Image $ph.Normal $normalPath }
        $pbrEntries[$name] = [ordered]@{
          color   = "${name}_color.jpg"
          normal  = $(if ($ph.Normal) { "${name}_normal.jpg" } else { $null })
          source  = 'Poly Haven'
          asset   = $ph.Id
          url     = "https://polyhaven.com/a/$($ph.Id)"
          license = 'CC0'
        }
        Write-Ok "$name  <- Poly Haven / $($ph.Id)"
      } else {
        $acg = Find-AmbientCg $slot
        if (-not $acg) { throw 'weder Poly Haven noch ambientCG haben etwas geliefert' }
        $maps = Expand-AmbientMaps $acg $name
        Copy-Item -Force $maps.Color $colorPath
        if ($maps.Normal) { Copy-Item -Force $maps.Normal $normalPath }
        if (-not (Test-ImageFile $colorPath)) { throw 'Farb-Map ist kein Bild' }
        $pbrEntries[$name] = [ordered]@{
          color   = "${name}_color.jpg"
          normal  = $(if ($maps.Normal) { "${name}_normal.jpg" } else { $null })
          source  = 'ambientCG'
          asset   = $acg.Id
          url     = "https://ambientcg.com/view?id=$($acg.Id)"
          license = 'CC0'
        }
        Write-Ok "$name  <- ambientCG / $($acg.Id)"
      }
    } catch {
      $failed += "Gelände $name : $($_.Exception.Message)"
      Write-Warn2 "$name fehlgeschlagen: $($_.Exception.Message)"
    }
    Wait-Polite
  }
  Write-Host ''
}

if (-not $SkipCards -and -not $ManifestOnly) {
  Write-Host 'Fotos für die Baukarten (Openverse, nur CC0)' -ForegroundColor Cyan
  foreach ($id in $CardQueries.Keys) {
    if (-not (Want $id)) { continue }
    $path = Join-Path $CardDir "$id.jpg"
    $doReplace = $Replace -contains $id
    if ((Test-ImageFile $path) -and -not $Force -and -not $doReplace) { Write-Skip "$id ist schon da"; continue }
    try {
      $q = [uri]::EscapeDataString($CardQueries[$id])
      $r = Get-Json "$OpenverseApi/images/?q=$q&license=cc0&page_size=12&mature=false"
      $results = @(Get-Prop $r 'results') | Where-Object { $null -ne $_ }
      $previous = Get-Prop $cardEntries[$id] 'openverseId'
      $pick = $null
      foreach ($res in $results) {
        if ((Get-Prop $res 'license') -ne 'cc0') { continue }
        $w = Get-Prop $res 'width'
        if ($null -ne $w -and [int]$w -lt 320) { continue }
        if ($doReplace -and (Get-Prop $res 'id') -eq $previous) { $previous = '__taken__'; continue }
        if ($doReplace -and $previous -and $previous -ne '__taken__') { continue }
        $pick = $res
        break
      }
      if (-not $pick) { throw 'kein passendes CC0-Foto gefunden' }
      $ovId = Get-Prop $pick 'id'
      $thumb = Get-Prop $pick 'thumbnail'
      if (-not $thumb) { $thumb = "$OpenverseApi/images/$ovId/thumb/" }
      Save-Image $thumb $path
      $cardEntries[$id] = [ordered]@{
        file        = "$id.jpg"
        title       = Get-Prop $pick 'title'
        creator     = Get-Prop $pick 'creator'
        url         = Get-Prop $pick 'foreign_landing_url'
        license     = 'CC0'
        openverseId = $ovId
      }
      Write-Ok "$id  <- $(Get-Prop $pick 'title')"
    } catch {
      $failed += "Baukarte $id : $($_.Exception.Message)"
      Write-Warn2 "$id fehlgeschlagen: $($_.Exception.Message)"
    }
    Wait-Polite
  }
  Write-Host ''
}

# Manifeste nur mit Dateien, die wirklich da sind. Gelöschte Fotos fallen so heraus.
foreach ($k in @($pbrEntries.Keys)) {
  if (-not (Test-ImageFile (Join-Path $PbrDir (Get-Prop $pbrEntries[$k] 'color')))) { $pbrEntries.Remove($k) }
}
foreach ($k in @($cardEntries.Keys)) {
  if (-not (Test-ImageFile (Join-Path $CardDir (Get-Prop $cardEntries[$k] 'file')))) { $cardEntries.Remove($k) }
}
Write-Manifest $pbrManifestPath $pbrEntries 'terrain'
Write-Manifest $cardManifestPath $cardEntries 'cards'

# Lizenznachweis (CC0 verlangt keinen, aber so weiss man später, woher alles kommt).
$lines = @('# Herkunft der Grafiken', '', 'Alle Dateien in `pbr/` und `cards/` stehen unter **CC0** (gemeinfrei).', 'Erzeugt von `tools/textures/Get-Textures.ps1`.', '')
$lines += '## Gelände (`pbr/`)'
$lines += ''
$lines += '| Oberfläche | Quelle | Asset |'
$lines += '| --- | --- | --- |'
foreach ($k in ($pbrEntries.Keys | Sort-Object)) {
  $e = $pbrEntries[$k]
  $lines += "| $k | $(Get-Prop $e 'source') | [$(Get-Prop $e 'asset')]($(Get-Prop $e 'url')) |"
}
$lines += ''
$lines += '## Baukarten (`cards/`)'
$lines += ''
$lines += '| Objekt | Titel | Urheber:in | Quelle |'
$lines += '| --- | --- | --- | --- |'
foreach ($k in ($cardEntries.Keys | Sort-Object)) {
  $e = $cardEntries[$k]
  $title = ("" + (Get-Prop $e 'title')) -replace '\|', '/'
  $creator = ("" + (Get-Prop $e 'creator')) -replace '\|', '/'
  $lines += "| $k | $title | $creator | [Link]($(Get-Prop $e 'url')) |"
}
Write-Utf8 ([IO.Path]::Combine($RepoRoot, 'public', 'textures', 'LICENSES.md')) (($lines -join "`n") + "`n")

if ($Preview) {
  $html = @('<!doctype html><meta charset="utf-8"><title>Ski Alpina – Grafiken</title>',
    '<style>body{font:14px system-ui;margin:24px;background:#f5fafe;color:#16305c}div{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}figure{margin:0;background:#fff;border-radius:14px;padding:8px;box-shadow:0 2px 8px #0002}img{width:100%;height:120px;object-fit:cover;border-radius:10px}figcaption{margin-top:6px;font-size:12px}</style>',
    '<h1>Gelände</h1><div>')
  foreach ($k in ($pbrEntries.Keys | Sort-Object)) {
    $src = 'file:///' + ((Join-Path $PbrDir (Get-Prop $pbrEntries[$k] 'color')) -replace '\\', '/')
    $label = [Net.WebUtility]::HtmlEncode('' + (Get-Prop $pbrEntries[$k] 'asset'))
    $html += "<figure><img src='$src'><figcaption><b>$k</b> - $label</figcaption></figure>"
  }
  $html += '</div><h1>Baukarten</h1><p>Gefällt ein Foto nicht: <code>-Replace &lt;id&gt;</code> nimmt das nächste Suchergebnis.</p><div>'
  foreach ($k in ($cardEntries.Keys | Sort-Object)) {
    $src = 'file:///' + ((Join-Path $CardDir (Get-Prop $cardEntries[$k] 'file')) -replace '\\', '/')
    $label = [Net.WebUtility]::HtmlEncode('' + (Get-Prop $cardEntries[$k] 'title'))
    $html += "<figure><img src='$src'><figcaption><b>$k</b> - $label</figcaption></figure>"
  }
  $html += '</div>'
  $previewPath = Join-Path $TempDir 'vorschau.html'
  Write-Utf8 $previewPath ($html -join "`n")
  Write-Host "Vorschau: $previewPath"
  try { Invoke-Item $previewPath } catch { }
}

Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $TempDir '*.zip')

Write-Host ''
Write-Host ("Gelände: {0} von {1}   Baukarten: {2} von {3}" -f $pbrEntries.Count, $TerrainSlots.Count, $cardEntries.Count, $CardQueries.Count) -ForegroundColor Cyan
if ($failed.Count -gt 0) {
  Write-Host 'Nicht geklappt (das Spiel nimmt dafür die eingebaute Darstellung):' -ForegroundColor Yellow
  foreach ($f in $failed) { Write-Host "  - $f" -ForegroundColor Yellow }
}
Write-Host ''
Write-Host 'Weiter mit:' -ForegroundColor Cyan
Write-Host '  npm run dev                      # lokal ansehen'
Write-Host '  git add public/textures'
Write-Host '  git commit -m "Grafiken (CC0) ergänzt"'
Write-Host '  git push                         # Coolify deployt danach von selbst'
Write-Host ''
if ($failed.Count -gt 0 -and $pbrEntries.Count -eq 0 -and $cardEntries.Count -eq 0) { exit 1 }
exit 0

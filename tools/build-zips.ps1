# ============================================================================
#  build-zips.ps1  —  regenerate the Twitchphage distribution zips from a
#  clean set. Sister to Twitchphobe's build-zips.ps1 — same bones, different
#  file list (no net/patch here; it's content/page/adblock).
#
#  Usage:   pwsh tools/build-zips.ps1
#
#  Outputs to the PARENT folder (Brave Extensions\), where a future
#  publish-twitchphage.ps1 and the release will expect them:
#     Twitchphage-<ver>-dragdrop.zip    manifest.json at ROOT  -> drag onto the
#                                          extensions page
#     Twitchphage-<ver>-unpacked.zip    files under Twitchphage/ -> Load unpacked
#     Twitchphage-<ver>.xpi              Firefox "Load Temporary Add-on"
#
#  Dev cruft (tools/, .gitignore, the .user.js) is deliberately EXCLUDED — a
#  person unzipping this wants something that loads, not our build pipeline.
# ============================================================================
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repo = Split-Path $PSScriptRoot -Parent   # ...\Twitchphage
$out  = Split-Path $repo -Parent           # ...\Brave Extensions
$ver  = (Get-Content -Raw (Join-Path $repo 'manifest.json') | ConvertFrom-Json).version

$files = @(
  'manifest.json'
  'README.md'
  'LICENSE'
  'NOTICE'
  'icons/icon128.png'
  'src/content.js'
  'src/page.js'
  'src/adblock.js'
)

function New-TwitchphageZip {
  param([string]$Path, [string]$Prefix)
  if (Test-Path $Path) { Remove-Item $Path -Force }
  $zip = [System.IO.Compression.ZipFile]::Open($Path, 'Create')
  try {
    foreach ($rel in $files) {
      $src = Join-Path $repo $rel
      if (-not (Test-Path $src)) { throw "missing source file: $rel" }
      $entryName = if ($Prefix) { "$Prefix/$rel" } else { $rel }
      $entry = $zip.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
      $stream = $entry.Open()
      try {
        $bytes = [System.IO.File]::ReadAllBytes($src)
        $stream.Write($bytes, 0, $bytes.Length)
      } finally { $stream.Dispose() }
    }
  } finally { $zip.Dispose() }
  $kb = [math]::Round((Get-Item $Path).Length / 1KB, 1)
  Write-Host ("built {0}  ({1} KB)" -f (Split-Path $Path -Leaf), $kb)
}

New-TwitchphageZip -Path (Join-Path $out "Twitchphage-$ver-dragdrop.zip") -Prefix $null
New-TwitchphageZip -Path (Join-Path $out "Twitchphage-$ver-unpacked.zip") -Prefix 'Twitchphage'

# The .xpi is just the drag-drop archive (manifest.json at root) with a Firefox
# hat on — Firefox's "Load Temporary Add-on" accepts it as-is. Copy, don't rebuild.
$dragdrop = Join-Path $out "Twitchphage-$ver-dragdrop.zip"
$xpi      = Join-Path $out "Twitchphage-$ver.xpi"
Copy-Item $dragdrop $xpi -Force
Write-Host ("built {0}  ({1} KB)" -f (Split-Path $xpi -Leaf), ([math]::Round((Get-Item $xpi).Length / 1KB, 1)))

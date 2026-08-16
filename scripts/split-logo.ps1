# Regenera as camadas animáveis da logo em public/brand/.
# Só precisa rodar de novo se public/brand/logo.png mudar.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "forest-logo-split"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

& "$PSScriptRoot\png-raw.ps1" -Mode decode -In "$root\public\brand\logo.png" -Out "$tmp\logo.bin"
node "$PSScriptRoot\split-logo.mjs" "$tmp\logo.bin" $tmp

foreach ($name in @('logo-base', 'logo-wing', 'logo-beak')) {
  & "$PSScriptRoot\png-raw.ps1" -Mode encode -In "$tmp\$name.bin" -Out "$root\public\brand\$name.png" -Width 1254 -Height 1254
}
Remove-Item -Recurse -Force $tmp
Write-Output "camadas regeneradas em public/brand/"

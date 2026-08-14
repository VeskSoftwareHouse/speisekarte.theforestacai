Add-Type -AssemblyName System.Drawing

# Recorta o logo original (tucano + texto "THE FOREST AÇAÍ" abaixo) até a
# caixa delimitadora só do tucano, para os ícones de app não sobrarem com
# uma margem enorme e assimétrica ao redor do desenho.
function Get-ToucanBBox($logo) {
  $w = $logo.Width
  $h = $logo.Height

  $rowHasContent = New-Object bool[] $h
  for ([int]$y = 0; $y -lt $h; $y++) {
    $found = $false
    for ([int]$x = 0; $x -lt $w; $x += 4) {
      if ($logo.GetPixel($x, $y).A -gt 10) { $found = $true; break }
    }
    $rowHasContent[$y] = $found
  }

  # primeiro bloco contíguo de linhas com conteúdo = o tucano (o texto vem
  # depois, separado por uma faixa em branco).
  [int]$rowStart = -1
  [int]$rowEnd = -1
  for ([int]$y = 0; $y -lt $h; $y++) {
    if ($rowHasContent[$y] -and $rowStart -eq -1) { $rowStart = $y }
    if ((-not $rowHasContent[$y]) -and $rowStart -ne -1) { $rowEnd = $y - 1; break }
  }
  if ($rowEnd -eq -1) { $rowEnd = $h - 1 }

  $colHasContent = New-Object bool[] $w
  for ([int]$x = 0; $x -lt $w; $x++) {
    $found = $false
    for ([int]$y = $rowStart; $y -le $rowEnd; $y += 3) {
      if ($logo.GetPixel($x, $y).A -gt 10) { $found = $true; break }
    }
    $colHasContent[$x] = $found
  }
  [int]$colStart = -1
  [int]$colEnd = -1
  for ([int]$x = 0; $x -lt $w; $x++) {
    if ($colHasContent[$x]) {
      if ($colStart -eq -1) { $colStart = $x }
      $colEnd = $x
    }
  }

  return New-Object System.Drawing.Rectangle($colStart, $rowStart, ($colEnd - $colStart), ($rowEnd - $rowStart))
}

function New-BrandIcon($size, $bgHex, $outPath, $logoPath) {
  $bg = [System.Drawing.ColorTranslator]::FromHtml($bgHex)
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear($bg)

  $logo = [System.Drawing.Image]::FromFile($logoPath)
  $bbox = Get-ToucanBBox $logo

  $safe = [int]($size * 0.86)
  $ratio = [Math]::Min($safe / $bbox.Width, $safe / $bbox.Height)
  $lw = [int]($bbox.Width * $ratio)
  $lh = [int]($bbox.Height * $ratio)
  $lx = [int](($size - $lw) / 2)
  $ly = [int](($size - $lh) / 2)
  $destRect = New-Object System.Drawing.Rectangle($lx, $ly, $lw, $lh)
  $g.DrawImage($logo, $destRect, $bbox, [System.Drawing.GraphicsUnit]::Pixel)

  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $logo.Dispose()
  Write-Output "Saved $outPath"
}

$logo = "C:\projetos\cardapio\public\brand\logo.png"

New-Item -ItemType Directory -Force -Path "C:\projetos\cardapio\public\mesa\icons" | Out-Null
New-Item -ItemType Directory -Force -Path "C:\projetos\cardapio\public\equipe\icons" | Out-Null

foreach ($size in 192, 512) {
  New-BrandIcon $size "#340261" "C:\projetos\cardapio\public\mesa\icons\icon-$size.png" $logo
  New-BrandIcon $size "#340261" "C:\projetos\cardapio\public\equipe\icons\icon-$size.png" $logo
}

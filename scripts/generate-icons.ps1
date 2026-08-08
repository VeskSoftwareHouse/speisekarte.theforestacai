Add-Type -AssemblyName System.Drawing

function New-BrandIcon($size, $bgHex, $outPath, $logoPath) {
  $bg = [System.Drawing.ColorTranslator]::FromHtml($bgHex)
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear($bg)

  $logo = [System.Drawing.Image]::FromFile($logoPath)
  $safe = [int]($size * 0.72)
  $ratio = [Math]::Min($safe / $logo.Width, $safe / $logo.Height)
  $lw = [int]($logo.Width * $ratio)
  $lh = [int]($logo.Height * $ratio)
  $lx = [int](($size - $lw) / 2)
  $ly = [int](($size - $lh) / 2)
  $g.DrawImage($logo, $lx, $ly, $lw, $lh)

  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $logo.Dispose()
  Write-Output "Saved $outPath"
}

$logo = "C:\projetos\cardapio\public\brand\logo.png"

New-Item -ItemType Directory -Force -Path "C:\projetos\cardapio\public\mesa\icons" | Out-Null
New-Item -ItemType Directory -Force -Path "C:\projetos\cardapio\public\equipe\icons" | Out-Null

foreach ($size in 192, 512) {
  New-BrandIcon $size "#17121F" "C:\projetos\cardapio\public\mesa\icons\icon-$size.png" $logo
  New-BrandIcon $size "#17121F" "C:\projetos\cardapio\public\equipe\icons\icon-$size.png" $logo
}

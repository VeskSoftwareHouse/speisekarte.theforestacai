param(
  [string]$Src,
  [string]$Out
)
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile($Src)
$size = [Math]::Min($src.Width, $src.Height)

$bmp = New-Object System.Drawing.Bitmap([int]$size, [int]$size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddEllipse(0, 0, $size, $size)
$g.SetClip($path)

$srcRect = New-Object System.Drawing.Rectangle(0, 0, $src.Width, $src.Height)
$destRect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $src.Dispose()
Write-Output "Saved $Out ($size x $size, circular, transparent corners)"

param(
  [string]$Src = "C:\Users\sergi\Downloads\WhatsApp Image 2026-08-08 at 11.27.24.jpeg",
  [double]$X0,
  [double]$Y0,
  [double]$X1,
  [double]$Y1,
  [string]$Out
)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($Src)
$w = $img.Width
$h = $img.Height
$px0 = [int]($X0 * $w)
$py0 = [int]($Y0 * $h)
$pw = [int](($X1 - $X0) * $w)
$ph = [int](($Y1 - $Y0) * $h)
$rect = New-Object System.Drawing.Rectangle($px0, $py0, $pw, $ph)
$bmp = New-Object System.Drawing.Bitmap($pw, $ph)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0,0,$pw,$ph)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $img.Dispose()
Write-Output "Saved $Out ($pw x $ph) from source ${w}x${h}"

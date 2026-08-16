# Converte PNG <-> buffer BGRA cru, para que os scripts Node possam fatiar a
# arte da logo em camadas sem precisar de uma biblioteca de imagem.
#
#   ./png-raw.ps1 decode entrada.png saida.bin
#   ./png-raw.ps1 encode entrada.bin saida.png <largura> <altura>
param(
  [Parameter(Mandatory = $true)][ValidateSet('decode', 'encode')][string]$Mode,
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Width,
  [int]$Height
)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

function Resolve-OutPath([string]$p) {
  if ([System.IO.Path]::IsPathRooted($p)) { return $p }
  return [System.IO.Path]::GetFullPath((Join-Path $PWD.Path $p))
}
$outPath = Resolve-OutPath $Out

if ($Mode -eq 'decode') {
  $src = [System.Drawing.Image]::FromFile((Resolve-Path $In))
  $bmp = New-Object System.Drawing.Bitmap $src.Width, $src.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($src, 0, 0, $src.Width, $src.Height)
  $g.Dispose()

  $rect = New-Object System.Drawing.Rectangle 0, 0, $bmp.Width, $bmp.Height
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bytes = New-Object byte[] ($data.Stride * $bmp.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $bmp.UnlockBits($data)

  [System.IO.File]::WriteAllBytes($outPath, $bytes)
  Write-Output "$($bmp.Width)x$($bmp.Height) stride=$($data.Stride)"
  $bmp.Dispose(); $src.Dispose()
}
else {
  if (-not $Width -or -not $Height) { throw 'encode precisa de -Width e -Height' }
  $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $In))
  $bmp = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $rect = New-Object System.Drawing.Rectangle 0, 0, $Width, $Height
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
  $bmp.UnlockBits($data)
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output "wrote $Out"
  $bmp.Dispose()
}


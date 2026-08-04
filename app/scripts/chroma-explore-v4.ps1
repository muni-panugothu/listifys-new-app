Add-Type -AssemblyName System.Drawing

function Test-IsGreen([System.Drawing.Color]$p) {
  if ($p.G -ge 130 -and $p.G -gt ($p.R + 35) -and $p.G -gt ($p.B + 35)) { return $true }
  if ($p.G -ge 170 -and $p.R -le 130 -and $p.B -le 130) { return $true }
  return $false
}

function Convert-ChromaIcon([string]$Source, [string]$Dest) {
  $src = [System.Drawing.Bitmap]::FromFile($Source)
  $w = $src.Width; $h = $src.Height
  $tmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $p = $src.GetPixel($x, $y)
      if (Test-IsGreen $p) {
        $tmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        continue
      }
      $spill = 0.0
      if ($p.G -gt $p.R -and $p.G -gt $p.B) {
        $spill = [Math]::Min(1.0, (($p.G - [Math]::Max($p.R, $p.B)) / 85.0))
      }
      if ($spill -gt 0.32) {
        $a = [int](255 * (1.0 - $spill))
        if ($a -lt 18) { $tmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0)) }
        else {
          $g2 = [Math]::Min($p.G, [int](($p.R + $p.B) / 2 + 10))
          $tmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, $p.R, $g2, $p.B))
        }
      } else {
        $tmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $p.R, $p.G, $p.B))
      }
    }
  }
  $src.Dispose()

  $minX = $w; $minY = $h; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      if ($tmp.GetPixel($x, $y).A -gt 16) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  $pad = 40
  $minX = [Math]::Max(0, $minX - $pad)
  $minY = [Math]::Max(0, $minY - $pad)
  $maxX = [Math]::Min(($w - 1), $maxX + $pad)
  $maxY = [Math]::Min(($h - 1), $maxY + $pad)
  $cw = $maxX - $minX + 1
  $ch = $maxY - $minY + 1
  $side = [Math]::Max($cw, $ch)
  $out = New-Object System.Drawing.Bitmap $side, $side, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.Dispose()
  $ox = [int](($side - $cw) / 2)
  $oy = [int](($side - $ch) / 2)
  for ($y = 0; $y -lt $ch; $y++) {
    for ($x = 0; $x -lt $cw; $x++) {
      $out.SetPixel(($ox + $x), ($oy + $y), $tmp.GetPixel(($minX + $x), ($minY + $y)))
    }
  }
  $tmp.Dispose()
  if (-not (Test-Path (Split-Path $Dest))) { New-Item -ItemType Directory -Path (Split-Path $Dest) | Out-Null }
  if (Test-Path $Dest) { Remove-Item -Force $Dest }
  $out.Save($Dest, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
}

$srcDir = 'C:\Users\Dell\.cursor\projects\c-Users-Dell-listifys-app\assets'
$destDir = 'C:\Users\Dell\listifys-app\app\assets\home\explore'
foreach ($id in @('dining','movies','events','stores','activities','play')) {
  Write-Output "Chroma $id..."
  Convert-ChromaIcon -Source (Join-Path $srcDir "explore-v4-$id.png") -Dest (Join-Path $destDir "explore-$id.png")
}
Write-Output 'DONE'

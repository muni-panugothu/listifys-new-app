Add-Type -AssemblyName System.Drawing

function Test-IsGreen([System.Drawing.Color]$p) {
  # Chroma green / lime screen
  if ($p.G -ge 140 -and $p.G -gt ($p.R + 40) -and $p.G -gt ($p.B + 40)) { return $true }
  if ($p.G -ge 180 -and $p.R -le 120 -and $p.B -le 120) { return $true }
  return $false
}

function Get-GreenSpill([System.Drawing.Color]$p) {
  if ($p.G -le $p.R -or $p.G -le $p.B) { return 0.0 }
  $dom = $p.G - [Math]::Max($p.R, $p.B)
  return [Math]::Min(1.0, $dom / 90.0)
}

function Convert-ChromaIcon([string]$Source, [string]$Dest) {
  $src = [System.Drawing.Bitmap]::FromFile($Source)
  $w = $src.Width
  $h = $src.Height
  $tmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $p = $src.GetPixel($x, $y)
      if (Test-IsGreen $p) {
        $tmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        continue
      }
      $spill = Get-GreenSpill $p
      if ($spill -gt 0.35) {
        $a = [int](255 * (1.0 - $spill))
        if ($a -lt 20) {
          $tmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } else {
          $g2 = [Math]::Min($p.G, [int](($p.R + $p.B) / 2 + 8))
          $tmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, $p.R, $g2, $p.B))
        }
      } else {
        $tmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $p.R, $p.G, $p.B))
      }
    }
  }
  $src.Dispose()

  # Soft fringe: kill near-green fringe pixels
  for ($y = 1; $y -lt ($h - 1); $y++) {
    for ($x = 1; $x -lt ($w - 1); $x++) {
      $p = $tmp.GetPixel($x, $y)
      if ($p.A -eq 0) { continue }
      $t = 0
      foreach ($d in @(@(1, 0), @(-1, 0), @(0, 1), @(0, -1))) {
        $np = $tmp.GetPixel(($x + $d[0]), ($y + $d[1]))
        if ($np.A -eq 0) { $t++ }
      }
      if ($t -ge 2 -and (Test-IsGreen $p -or (Get-GreenSpill $p) -gt 0.2)) {
        $tmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
      }
    }
  }

  $minX = $w; $minY = $h; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $p = $tmp.GetPixel($x, $y)
      if ($p.A -gt 16) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -lt 0) {
    $tmp.Dispose()
    throw "No opaque pixels in $Source"
  }

  $pad = 28
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
      $sx = $minX + $x
      $sy = $minY + $y
      $pix = $tmp.GetPixel($sx, $sy)
      $out.SetPixel(($ox + $x), ($oy + $y), $pix)
    }
  }
  $tmp.Dispose()

  $dir = Split-Path $Dest -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  if (Test-Path $Dest) { Remove-Item -Force $Dest }
  $out.Save($Dest, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
}

$srcDir = 'C:\Users\Dell\.cursor\projects\c-Users-Dell-listifys-app\assets'
$destDir = 'C:\Users\Dell\listifys-app\app\assets\events\search'
$ids = @('music', 'comedy', 'performances', 'festivals', 'nightlife', 'sports', 'food', 'social')

foreach ($id in $ids) {
  $src = Join-Path $srcDir "search-icon-$id-new.png"
  $dest = Join-Path $destDir "search-icon-$id.png"
  Write-Output "Chroma $id..."
  Convert-ChromaIcon -Source $src -Dest $dest
  $img = [System.Drawing.Bitmap]::FromFile($dest)
  $c = $img.GetPixel(4, 4)
  Write-Output ("  -> {0}x{1} cornerA={2}" -f $img.Width, $img.Height, $c.A)
  $img.Dispose()
}

Write-Output 'DONE'

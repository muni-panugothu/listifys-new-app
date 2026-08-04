Add-Type -AssemblyName System.Drawing

function Test-IsBg([System.Drawing.Color]$p) {
  if ($p.R -le 42 -and $p.G -le 42 -and $p.B -le 42) { return $true }
  $luma = 0.299 * $p.R + 0.587 * $p.G + 0.114 * $p.B
  $maxc = [Math]::Max($p.R, [Math]::Max($p.G, $p.B))
  $minc = [Math]::Min($p.R, [Math]::Min($p.G, $p.B))
  $chroma = $maxc - $minc
  if ($luma -ge 195 -and $p.R -ge 200 -and $p.G -ge 185 -and $p.B -ge 155 -and $chroma -le 70) { return $true }
  if ($luma -ge 175 -and $p.R -ge 190 -and $p.G -ge 175 -and $p.B -ge 145 -and $chroma -le 55 -and ($p.R - $p.B) -ge 15) { return $true }
  return $false
}

function Clear-IconBackground([string]$Path) {
  $src = [System.Drawing.Bitmap]::FromFile($Path)
  $w = $src.Width
  $h = $src.Height
  $pixels = New-Object 'System.Drawing.Color[,]' $w, $h
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $pixels[$x, $y] = $src.GetPixel($x, $y)
    }
  }
  $src.Dispose()

  $visited = New-Object 'bool[,]' $w, $h
  $queue = New-Object System.Collections.Generic.Queue[object]

  for ($x = 0; $x -lt $w; $x++) {
    foreach ($y in @(0, ($h - 1))) {
      $pix = $pixels[$x, $y]
      if (Test-IsBg $pix) {
        $queue.Enqueue(@($x, $y))
        $visited[$x, $y] = $true
      }
    }
  }
  for ($y = 0; $y -lt $h; $y++) {
    foreach ($x in @(0, ($w - 1))) {
      if ($visited[$x, $y]) { continue }
      $pix = $pixels[$x, $y]
      if (Test-IsBg $pix) {
        $queue.Enqueue(@($x, $y))
        $visited[$x, $y] = $true
      }
    }
  }

  $dirs = @(@(1, 0), @(-1, 0), @(0, 1), @(0, -1), @(1, 1), @(1, -1), @(-1, 1), @(-1, -1))
  while ($queue.Count -gt 0) {
    $cur = $queue.Dequeue()
    $cx = [int]$cur[0]
    $cy = [int]$cur[1]
    $old = $pixels[$cx, $cy]
    $pixels[$cx, $cy] = [System.Drawing.Color]::FromArgb(0, $old.R, $old.G, $old.B)
    foreach ($d in $dirs) {
      $nx = $cx + $d[0]
      $ny = $cy + $d[1]
      if ($nx -lt 0 -or $ny -lt 0 -or $nx -ge $w -or $ny -ge $h) { continue }
      if ($visited[$nx, $ny]) { continue }
      $np = $pixels[$nx, $ny]
      if (Test-IsBg $np) {
        $visited[$nx, $ny] = $true
        $queue.Enqueue(@($nx, $ny))
      }
    }
  }

  # Remove cream plates touching transparency
  $visited2 = New-Object 'bool[,]' $w, $h
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      if ($visited2[$x, $y]) { continue }
      $p = $pixels[$x, $y]
      if ($p.A -eq 0) {
        $visited2[$x, $y] = $true
        continue
      }
      $luma = 0.299 * $p.R + 0.587 * $p.G + 0.114 * $p.B
      $chroma = [Math]::Max($p.R, $p.G) - [Math]::Min($p.R, [Math]::Min($p.G, $p.B))
      $isCreamish = ($luma -ge 185 -and $p.R -ge 195 -and $p.G -ge 180 -and $p.B -ge 150 -and $chroma -le 65)
      if (-not $isCreamish) { continue }

      $comp = New-Object System.Collections.Generic.List[object]
      $q2 = New-Object System.Collections.Generic.Queue[object]
      $q2.Enqueue(@($x, $y))
      $visited2[$x, $y] = $true
      $touchesTransparent = $false

      while ($q2.Count -gt 0) {
        $c = $q2.Dequeue()
        $cx = [int]$c[0]
        $cy = [int]$c[1]
        [void]$comp.Add($c)
        foreach ($d in $dirs) {
          $nx = $cx + $d[0]
          $ny = $cy + $d[1]
          if ($nx -lt 0 -or $ny -lt 0 -or $nx -ge $w -or $ny -ge $h) { continue }
          $np = $pixels[$nx, $ny]
          if ($np.A -eq 0) {
            $touchesTransparent = $true
            continue
          }
          if ($visited2[$nx, $ny]) { continue }
          $nl = 0.299 * $np.R + 0.587 * $np.G + 0.114 * $np.B
          $nc = [Math]::Max($np.R, $np.G) - [Math]::Min($np.R, [Math]::Min($np.G, $np.B))
          if ($nl -ge 185 -and $np.R -ge 195 -and $np.G -ge 180 -and $np.B -ge 150 -and $nc -le 65) {
            $visited2[$nx, $ny] = $true
            $q2.Enqueue(@($nx, $ny))
          }
        }
      }

      if ($touchesTransparent -and $comp.Count -ge 80) {
        foreach ($c in $comp) {
          $px = [int]$c[0]
          $py = [int]$c[1]
          $op = $pixels[$px, $py]
          $pixels[$px, $py] = [System.Drawing.Color]::FromArgb(0, $op.R, $op.G, $op.B)
        }
      }
    }
  }

  # Soft fringe cleanup
  for ($y = 1; $y -lt ($h - 1); $y++) {
    for ($x = 1; $x -lt ($w - 1); $x++) {
      $p = $pixels[$x, $y]
      if ($p.A -eq 0) { continue }
      $t = 0
      foreach ($d in @(@(1, 0), @(-1, 0), @(0, 1), @(0, -1))) {
        $nx = $x + $d[0]
        $ny = $y + $d[1]
        $np = $pixels[$nx, $ny]
        if ($np.A -eq 0) { $t++ }
      }
      if ($t -ge 2) {
        $luma = 0.299 * $p.R + 0.587 * $p.G + 0.114 * $p.B
        if (($p.R -le 55 -and $p.G -le 55 -and $p.B -le 55) -or ($luma -ge 190 -and $p.R -ge 200)) {
          $pixels[$x, $y] = [System.Drawing.Color]::FromArgb(0, $p.R, $p.G, $p.B)
        }
      }
    }
  }

  $minX = $w; $minY = $h; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $p = $pixels[$x, $y]
      if ($p.A -gt 10) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -lt 0) {
    Write-Output "  WARN: no opaque pixels in $Path"
    return
  }

  $pad = 24
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
      $dx = $ox + $x
      $dy = $oy + $y
      $pix = $pixels[$sx, $sy]
      $out.SetPixel($dx, $dy, $pix)
    }
  }

  $tmp = "$Path.__tmp.png"
  $out.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
  Move-Item -Force $tmp $Path
}

$icons = @('music', 'comedy', 'performances', 'festivals', 'nightlife', 'sports', 'food', 'social')
$dir = Join-Path $PSScriptRoot '..\assets\events\search' | Resolve-Path

foreach ($id in $icons) {
  $p = Join-Path $dir "search-icon-$id.png"
  Write-Output "Processing $id..."
  Clear-IconBackground -Path $p
  $img = [System.Drawing.Bitmap]::FromFile($p)
  $c = $img.GetPixel(2, 2)
  Write-Output ("  size={0}x{1} cornerA={2}" -f $img.Width, $img.Height, $c.A)
  $img.Dispose()
}

Write-Output 'DONE'

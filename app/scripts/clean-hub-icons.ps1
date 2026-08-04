Add-Type -AssemblyName System.Drawing

function Test-IsLightBg([System.Drawing.Color]$p) {
  $luma = 0.299 * $p.R + 0.587 * $p.G + 0.114 * $p.B
  $maxc = [Math]::Max($p.R, [Math]::Max($p.G, $p.B))
  $minc = [Math]::Min($p.R, [Math]::Min($p.G, $p.B))
  $chroma = $maxc - $minc
  # Near-white / light gray / checker light cells
  if ($luma -ge 220 -and $chroma -le 28) { return $true }
  if ($luma -ge 200 -and $chroma -le 18) { return $true }
  # Near-black checker dark cells sometimes used for transparency preview
  if ($p.R -le 40 -and $p.G -le 40 -and $p.B -le 40) { return $true }
  return $false
}

function Clear-HubIcon([string]$Path) {
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
  $dirs = @(@(1, 0), @(-1, 0), @(0, 1), @(0, -1), @(1, 1), @(1, -1), @(-1, 1), @(-1, -1))

  for ($x = 0; $x -lt $w; $x++) {
    foreach ($y in @(0, ($h - 1))) {
      $pix = $pixels[$x, $y]
      if (Test-IsLightBg $pix) {
        $queue.Enqueue(@($x, $y))
        $visited[$x, $y] = $true
      }
    }
  }
  for ($y = 0; $y -lt $h; $y++) {
    foreach ($x in @(0, ($w - 1))) {
      if ($visited[$x, $y]) { continue }
      $pix = $pixels[$x, $y]
      if (Test-IsLightBg $pix) {
        $queue.Enqueue(@($x, $y))
        $visited[$x, $y] = $true
      }
    }
  }

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
      if (Test-IsLightBg $np) {
        $visited[$nx, $ny] = $true
        $queue.Enqueue(@($nx, $ny))
      }
    }
  }

  # Soft fringe
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
        $chroma = [Math]::Max($p.R, $p.G) - [Math]::Min($p.R, [Math]::Min($p.G, $p.B))
        if (($luma -ge 195 -and $chroma -le 35) -or ($p.R -le 50 -and $p.G -le 50 -and $p.B -le 50)) {
          $pixels[$x, $y] = [System.Drawing.Color]::FromArgb(0, $p.R, $p.G, $p.B)
        }
      }
    }
  }

  $minX = $w; $minY = $h; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $p = $pixels[$x, $y]
      if ($p.A -gt 12) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  if ($maxX -lt 0) { throw "No opaque pixels: $Path" }

  $pad = 36
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

$dir = 'C:\Users\Dell\listifys-app\app\assets\events\hub'
Get-ChildItem $dir -Filter 'hub-icon-*.png' | ForEach-Object {
  Write-Output "Cleaning $($_.Name)..."
  Clear-HubIcon -Path $_.FullName
  $img = [System.Drawing.Bitmap]::FromFile($_.FullName)
  $c = $img.GetPixel(2, 2)
  Write-Output ("  {0}x{1} cornerA={2}" -f $img.Width, $img.Height, $c.A)
  $img.Dispose()
}
Write-Output 'DONE'

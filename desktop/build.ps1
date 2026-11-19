# Builds dist\Slaughtermate.exe using the C# compiler that ships with Windows (.NET Framework 4).
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File desktop\build.ps1
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $repo 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null

# Generate a simple chess-pawn icon.
Add-Type -AssemblyName System.Drawing
$icoPath = Join-Path $PSScriptRoot 'slaughtermate.ico'
$bmp = New-Object System.Drawing.Bitmap 64, 64
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::FromArgb(255, 120, 10, 20))
$white = [System.Drawing.Brushes]::White
$g.FillEllipse($white, 22, 8, 20, 20)
$g.FillPolygon($white, [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point 26, 26), (New-Object System.Drawing.Point 38, 26),
    (New-Object System.Drawing.Point 44, 48), (New-Object System.Drawing.Point 20, 48)))
$g.FillRectangle($white, 14, 48, 36, 8)
$g.Dispose()
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = [System.IO.File]::Create($icoPath); $icon.Save($fs); $fs.Close()

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /nologo /target:winexe /optimize+ `
    /out:"$dist\Slaughtermate.exe" `
    /win32icon:"$icoPath" `
    /resource:"$repo\index.html,index.html" `
    /reference:System.Windows.Forms.dll `
    "$PSScriptRoot\Launcher.cs"
if ($LASTEXITCODE -ne 0) { throw "csc failed ($LASTEXITCODE)" }
Write-Host "Built $dist\Slaughtermate.exe"

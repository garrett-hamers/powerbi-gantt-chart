Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;using System.Runtime.InteropServices;
public class Cap {
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr hdc,uint f);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [StructLayout(LayoutKind.Sequential)] public struct RECT{public int L,T,R,B;}
}
'@ -ErrorAction SilentlyContinue

function Capture-PBI {
    param([int]$ProcessId,[string]$Path,[switch]$Restore)
    $p = Get-Process -Id $ProcessId
    $hw = $p.MainWindowHandle
    if ($Restore) { [Cap]::ShowWindow($hw,4) | Out-Null; Start-Sleep -Seconds 3 }
    $r = New-Object Cap+RECT
    [Cap]::GetWindowRect($hw,[ref]$r) | Out-Null
    $w = $r.R-$r.L; $h = $r.B-$r.T
    if ($w -lt 500) { throw "window minimized ($w x $h)" }
    $bmp = New-Object System.Drawing.Bitmap $w,$h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $hdc = $g.GetHdc(); [Cap]::PrintWindow($hw,$hdc,2) | Out-Null; $g.ReleaseHdc($hdc); $g.Dispose()
    $bmp.Save($Path,[System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    "captured ${w}x${h} -> $Path"
}

function Shrink-Png {
    param([string]$Src,[string]$Dst,[int]$W=1288,[int]$H=704)
    $s = [System.Drawing.Image]::FromFile($Src)
    $d = New-Object System.Drawing.Bitmap $W,$H
    $g = [System.Drawing.Graphics]::FromImage($d)
    $g.InterpolationMode='HighQualityBicubic'; $g.DrawImage($s,0,0,$W,$H); $g.Dispose()
    $d.Save($Dst,[System.Drawing.Imaging.ImageFormat]::Png)
    $s.Dispose(); $d.Dispose()
    "shrunk -> $Dst"
}

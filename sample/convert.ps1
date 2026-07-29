# Open a .pbit in Power BI Desktop and Save As .pbix.
#
# A .pbix contains a compiled binary DataModel part that only Desktop can
# produce, so this one step cannot be scripted away. Desktop's ribbon ignores
# SendKeys, so the ribbon is driven through UI Automation; the Save As dialog is
# driven through Win32 because UIA FindAll(Descendants) can hang on it.
param(
    [Parameter(Mandatory = $true)][string]$Pbit,
    [Parameter(Mandatory = $true)][string]$Pbix,
    [int]$LoadTimeoutSec = 240
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'focus.ps1')
. (Join-Path $PSScriptRoot 'uia.ps1')

Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class W32 {
 [DllImport("user32.dll",CharSet=CharSet.Auto)] public static extern IntPtr FindWindow(string c,string n);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, EnumProc cb, IntPtr p);
 public delegate bool EnumProc(IntPtr h, IntPtr p);
 [DllImport("user32.dll",CharSet=CharSet.Auto)] public static extern int GetClassName(IntPtr h,StringBuilder s,int c);
 [DllImport("user32.dll",CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int c);
 [DllImport("user32.dll",CharSet=CharSet.Auto)] public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,string l);
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 public static List<IntPtr> Children(IntPtr parent){
   var list = new List<IntPtr>();
   EnumChildWindows(parent, (h,p)=>{ list.Add(h); return true; }, IntPtr.Zero);
   return list;
 }
 public static string Cls(IntPtr h){ var sb=new StringBuilder(256); GetClassName(h,sb,256); return sb.ToString(); }
 public static string Txt(IntPtr h){ var sb=new StringBuilder(512); GetWindowText(h,sb,512); return sb.ToString(); }
}
'@ -ErrorAction SilentlyContinue

$exe = 'C:\Program Files\Microsoft Power BI Desktop\bin\PBIDesktop.exe'
if (-not (Test-Path $exe)) { throw "Power BI Desktop not found at $exe" }
$Pbit = (Resolve-Path $Pbit).Path
New-Item -ItemType Directory -Force -Path (Split-Path $Pbix) | Out-Null
if (Test-Path $Pbix) { Remove-Item $Pbix -Force }

Write-Host "launching Desktop with $Pbit"
$proc = Start-Process $exe -ArgumentList "`"$Pbit`"" -PassThru
Start-Sleep -Seconds 20

# Wait for the model to build. A .pbit loads its #table literal on open; the
# title stops saying "Loading" / "Opening" once done.
$deadline = (Get-Date).AddSeconds($LoadTimeoutSec)
$root = $null
while ((Get-Date) -lt $deadline) {
    $proc.Refresh()
    if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
        $t = [Fg]::TitleOf($proc.MainWindowHandle)
        Write-Host "  title: $t"
        if ($t -like '*Power BI Desktop*' -and $t -notlike '*Loading*' -and $t -notlike '*Opening*') {
            $root = Get-PbiRoot -ProcessId $proc.Id
            # Dismiss any modal that appeared (Load/Enable/OK/Close).
            foreach ($b in @('Close', 'OK', 'Enable', 'Load')) {
                $el = Find-ByName -Root $root -Name $b -Type Button -TimeoutSec 1
                if ($el) { Write-Host "  dismissing modal button '$b'"; Invoke-Element $el | Out-Null; Start-Sleep -Seconds 3 }
            }
            break
        }
    }
    Start-Sleep -Seconds 5
}
if (-not $root) { throw "Desktop did not reach a ready state within $LoadTimeoutSec s" }
Start-Sleep -Seconds 15

if (-not (Assert-Focus -ProcessId $proc.Id)) { throw 'could not foreground Desktop' }
$root = Get-PbiRoot -ProcessId $proc.Id

Write-Host 'ribbon: File'
$file = Find-ByName -Root $root -Name 'File' -TimeoutSec 20
if (-not $file) { throw 'File tab not found' }
Invoke-Element $file | Out-Null
Start-Sleep -Seconds 4

Write-Host 'backstage: Save as'
$root = Get-PbiRoot -ProcessId $proc.Id
$saveAs = Find-ByName -Root $root -Name 'Save as' -TimeoutSec 20
if (-not $saveAs) { throw 'Save as not found' }
Invoke-Element $saveAs | Out-Null
Start-Sleep -Seconds 4

# Newer builds interpose a "Browse this device" destination picker.
$root = Get-PbiRoot -ProcessId $proc.Id
$browse = Find-ByName -Root $root -Name 'Browse this device' -TimeoutSec 6
if ($browse) { Write-Host 'backstage: Browse this device'; Invoke-Element $browse | Out-Null }
Start-Sleep -Seconds 5

# --- Save As dialog, via Win32 ------------------------------------------------
$dlg = [IntPtr]::Zero
for ($i = 0; $i -lt 30; $i++) {
    $dlg = [W32]::FindWindow('#32770', 'Save As')
    if ($dlg -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 700
}
if ($dlg -eq [IntPtr]::Zero) { throw 'Save As dialog never appeared' }
Write-Host "Save As dialog handle $dlg"

$edit = [IntPtr]::Zero
$save = [IntPtr]::Zero
foreach ($h in [W32]::Children($dlg)) {
    $cls = [W32]::Cls($h)
    $txt = [W32]::Txt($h)
    if ($cls -eq 'Edit' -and $edit -eq [IntPtr]::Zero -and [W32]::IsWindowVisible($h)) { $edit = $h }
    if ($cls -eq 'Button' -and ($txt -eq '&Save' -or $txt -eq 'Save')) { $save = $h }
}
# The filename Edit is usually nested inside a ComboBoxEx32.
if ($edit -eq [IntPtr]::Zero) {
    foreach ($h in [W32]::Children($dlg)) {
        foreach ($c in [W32]::Children($h)) {
            if ([W32]::Cls($c) -eq 'Edit') { $edit = $c; break }
        }
        if ($edit -ne [IntPtr]::Zero) { break }
    }
}
if ($edit -eq [IntPtr]::Zero) { throw 'filename edit not found' }
if ($save -eq [IntPtr]::Zero) { throw 'Save button not found' }

$full = [System.IO.Path]::GetFullPath($Pbix)
Write-Host "typing path: $full"
[W32]::SendMessage($edit, 0x000C, [IntPtr]::Zero, $full) | Out-Null   # WM_SETTEXT
Start-Sleep -Seconds 2
[W32]::SendMessage($save, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null  # BM_CLICK

# Saving compiles the model; wait for the file to appear and stop growing.
$deadline = (Get-Date).AddSeconds(300)
$last = -1
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    if (Test-Path $full) {
        $len = (Get-Item $full).Length
        Write-Host "  $full : $len bytes"
        if ($len -gt 0 -and $len -eq $last) { break }
        $last = $len
    }
}
if (-not (Test-Path $full)) { throw 'save produced no file' }

Start-Sleep -Seconds 5
Write-Host "closing Desktop (pid $($proc.Id))"
Stop-Process -Id $proc.Id -Force
Start-Sleep -Seconds 5
Write-Host ("DONE {0} ({1:N1} KB)" -f $full, ((Get-Item $full).Length / 1KB))

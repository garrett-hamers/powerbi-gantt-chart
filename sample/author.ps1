# Open a .pbit whose custom visual has no field bindings, drag fields into its
# wells so Power BI Desktop authors the query itself, then Save As .pbix.
#
# Hand-written bindings worked for Tornado and Radar but not for Gantt, whose
# visual kept rendering its "Add Task, Start Date, and End Date fields" landing
# page. Letting the host build the dataView is authoritative.
param(
    [Parameter(Mandatory = $true)][string]$Pbit,
    [Parameter(Mandatory = $true)][string]$Pbix,
    [Parameter(Mandatory = $true)][string]$Landing,
    [Parameter(Mandatory = $true)][string]$VisualTitle,
    [Parameter(Mandatory = $true)][string]$Table,
    [Parameter(Mandatory = $true)][array]$Wells
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$here\drag.ps1"
. "$here\focus.ps1"
. "$here\uia.ps1"
. "$here\cap.ps1"

Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class W32b {
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

$Pbit = (Resolve-Path $Pbit).Path
$Pbix = [System.IO.Path]::GetFullPath($Pbix)
New-Item -ItemType Directory -Force -Path (Split-Path $Pbix) | Out-Null
if (Test-Path $Pbix) { Remove-Item $Pbix -Force }

$known = @(Get-Process -Name PBIDesktop -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
Start-Process 'C:\Program Files\Microsoft Power BI Desktop\bin\PBIDesktop.exe' -ArgumentList "`"$Pbit`""

$proc = $null
for ($t = 0; $t -lt 60; $t++) {
    Start-Sleep -Seconds 5
    $c = Get-Process -Name PBIDesktop -ErrorAction SilentlyContinue |
         Where-Object { $known -notcontains $_.Id -and $_.MainWindowTitle }
    if ($c) { $proc = $c | Select-Object -First 1 }
    if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) {
        $root = Get-Root $proc.Id
        if (Find-El $root $VisualTitle 'Group' 1) { break }
    }
}
if (-not $proc) { throw 'Power BI Desktop never appeared' }
Write-Host "opened pid=$($proc.Id)"
if (-not (Assert-Focus -ProcessId $proc.Id)) { throw 'could not foreground Desktop' }

# Select the visual so its field wells enter the automation tree. The visual's
# own landing text lives inside its SVG and is not exposed to UI Automation, so
# the container Group - named after the visual title - is the reliable handle.
$root = Get-Root $proc.Id
$landingEl = Find-El $root $VisualTitle 'Group' 30
if (-not $landingEl) { throw "visual container '$VisualTitle' not found" }
$c = Get-Centre $landingEl
[Drag]::SetCursorPos($c.X, $c.Y); Start-Sleep -Milliseconds 400
[Drag]::Press(); [Drag]::Release(); Start-Sleep -Seconds 4

$root = Get-Root $proc.Id
$tbl = Find-El $root "Table $Table" 'TreeItem' 12
if ($tbl) {
    try { $tbl.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand() } catch {}
    Start-Sleep -Seconds 3
}

foreach ($w in $Wells) {
    $root = Get-Root $proc.Id
    # The Data pane names tree items with a leading space, and dragging earlier
    # fields can change what is scrolled into view, so try a few spellings.
    $field = $null
    foreach ($variant in @($w.Field, $w.Field.Trim(), " $($w.Field.Trim())")) {
        $field = Find-El $root $variant 'TreeItem' 4
        if ($field) { break }
    }
    if (-not $field) {
        # Re-expand the table: a previous drop can collapse or virtualise it.
        $tbl2 = Find-El $root "Table $Table" 'TreeItem' 6
        if ($tbl2) {
            try { $tbl2.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand() } catch {}
            Start-Sleep -Seconds 3
            $root = Get-Root $proc.Id
            foreach ($variant in @($w.Field, $w.Field.Trim(), " $($w.Field.Trim())")) {
                $field = Find-El $root $variant 'TreeItem' 4
                if ($field) { break }
            }
        }
    }
    $well = Find-El $root $w.Well 'ListItem' 12
    if (-not $field -or -not $well) {
        Write-Host ("{0,-14} SKIPPED (field={1} well={2})" -f $w.Label, [bool]$field, [bool]$well)
        continue
    }
    Invoke-Drag (Get-Centre $field) (Get-Centre $well) | Out-Null
    $after = Get-Root $proc.Id
    $stillEmpty = Find-El $after $w.Well 'ListItem' 3
    Write-Host ("{0,-14} {1}" -f $w.Label, $(if ($stillEmpty) { 'REJECTED' } else { 'ACCEPTED' }))
}

Start-Sleep -Seconds 8
Capture-PBI -ProcessId $proc.Id -Path (Join-Path (Split-Path $Pbix) 'authored.png') | Out-Null

# --- Save As ------------------------------------------------------------------
if (-not (Assert-Focus -ProcessId $proc.Id)) { throw 'lost focus before save' }
$root = Get-PbiRoot -ProcessId $proc.Id
Invoke-Element (Find-ByName -Root $root -Name 'File' -TimeoutSec 20) | Out-Null
Start-Sleep -Seconds 4
$root = Get-PbiRoot -ProcessId $proc.Id
Invoke-Element (Find-ByName -Root $root -Name 'Save as' -TimeoutSec 20) | Out-Null
Start-Sleep -Seconds 4
$root = Get-PbiRoot -ProcessId $proc.Id
$browse = Find-ByName -Root $root -Name 'Browse this device' -TimeoutSec 6
if ($browse) { Invoke-Element $browse | Out-Null }
Start-Sleep -Seconds 5

$dlg = [IntPtr]::Zero
for ($i = 0; $i -lt 30; $i++) {
    $dlg = [W32b]::FindWindow('#32770', 'Save As')
    if ($dlg -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 700
}
if ($dlg -eq [IntPtr]::Zero) { throw 'Save As dialog never appeared' }

$edit = [IntPtr]::Zero; $save = [IntPtr]::Zero
foreach ($h in [W32b]::Children($dlg)) {
    $cls = [W32b]::Cls($h); $txt = [W32b]::Txt($h)
    if ($cls -eq 'Edit' -and $edit -eq [IntPtr]::Zero -and [W32b]::IsWindowVisible($h)) { $edit = $h }
    if ($cls -eq 'Button' -and ($txt -eq '&Save' -or $txt -eq 'Save')) { $save = $h }
}
if ($edit -eq [IntPtr]::Zero) {
    foreach ($h in [W32b]::Children($dlg)) {
        foreach ($cc in [W32b]::Children($h)) { if ([W32b]::Cls($cc) -eq 'Edit') { $edit = $cc; break } }
        if ($edit -ne [IntPtr]::Zero) { break }
    }
}
$full = [System.IO.Path]::GetFullPath($Pbix)
[W32b]::SendMessage($edit, 0x000C, [IntPtr]::Zero, $full) | Out-Null
Start-Sleep -Seconds 2
[W32b]::SendMessage($save, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null

$deadline = (Get-Date).AddSeconds(300); $last = -1
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    if (Test-Path $full) {
        $len = (Get-Item $full).Length
        if ($len -gt 0 -and $len -eq $last) { break }
        $last = $len
    }
}
if (-not (Test-Path $full)) { throw 'save produced no file' }
Start-Sleep -Seconds 5
Stop-Process -Id $proc.Id -Force
Start-Sleep -Seconds 5
Write-Host ("DONE {0} ({1:N1} KB)" -f $full, ((Get-Item $full).Length / 1KB))

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Fg {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c);
 [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll",CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int c);
 public static string TitleOf(IntPtr h){ var sb=new StringBuilder(512); GetWindowText(h,sb,512); return sb.ToString(); }
 public static string ForegroundTitle(){ return TitleOf(GetForegroundWindow()); }
 // Attach to the foreground thread's input queue first; without this Windows
 // refuses SetForegroundWindow from a non-foreground process.
 public static bool ForceForeground(IntPtr h){
   IntPtr fg = GetForegroundWindow();
   if (fg == h) return true;
   uint fgPid; uint fgThread = GetWindowThreadProcessId(fg, out fgPid);
   uint me = GetCurrentThreadId();
   AttachThreadInput(me, fgThread, true);
   BringWindowToTop(h);
   bool ok = SetForegroundWindow(h);
   AttachThreadInput(me, fgThread, false);
   return ok;
 }
}
'@ -ErrorAction SilentlyContinue

# Focus a process's main window and PROVE it took. Never send keys without this
# returning $true: this is a shared desktop and a stray keystroke lands in
# whatever the user happens to have in front.
function Assert-Focus {
    param([int]$ProcessId, [string]$TitleLike = '*Power BI Desktop*', [int]$Tries = 12)
    $p = Get-Process -Id $ProcessId -ErrorAction Stop
    for ($i = 0; $i -lt $Tries; $i++) {
        $h = (Get-Process -Id $ProcessId).MainWindowHandle
        if ($h -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 700; continue }
        [Fg]::ShowWindow($h, 3) | Out-Null
        Start-Sleep -Milliseconds 400
        [Fg]::ForceForeground($h) | Out-Null
        Start-Sleep -Milliseconds 700
        $fgh = [Fg]::GetForegroundWindow()
        $title = [Fg]::TitleOf($fgh)
        if ($fgh -eq $h -and $title -like $TitleLike) { return $true }
    }
    $final = [Fg]::ForegroundTitle()
    Write-Warning "REFUSING to send keys: foreground is '$final', wanted '$TitleLike'"
    return $false
}

# Send keys only when focus is proven, re-checking immediately before the send.
function Send-Safe {
    param([int]$ProcessId, [string]$Keys, [string]$TitleLike = '*Power BI Desktop*')
    if (-not (Assert-Focus -ProcessId $ProcessId -TitleLike $TitleLike)) { return $false }
    [System.Windows.Forms.SendKeys]::SendWait($Keys)
    return $true
}

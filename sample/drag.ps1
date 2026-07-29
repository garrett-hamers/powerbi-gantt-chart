# Drag a field from the Data pane into a visual's field well, using UI Automation to
# locate both endpoints and real mouse events to perform the drag.
#
# This is the test that would have caught the July 2026 certification failure:
# Power BI silently rejects drops when capabilities.json declares min >= 1 on more
# than one data role, and nothing short of an actual drag reveals it.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Drag {
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e);
 public const uint DOWN = 0x0002, UP = 0x0004;
 public static void Press()   { mouse_event(DOWN,0,0,0,0); }
 public static void Release() { mouse_event(UP,0,0,0,0); }
}
'@ -ErrorAction SilentlyContinue

function Get-Root([int]$ProcessId) {
    $h = (Get-Process -Id $ProcessId).MainWindowHandle
    return [System.Windows.Automation.AutomationElement]::FromHandle($h)
}

# Find an element by exact name, optionally restricted to a control type.
function Find-El($Root, [string]$Name, [string]$Type = $null, [int]$TimeoutSec = 12) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $cond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty, $Name)
        if ($Type) {
            $tc = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                [System.Windows.Automation.ControlType]::$Type)
            $cond = New-Object System.Windows.Automation.AndCondition($cond, $tc)
        }
        $el = $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
        if ($el) { return $el }
        Start-Sleep -Milliseconds 400
    }
    return $null
}

function Get-Centre($El) {
    $r = $El.Current.BoundingRectangle
    return @{ X = [int]($r.X + $r.Width / 2); Y = [int]($r.Y + $r.Height / 2) }
}

# Move in steps: Power BI's drag handler needs intermediate motion to register.
function Invoke-Drag($From, $To) {
    [Drag]::SetCursorPos($From.X, $From.Y); Start-Sleep -Milliseconds 500
    [Drag]::Press();                        Start-Sleep -Milliseconds 350
    $steps = 28
    for ($i = 1; $i -le $steps; $i++) {
        $x = [int]($From.X + ($To.X - $From.X) * $i / $steps)
        $y = [int]($From.Y + ($To.Y - $From.Y) * $i / $steps)
        [Drag]::SetCursorPos($x, $y)
        Start-Sleep -Milliseconds 40
    }
    Start-Sleep -Milliseconds 600
    [Drag]::Release()
    Start-Sleep -Seconds 3
}

function Dump-Names($Root, [string]$Filter = '') {
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $stack = New-Object System.Collections.Stack
    $stack.Push($Root)
    $seen = @()
    while ($stack.Count -gt 0) {
        $n = $stack.Pop()
        $child = $walker.GetFirstChild($n)
        while ($child) {
            $nm = $child.Current.Name
            if ($nm -and ($Filter -eq '' -or $nm -like "*$Filter*")) {
                $seen += ("{0} [{1}]" -f $nm, ($child.Current.ControlType.ProgrammaticName -replace 'ControlType\.',''))
            }
            $stack.Push($child)
            $child = $walker.GetNextSibling($child)
        }
    }
    return $seen | Sort-Object -Unique
}

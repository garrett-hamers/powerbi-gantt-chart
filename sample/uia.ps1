$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Get-PbiRoot {
    param([int]$ProcessId)
    $h = (Get-Process -Id $ProcessId).MainWindowHandle
    return [System.Windows.Automation.AutomationElement]::FromHandle($h)
}

function Find-ByName {
    param($Root, [string]$Name, [string]$Type = $null, [int]$TimeoutSec = 10)
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

function Invoke-Element {
    param($El)
    if (-not $El) { return $false }
    try {
        $p = $El.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        $p.Invoke(); return $true
    } catch {}
    try {
        $p = $El.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)
        $p.Expand(); return $true
    } catch {}
    try {
        $p = $El.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
        $p.Select(); return $true
    } catch {}
    return $false
}

function Set-EditValue {
    param($El, [string]$Text)
    if (-not $El) { return $false }
    try {
        $p = $El.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        $p.SetValue($Text); return $true
    } catch { return $false }
}

function Dump-Children {
    param($Root, [int]$Depth = 1, [string]$Indent = '')
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $child = $walker.GetFirstChild($Root)
    while ($child) {
        $n = $child.Current.Name
        $t = $child.Current.ControlType.ProgrammaticName -replace 'ControlType\.',''
        $a = $child.Current.AutomationId
        if ($n -or $a) { Write-Host ("{0}[{1}] '{2}' id={3}" -f $Indent, $t, $n, $a) }
        if ($Depth -gt 1) { Dump-Children -Root $child -Depth ($Depth-1) -Indent ($Indent + '  ') }
        $child = $walker.GetNextSibling($child)
    }
}

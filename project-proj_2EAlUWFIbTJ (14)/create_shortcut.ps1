$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$ShortcutFile = Join-Path $DesktopPath "Architector.lnk"

# Project root directory resolved relative to the script location
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$Shortcut = $WshShell.CreateShortcut($ShortcutFile)
$Shortcut.TargetPath = Join-Path $ProjectDir "run.bat"
$Shortcut.WorkingDirectory = $ProjectDir
$Shortcut.Description = "Launch Architector Visual Logic Node Editor"
$Shortcut.IconLocation = Join-Path $ProjectDir "favicon.ico"
$Shortcut.Save()

Write-Host "Desktop shortcut created successfully at: $ShortcutFile"

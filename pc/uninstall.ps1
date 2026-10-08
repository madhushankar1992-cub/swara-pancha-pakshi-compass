# Stops the Pakshi Compass pop-ups and removes their scheduled tasks. Your files stay in this folder.
schtasks.exe /Delete /TN 'PakshiCompass' /F 2>$null | Out-Host
schtasks.exe /Delete /TN 'PakshiCompassLogon' /F 2>$null | Out-Host
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like "*$dir\daemon.js*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host 'Pakshi Compass pop-ups stopped and removed. You can delete this folder if you no longer need it.'

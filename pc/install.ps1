# Registers the Pakshi Compass pop-ups for the current user (no admin needed) and starts them now.
$ErrorActionPreference = 'Continue'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $dir 'start-hidden.vbs'
$run = "wscript.exe $vbs"

# Keeper task: every 10 minutes (starts the service after logon/sleep and if it ever stops).
schtasks.exe /Create /TN 'PakshiCompass' /SC MINUTE /MO 10 /TR $run /F | Out-Host
# Logon task: starts it right at sign-in. Some PCs need admin for this one; the keeper covers that case.
schtasks.exe /Create /TN 'PakshiCompassLogon' /SC ONLOGON /TR $run /F 2>$null | Out-Host

# Allow running on battery and without a time limit (schtasks defaults to AC power only).
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0 -StartWhenAvailable
foreach ($t in 'PakshiCompass', 'PakshiCompassLogon') {
    if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) {
        Set-ScheduledTask -TaskName $t -Settings $settings | Out-Null
        Write-Host "Task $t ready (runs on battery too)."
    }
}

# Start now through Task Scheduler, so it runs independently of this window.
schtasks.exe /Run /TN 'PakshiCompass' | Out-Host
Write-Host 'Pakshi Compass pop-ups are running.'

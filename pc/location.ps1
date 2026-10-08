# Prints "lat,lon" from Windows Location Services, or nothing if location is off/unavailable.
try {
    Add-Type -AssemblyName System.Device
    $w = New-Object System.Device.Location.GeoCoordinateWatcher
    $w.Start()
    $tries = 0
    while (($w.Status -ne 'Ready') -and ($w.Permission -ne 'Denied') -and ($tries -lt 75)) { Start-Sleep -Milliseconds 200; $tries++ }
    $c = $w.Position.Location
    if ($c -and -not $c.IsUnknown) {
        '{0},{1}' -f $c.Latitude.ToString([Globalization.CultureInfo]::InvariantCulture), $c.Longitude.ToString([Globalization.CultureInfo]::InvariantCulture)
    }
    $w.Stop()
} catch { }

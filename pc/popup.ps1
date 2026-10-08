# Swara Pancha Pakshi Compass pop-up window. Exit code 10 = "Snooze 1 hour", 0 = OK / closed.
param([Parameter(Mandatory = $true)][string]$DataFile)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$d = Get-Content -LiteralPath $DataFile -Raw -Encoding UTF8 | ConvertFrom-Json
$script:result = 0

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Swara Pancha Pakshi Compass'
$form.Width = 470
$form.Height = 500
$form.TopMost = $true
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.ShowInTaskbar = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(243, 244, 239)
$form.StartPosition = 'Manual'
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = New-Object System.Drawing.Point(($wa.Right - $form.Width - 16), ($wa.Bottom - $form.Height - 16))

$band = New-Object System.Windows.Forms.Panel
$band.Dock = 'Top'
$band.Height = 58
$band.BackColor = [System.Drawing.ColorTranslator]::FromHtml($d.color)
$verdict = New-Object System.Windows.Forms.Label
$verdict.Text = $d.verdict
$verdict.ForeColor = [System.Drawing.Color]::White
$verdict.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 15)
$verdict.AutoSize = $false
$verdict.Dock = 'Fill'
$verdict.TextAlign = 'MiddleLeft'
$verdict.Padding = New-Object System.Windows.Forms.Padding(14, 0, 0, 0)
$band.Controls.Add($verdict)

$title = New-Object System.Windows.Forms.Label
$title.Text = $d.title
$title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 11.5)
$title.ForeColor = [System.Drawing.Color]::FromArgb(23, 32, 54)
$title.SetBounds(14, 66, 430, 26)

$sub = New-Object System.Windows.Forms.Label
$sub.Text = $d.sub
$sub.Font = New-Object System.Drawing.Font('Segoe UI', 8.75)
$sub.ForeColor = [System.Drawing.Color]::FromArgb(91, 101, 119)
$sub.SetBounds(14, 92, 430, 34)

$body = New-Object System.Windows.Forms.TextBox
$body.Multiline = $true
$body.ReadOnly = $true
$body.ScrollBars = 'Vertical'
$body.BorderStyle = 'None'
$body.BackColor = [System.Drawing.Color]::White
$body.Font = New-Object System.Drawing.Font('Segoe UI', 9.5)
$body.Text = $d.body
$body.SetBounds(14, 130, 426, 270)
$body.TabStop = $false

$ok = New-Object System.Windows.Forms.Button
$ok.Text = 'OK'
$ok.SetBounds(254, 412, 88, 32)
$ok.Add_Click({ $script:result = 0; $form.Close() })

$snooze = New-Object System.Windows.Forms.Button
$snooze.Text = 'Snooze 1 hour'
$snooze.SetBounds(348, 412, 96, 32)
$snooze.Add_Click({ $script:result = 10; $form.Close() })

$form.Controls.AddRange(@($band, $title, $sub, $body, $ok, $snooze))
$form.AcceptButton = $ok

# close by itself when this period ends
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = [Math]::Min([int]$d.closeAfterSec, 3600) * 1000
$timer.Add_Tick({ $timer.Stop(); $form.Close() })
$timer.Start()

$form.Add_Shown({ $form.Activate(); [System.Media.SystemSounds]::Asterisk.Play() })
[void]$form.ShowDialog()
exit $script:result

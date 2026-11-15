param(
    [Parameter(Mandatory)]
    [string] $Executable
)
$ErrorActionPreference = 'Stop'
$file = Get-Item -LiteralPath $Executable
if ($file.PSIsContainer -or $file.Name -ne 'AgroMax-QGroundControl.exe' -or
    $file.FullName -notmatch '^[A-Za-z]:\\[^"%\r\n]+$') {
    throw 'Select the local AgroMax-QGroundControl.exe from the AgroMax Windows build.'
}

$key = 'HKCU:\Software\Classes\agromax-qgc'
New-Item -Path $key -Force | Out-Null
Set-Item -Path $key -Value 'URL:AgroMax QGroundControl'
New-ItemProperty -Path $key -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path "$key\DefaultIcon" -Force | Out-Null
Set-Item -Path "$key\DefaultIcon" -Value ('"' + $file.FullName + '",0')
New-Item -Path "$key\shell\open\command" -Force | Out-Null
# No URI argument is forwarded to the program. The user imports a local plan in QGC.
Set-Item -Path "$key\shell\open\command" -Value ('"' + $file.FullName + '"')

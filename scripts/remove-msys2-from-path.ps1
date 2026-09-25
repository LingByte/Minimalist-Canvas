# Remove MSYS2 entries from the SYSTEM PATH so MSVC's link.exe is no longer shadowed.
# Run this script in an ELEVATED PowerShell (Right-click -> Run with PowerShell as Administrator).

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

$remove = @(
    'D:\mysys2'
    'D:\mysys2\usr\bin'
    'D:\mysys2\opus'
    'D:\mysys2\mingw64\bin'
)

$sysPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$backup  = Join-Path $PSScriptRoot ".path-backup-$(Get-Date -Format yyyyMMdd-HHmmss).txt"
$sysPath | Out-File -FilePath $backup -Encoding UTF8
Write-Host "Backup saved to: $backup" -ForegroundColor Green

$entries = $sysPath -split ';' | Where-Object { $_ -ne '' }
$kept    = $entries | Where-Object { $_ -notin $remove }
$removed = $entries | Where-Object { $_ -in $remove }

if ($removed.Count -eq 0) {
    Write-Host "No MSYS2 entries found in SYSTEM PATH. Nothing to do." -ForegroundColor Yellow
    exit 0
}

$newPath = ($kept -join ';')
[Environment]::SetEnvironmentVariable('Path', $newPath, 'Machine')

Write-Host ""
Write-Host "=== REMOVED ===" -ForegroundColor Cyan
$removed | ForEach-Object { Write-Host "  $_" }
Write-Host ""
Write-Host "=== VERIFICATION (remaining mysys2 entries) ===" -ForegroundColor Cyan
$remaining = ([Environment]::GetEnvironmentVariable('Path', 'Machine') -split ';') | Where-Object { $_ -match 'mysys2' }
if ($remaining) {
    $remaining | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
} else {
    Write-Host "  (none - clean)" -ForegroundColor Green
}
Write-Host ""
Write-Host "Done. Close ALL terminals and reopen, or sign out/in, for the change to take effect." -ForegroundColor Green

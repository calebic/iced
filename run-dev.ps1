# Iced Dev Launcher (PowerShell)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Iced Dev Launcher (PowerShell)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

if (-not $env:RUN_DEV_CMD_WRAPPED) {
  Start-Process cmd `
    -ArgumentList "/k", "set RUN_DEV_CMD_WRAPPED=1 && powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`"" `
    -WindowStyle Normal
  exit
}

function Wait-ForExit {
  if ($Host.Name -eq "ConsoleHost") {
    Read-Host "Press Enter to exit"
  }
}

# Ensure we are in the repo root
Set-Location $PSScriptRoot

Write-Host "Installing dependencies (workspace root)..." -ForegroundColor Yellow
pnpm install
if ($LASTEXITCODE -ne 0) {
  Write-Host "pnpm install failed. Fix errors and re-run." -ForegroundColor Red
  Wait-ForExit
  exit 1
}

Write-Host ""
Write-Host "Starting services..." -ForegroundColor Green

Write-Host "Building shared package..." -ForegroundColor Yellow
pnpm -C packages/shared build
if ($LASTEXITCODE -ne 0) {
  Write-Host "Shared package build failed. Fix errors and re-run." -ForegroundColor Red
  Wait-ForExit
  exit 1
}

# API
Start-Process powershell `
  -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot'; pnpm -C apps/api dev" `
  -WindowStyle Normal

# Dashboard
Start-Process powershell `
  -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot'; pnpm -C apps/dashboard dev" `
  -WindowStyle Normal

# Owner
Start-Process powershell `
  -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot'; pnpm -C apps/owner dev" `
  -WindowStyle Normal

Write-Host ""
Write-Host "Services launched." -ForegroundColor Green
Write-Host "Check the opened windows for URLs." -ForegroundColor Green
Write-Host ""
Wait-ForExit

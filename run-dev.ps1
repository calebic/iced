# Iced Dev Launcher (PowerShell)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Iced Dev Launcher (PowerShell)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Ensure we are in the repo root
Set-Location $PSScriptRoot

Write-Host "Installing dependencies (workspace root)..." -ForegroundColor Yellow
pnpm install
if ($LASTEXITCODE -ne 0) {
  Write-Host "pnpm install failed. Fix errors and re-run." -ForegroundColor Red
  pause
  exit 1
}

Write-Host ""
Write-Host "Starting services..." -ForegroundColor Green

Write-Host "Building shared package..." -ForegroundColor Yellow
pnpm -C packages/shared build
if ($LASTEXITCODE -ne 0) {
  Write-Host "Shared package build failed. Fix errors and re-run." -ForegroundColor Red
  pause
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

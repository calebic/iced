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

function Assert-PortAvailable {
  param (
    [int]$Port,
    [string]$ServiceName
  )

  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    $listener.Stop()
  } catch {
    Write-Host "$ServiceName cannot start because port $Port is already in use." -ForegroundColor Red
    Write-Host "Stop the process using port $Port and re-run the launcher." -ForegroundColor Yellow
    Wait-ForExit
    exit 1
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

Assert-PortAvailable -Port 3001 -ServiceName "Dashboard"
Assert-PortAvailable -Port 3002 -ServiceName "API"
Assert-PortAvailable -Port 3003 -ServiceName "Owner Panel"

Write-Host "Building shared package..." -ForegroundColor Yellow
pnpm -C packages/shared build
if ($LASTEXITCODE -ne 0) {
  Write-Host "Shared package build failed. Fix errors and re-run." -ForegroundColor Red
  Wait-ForExit
  exit 1
}

Write-Host "Generating Prisma client..." -ForegroundColor Yellow
$schemaPath = Join-Path $PSScriptRoot "prisma/schema.prisma"
pnpm -C apps/api exec prisma generate --schema "$schemaPath"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Prisma client generation failed. Fix errors and re-run." -ForegroundColor Red
  Write-Host "If Prisma is blocked by pnpm, run: pnpm approve-builds" -ForegroundColor Yellow
  Wait-ForExit
  exit 1
}

# API
Start-Process powershell `
  -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot'; `$env:PORT=3002; pnpm -C apps/api dev" `
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
Write-Host "Service -> URL" -ForegroundColor Green
Write-Host "Dashboard -> http://127.0.0.1:3001" -ForegroundColor Green
Write-Host "API -> http://127.0.0.1:3002" -ForegroundColor Green
Write-Host "Owner Panel -> http://127.0.0.1:3003" -ForegroundColor Green
Write-Host ""
Wait-ForExit

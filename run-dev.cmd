@echo off
setlocal

rem Start all Iced services on Windows.
cd /d %~dp0

echo ==========================================
echo   Iced Dev Launcher
echo ==========================================
echo Using pnpm for workspace installs.
echo.

start "Iced API" cmd /k "color 0B && cd /d %~dp0 && pnpm install && pnpm -C apps\api dev"
start "Iced Dashboard" cmd /k "color 0A && cd /d %~dp0 && pnpm install && pnpm -C apps\dashboard dev"
start "Iced Owner" cmd /k "color 0D && cd /d %~dp0 && pnpm install && pnpm -C apps\owner dev"

endlocal

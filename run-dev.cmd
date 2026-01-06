@echo off
setlocal

set SCRIPT_DIR=%~dp0
echo Launching Iced Dev Launcher (PowerShell)...
powershell -ExecutionPolicy Bypass -NoProfile -File "%SCRIPT_DIR%run-dev.ps1"
if errorlevel 1 (
  echo.
  echo The launcher exited with an error. Review the output above.
)
endlocal

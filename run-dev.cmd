@echo off
setlocal

rem Start all Iced services on Windows.
cd /d %~dp0

start "Iced API" cmd /k "cd /d %~dp0apps\api && npm install && npm run dev"
start "Iced Dashboard" cmd /k "cd /d %~dp0apps\dashboard && npm install && npm run dev"
start "Iced Owner" cmd /k "cd /d %~dp0apps\owner && npm install && npm run dev"

endlocal

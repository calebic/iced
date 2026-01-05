@echo off
setlocal

rem Run API tests from Windows.
cd /d %~dp0
npm --prefix apps/api test

endlocal

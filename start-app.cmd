@echo off
REM Wrapper to run PowerShell starter script. Usage: start-app.cmd [port]
set SCRIPT_DIR=%~dp0scripts
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%\start-app.ps1" %*

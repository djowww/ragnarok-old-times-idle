@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\Start-Local.ps1" -Stop
if errorlevel 1 pause

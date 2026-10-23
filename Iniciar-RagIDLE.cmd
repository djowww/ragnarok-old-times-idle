@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\Start-Local.ps1"
if errorlevel 1 pause

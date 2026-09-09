@echo off
title Agente de impresion de recetas - Ginecologia Laredo
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agente-impresion.ps1"
echo.
echo El agente se detuvo. Revisa el mensaje de arriba o el archivo impresion.log
pause

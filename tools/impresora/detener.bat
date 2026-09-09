@echo off
title Detener el agente de impresion
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0modo-oculto.ps1" -Detener

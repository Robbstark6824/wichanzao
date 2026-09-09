@echo off
title Esconder el agente de impresion
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0modo-oculto.ps1"

@echo off
REM Deja el agente SIEMPRE andando: una tarea de Windows lo arranca al prender
REM la PC, al desbloquearla y al despertar, y cada 5 minutos revisa que siga
REM vivo (si se cayo o se colgo, lo vuelve a arrancar). Todo escondido.
title Instalar agente de impresion al inicio de Windows
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 ". '%~dp0arranque-automatico.ps1'; Instalar-ArranqueAutomatico -Carpeta '%~dp0.'; Lanzar-Vigilante; Write-Host 'Listo: el agente queda siempre andando, escondido.'"

echo.
echo Para apagarlo del todo: detener.bat
pause

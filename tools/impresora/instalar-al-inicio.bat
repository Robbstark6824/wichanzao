@echo off
REM Deja un acceso directo en la carpeta de Inicio de Windows para que el
REM agente arranque solo, y escondido, cuando se prende la PC del servicio.
title Instalar agente de impresion al inicio de Windows

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Agente impresion recetas.lnk'); $s.TargetPath='%~dp0iniciar-oculto.vbs'; $s.WorkingDirectory='%~dp0'; $s.Description='Imprime las recetas enviadas desde la app (en segundo plano)'; $s.Save(); Write-Host 'Listo: el agente va a arrancar solo al iniciar Windows, sin mostrarse.'"

echo.
echo Para desinstalarlo: tecla Windows + R, escribir  shell:startup  y borrar
echo el acceso directo "Agente impresion recetas".
pause

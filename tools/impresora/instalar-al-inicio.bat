@echo off
REM Deja un acceso directo en la carpeta de Inicio de Windows para que el
REM agente arranque solo cuando se prende la PC del servicio.
title Instalar agente de impresion al inicio de Windows

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Agente impresion recetas.lnk'); $s.TargetPath='%~dp0iniciar.bat'; $s.WorkingDirectory='%~dp0'; $s.Description='Imprime las recetas enviadas desde la app'; $s.Save(); Write-Host 'Listo: el agente va a arrancar solo al iniciar Windows.'"

echo.
echo Para desinstalarlo: tecla Windows + R, escribir  shell:startup  y borrar
echo el acceso directo "Agente impresion recetas".
pause

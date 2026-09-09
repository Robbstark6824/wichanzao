' ================================================================
'  Arranca el agente de impresion SIN NINGUNA VENTANA visible.
'  No aparece nada en pantalla ni en la barra de tareas: el agente
'  queda corriendo en segundo plano igual que cualquier servicio.
'
'  Para saber si esta funcionando, abrir impresion.log.
'  Para detenerlo, usar detener.bat.
' ================================================================
Option Explicit

Dim sh, carpeta, comando
Set sh = CreateObject("WScript.Shell")

' Carpeta donde vive este script (con la barra final)
carpeta = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.CurrentDirectory = carpeta

comando = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ _
        & carpeta & "agente-impresion.ps1"" -Silencioso"

' El 0 es lo que lo hace invisible; el False es para no esperarlo.
sh.Run comando, 0, False

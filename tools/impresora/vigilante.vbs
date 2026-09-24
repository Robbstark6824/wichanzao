' ================================================================
'  Lanza vigilante.ps1 SIN VENTANA. Es lo que ejecuta el Programador
'  de tareas cada 5 minutos: si llamara a powershell directo, se veria
'  un parpadeo negro en la pantalla cada vez.
' ================================================================
Option Explicit

Dim sh, carpeta
Set sh = CreateObject("WScript.Shell")
carpeta = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.CurrentDirectory = carpeta

' 0 = invisible; True = esperar a que termine (tarda un segundo).
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ _
     & carpeta & "vigilante.ps1""", 0, True

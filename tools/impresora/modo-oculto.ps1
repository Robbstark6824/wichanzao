<#
================================================================
 MODO OCULTO — que el agente no se vea en la PC del servicio
================================================================
 Deja el agente corriendo en segundo plano, sin ventana negra ni nada
 en la barra de tareas, y hace que arranque así cada vez que se prende
 la computadora.

   ocultar.bat   -> lo esconde y lo deja andando
   detener.bat   -> lo apaga del todo (usa este script con -Detener)

 Para ver si está funcionando: abrir impresion.log, que sigue anotando
 cada receta que imprime.
================================================================
#>

param([switch]$Detener)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$Aqui  = $PSScriptRoot
$Vbs   = Join-Path $Aqui 'iniciar-oculto.vbs'
$Log   = Join-Path $Aqui 'impresion.log'
$Acceso = [Environment]::GetFolderPath('Startup') + '\Agente impresion recetas.lnk'

function Bien($t) { Write-Host "  [OK] $t" -ForegroundColor Green }
function Mal ($t) { Write-Host "  [!]  $t" -ForegroundColor Yellow }

# Mata cualquier agente que esté corriendo, visible u oculto.
function Detener-Agente {
  $n = 0
  try {
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='cmd.exe' OR Name='wscript.exe'" |
      Where-Object {
        $_.CommandLine -and (
          $_.CommandLine -like '*agente-impresion.ps1*' -or
          $_.CommandLine -like '*iniciar.bat*' -or
          $_.CommandLine -like '*iniciar-oculto.vbs*')
      } |
      ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force; $n++ } catch { } }
  } catch { Mal "No pude revisar los procesos: $($_.Exception.Message)" }
  return $n
}

Write-Host ''
if ($Detener) {
  Write-Host '  Deteniendo el agente de impresion...' -ForegroundColor Cyan
  $n = Detener-Agente
  if ($n -gt 0) { Bien "Detenido ($n proceso(s))." } else { Mal 'No habia ninguno corriendo.' }
  Write-Host ''
  Write-Host '  Ojo: mientras este detenido, lo que se mande desde la app queda' -ForegroundColor Yellow
  Write-Host '  esperando en la cola y sale todo junto cuando se vuelva a abrir.' -ForegroundColor Yellow
  Write-Host '  Para volver a arrancarlo escondido: ocultar.bat' -ForegroundColor Gray
  Write-Host ''
  Read-Host '  Enter para cerrar'
  exit 0
}

Write-Host '  =========================================================' -ForegroundColor White
Write-Host '   MODO OCULTO - el agente deja de verse en la pantalla' -ForegroundColor White
Write-Host '  =========================================================' -ForegroundColor White
Write-Host ''

if (-not (Test-Path (Join-Path $Aqui 'config.json'))) {
  Mal 'Todavia no esta configurado: corre primero INSTALAR.bat.'
  Read-Host '  Enter para cerrar'; exit 1
}

# 1. Cerrar el que este abierto ahora (la ventana negra).
$n = Detener-Agente
if ($n -gt 0) { Bien "Cerre el agente que estaba abierto ($n proceso(s))." }

# 2. Que a partir de ahora Windows lo arranque escondido.
try {
  $s = (New-Object -ComObject WScript.Shell).CreateShortcut($Acceso)
  $s.TargetPath = $Vbs
  $s.WorkingDirectory = $Aqui
  $s.Description = 'Imprime las recetas enviadas desde la app (en segundo plano)'
  $s.Save()
  Bien 'Al prender la PC va a arrancar solo, sin mostrarse.'
} catch { Mal "No pude configurar el arranque automatico: $($_.Exception.Message)" }

# 3. Arrancarlo ahora mismo, ya escondido.
$antes = 0
if (Test-Path $Log) { $antes = (Get-Item $Log).Length }
Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$Vbs`"" -WindowStyle Hidden
Write-Host '  Arrancando en segundo plano...' -ForegroundColor Gray
Start-Sleep -Seconds 10

# 4. Comprobar en el log que realmente entro.
$ok = $false
if (Test-Path $Log) {
  $ultimas = Get-Content $Log -Tail 6
  if ((Get-Item $Log).Length -gt $antes -and ($ultimas -match 'Sesi')) { $ok = $true }
  Write-Host ''
  Write-Host '  Ultimas lineas del registro:' -ForegroundColor Gray
  $ultimas | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
}

Write-Host ''
if ($ok) {
  Write-Host '  =========================================================' -ForegroundColor Green
  Write-Host '   LISTO. El agente esta corriendo y no se ve en ningun lado.' -ForegroundColor Green
  Write-Host '   Ya podes cerrar esta ventana.' -ForegroundColor Green
  Write-Host '  =========================================================' -ForegroundColor Green
} else {
  Mal 'Arranco, pero no vi la confirmacion en el registro.'
  Write-Host '       Proba mandar una receta desde el celular y volve a mirar' -ForegroundColor Yellow
  Write-Host '       impresion.log. Si nada, corre iniciar.bat para ver el error.' -ForegroundColor Yellow
}
Write-Host ''
Read-Host '  Enter para cerrar'

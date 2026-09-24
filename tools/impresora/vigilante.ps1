<#
================================================================
 VIGILANTE del agente de impresion
================================================================
 Lo lanza el Programador de tareas de Windows (tarea «Agente impresion
 recetas»): cada 5 minutos, al iniciar sesion, al desbloquear la pantalla
 y al despertar de la suspension. Tarda un segundo y se cierra.

   - Si el agente no esta corriendo  -> lo arranca (escondido).
   - Si esta corriendo pero colgado  -> lo mata y lo arranca de nuevo.
     "Colgado" = hace mas de 10 minutos que no actualiza latido.txt.
   - Si esta bien                    -> no hace nada.

 Asi el agente se instala una vez y queda andando para siempre: aunque se
 caiga internet, se suspenda la PC o se cuelgue, a los pocos minutos vuelve.
================================================================
#>

# -Tope: segundos sin latido para darlo por colgado (se cambia solo para probar).
param([int]$Tope = 600)

$ErrorActionPreference = 'Stop'
$Aqui    = $PSScriptRoot
$Latido  = Join-Path $Aqui 'latido.txt'
$LogFile = Join-Path $Aqui 'impresion.log'
$Vbs     = Join-Path $Aqui 'iniciar-oculto.vbs'

function Log([string]$Msg) {
  try {
    Add-Content -Path $LogFile -Encoding UTF8 -Value ('[{0}] [vigilante] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Msg)
  } catch { }
}

# Sin configurar todavia: no hay nada que vigilar.
if (-not (Test-Path (Join-Path $Aqui 'config.json'))) { exit 0 }

$agentes = @()
try {
  $agentes = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*agente-impresion.ps1*' })
} catch { }

$edad = [double]::MaxValue
if (Test-Path $Latido) { $edad = ((Get-Date) - (Get-Item $Latido).LastWriteTime).TotalSeconds }

if ($agentes.Count -gt 0) {
  if ($edad -lt $Tope) { exit 0 }   # vivo y trabajando

  # Recien arrancado: todavia no le dio tiempo a latir.
  $joven = $agentes | Where-Object { $_.CreationDate -and ((Get-Date) - $_.CreationDate).TotalSeconds -lt $Tope }
  if ($joven) { exit 0 }

  Log ('El agente no daba senales hace {0} min: lo reinicio.' -f [int]($edad / 60))
  foreach ($a in $agentes) { try { Stop-Process -Id $a.ProcessId -Force } catch { } }
  Start-Sleep -Seconds 2
} else {
  Log 'El agente no estaba corriendo: lo arranco.'
}

Start-Process -FilePath 'wscript.exe' -ArgumentList "//B `"$Vbs`"" -WindowStyle Hidden

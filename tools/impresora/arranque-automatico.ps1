<#
================================================================
 ARRANQUE AUTOMATICO — tarea del Programador de tareas de Windows
================================================================
 Antes el agente se arrancaba con un acceso directo en la carpeta Inicio:
 se abria UNA vez al iniciar sesion y, si despues se colgaba o se cerraba,
 nadie lo volvia a levantar. Por eso "funcionaba al instalarlo y al dia
 siguiente ya no".

 Ahora una tarea de Windows lanza el vigilante (vigilante.vbs):
   - al iniciar sesion,
   - al desbloquear la pantalla,
   - al despertar de la suspension,
   - y cada 5 minutos, siempre.
 El vigilante revisa el agente y lo revive si hace falta.

 Se usa desde instalar.ps1 y modo-oculto.ps1 (ocultar.bat / detener.bat).
================================================================
#>

$NombreTarea = 'Agente impresion recetas'

function Get-AccesoInicioViejo {
  [Environment]::GetFolderPath('Startup') + '\Agente impresion recetas.lnk'
}

function Instalar-ArranqueAutomatico {
  param([string]$Carpeta)
  $vbs     = Join-Path $Carpeta 'vigilante.vbs'
  $usuario = "$env:USERDOMAIN\$env:USERNAME"
  $inicio  = (Get-Date).AddMinutes(1).ToString('yyyy-MM-ddTHH:mm:ss')
  $uXml    = [Security.SecurityElement]::Escape($usuario)
  $vbsXml  = [Security.SecurityElement]::Escape($vbs)
  $dirXml  = [Security.SecurityElement]::Escape($Carpeta)

  $xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Mantiene andando el agente que imprime las recetas enviadas desde la app (Ginecologia Laredo). Revisa cada 5 minutos y lo revive si se cayo.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>$uXml</UserId>
    </LogonTrigger>
    <SessionStateChangeTrigger>
      <Enabled>true</Enabled>
      <StateChange>SessionUnlock</StateChange>
      <UserId>$uXml</UserId>
    </SessionStateChangeTrigger>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Subscription>&lt;QueryList&gt;&lt;Query Id="0" Path="System"&gt;&lt;Select Path="System"&gt;*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1]]&lt;/Select&gt;&lt;/Query&gt;&lt;/QueryList&gt;</Subscription>
      <Delay>PT30S</Delay>
    </EventTrigger>
    <TimeTrigger>
      <Enabled>true</Enabled>
      <StartBoundary>$inicio</StartBoundary>
      <Repetition>
        <Interval>PT5M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$uXml</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>wscript.exe</Command>
      <Arguments>//B "$vbsXml"</Arguments>
      <WorkingDirectory>$dirXml</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

  Register-ScheduledTask -TaskName $NombreTarea -Xml $xml -Force | Out-Null

  # El acceso directo viejo de la carpeta Inicio ya no hace falta: la tarea
  # hace lo mismo y ademas vigila.
  $viejo = Get-AccesoInicioViejo
  if (Test-Path $viejo) { Remove-Item $viejo -Force }
}

function Pausar-ArranqueAutomatico {
  if (Get-ScheduledTask -TaskName $NombreTarea -ErrorAction SilentlyContinue) {
    Disable-ScheduledTask -TaskName $NombreTarea | Out-Null
    return $true
  }
  return $false
}

function Reanudar-ArranqueAutomatico {
  if (Get-ScheduledTask -TaskName $NombreTarea -ErrorAction SilentlyContinue) {
    Enable-ScheduledTask -TaskName $NombreTarea | Out-Null
    return $true
  }
  return $false
}

# Cierra cualquier agente que este corriendo (por ejemplo, una version vieja
# antes de reinstalar). Devuelve cuantos cerro.
function Cerrar-Agentes {
  $n = 0
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='cmd.exe' OR Name='wscript.exe'" |
    Where-Object {
      $_.ProcessId -ne $PID -and $_.CommandLine -and (
        $_.CommandLine -like '*agente-impresion.ps1*' -or
        $_.CommandLine -like '*iniciar.bat*' -or
        $_.CommandLine -like '*iniciar-oculto.vbs*')
    } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force; $n++ } catch { } }
  return $n
}

function Lanzar-Vigilante {
  Start-ScheduledTask -TaskName $NombreTarea
}

# Que la PC no se suspenda estando enchufada: suspendida, no puede imprimir.
# La pantalla SI se puede apagar (eso no afecta). Devuelve $true si se pudo.
function Evitar-Suspension {
  $ok = $true
  foreach ($a in @('standby-timeout-ac', 'hibernate-timeout-ac')) {
    & powercfg.exe /change $a 0 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { $ok = $false }
  }
  return $ok
}

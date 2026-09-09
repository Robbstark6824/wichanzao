<#
================================================================
 INSTALADOR DEL AGENTE DE IMPRESIÓN — Ginecología Laredo
================================================================
 Hace todo lo necesario en la PC del servicio, preguntando lo mínimo:
   1. Baja SumatraPDF (para imprimir sin abrir ventanas).
   2. Pide el usuario de la app y con qué impresora imprimir.
   3. Prueba que entre bien y que la cola exista.
   4. Deja el agente arrancando solo con Windows.
================================================================
#>

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Aqui       = $PSScriptRoot
$ConfigFile = Join-Path $Aqui 'config.json'
$Ejemplo    = Join-Path $Aqui 'config.ejemplo.json'
$SumatraExe = Join-Path $Aqui 'SumatraPDF.exe'
$SumatraUrl = 'https://www.sumatrapdfreader.org/dl/rel/3.6.1/SumatraPDF-3.6.1-64.zip'

function Titulo($t) {
  Write-Host ''
  Write-Host ('  ' + $t) -ForegroundColor Cyan
  Write-Host ('  ' + ('-' * $t.Length)) -ForegroundColor DarkGray
}
function Bien($t) { Write-Host "  [OK] $t" -ForegroundColor Green }
function Mal ($t) { Write-Host "  [!]  $t" -ForegroundColor Yellow }

Clear-Host
Write-Host ''
Write-Host '  =========================================================' -ForegroundColor White
Write-Host '   AGENTE DE IMPRESION DE RECETAS - Ginecologia Laredo' -ForegroundColor White
Write-Host '   Instalacion en la PC del servicio' -ForegroundColor White
Write-Host '  =========================================================' -ForegroundColor White

# ---------------------------------------------------------------
# 1. SumatraPDF
# ---------------------------------------------------------------
Titulo '1 de 4 - Programa para imprimir (SumatraPDF)'
if (Test-Path $SumatraExe) {
  Bien 'Ya estaba instalado.'
} else {
  Write-Host '  Bajando SumatraPDF (unos 10 MB)...' -ForegroundColor Gray
  $zip = Join-Path $env:TEMP 'sumatra.zip'
  $tmp = Join-Path $env:TEMP 'sumatra_tmp'
  try {
    Invoke-WebRequest -Uri $SumatraUrl -OutFile $zip -UseBasicParsing -TimeoutSec 180
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $exe = Get-ChildItem $tmp -Filter '*.exe' -Recurse | Select-Object -First 1
    if (-not $exe) { throw 'el zip no traía el ejecutable' }
    Copy-Item $exe.FullName $SumatraExe -Force
    Bien 'SumatraPDF listo.'
  } catch {
    Mal "No se pudo bajar automaticamente ($($_.Exception.Message))."
    Write-Host '       El agente va a funcionar igual, pero por cada receta se abre' -ForegroundColor Yellow
    Write-Host '       y se cierra el visor de PDF de Windows.' -ForegroundColor Yellow
    Write-Host '       Para evitarlo: bajar la version portable de' -ForegroundColor Yellow
    Write-Host '       https://www.sumatrapdfreader.org/download-free-pdf-viewer' -ForegroundColor Yellow
    Write-Host "       y dejar el .exe en esta carpeta con el nombre SumatraPDF.exe" -ForegroundColor Yellow
  }
  foreach ($x in @($zip, $tmp)) { try { if (Test-Path $x) { Remove-Item $x -Recurse -Force } } catch { } }
}

# ---------------------------------------------------------------
# 2. Datos
# ---------------------------------------------------------------
Titulo '2 de 4 - Datos de acceso'

$cfg = Get-Content $Ejemplo -Raw -Encoding UTF8 | ConvertFrom-Json
if (Test-Path $ConfigFile) {
  $previo = Get-Content $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
  Write-Host "  Ya hay una configuracion para: $($previo.email)" -ForegroundColor Gray
  $r = Read-Host '  Volver a configurar? (s/N)'
  if ($r -notmatch '^[sS]') { $cfg = $previo }
}

if (-not $cfg.email -or $cfg.email -eq '') {
  Write-Host '  Cuenta de la app con la que el agente va a entrar.' -ForegroundColor Gray
  Write-Host '  (Conviene una cuenta dedicada, no la personal.)' -ForegroundColor DarkGray
  $cfg.email = (Read-Host '  Email').Trim()
  $sec = Read-Host '  Contrasena' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  $cfg.password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

# ---------------------------------------------------------------
# 3. Impresora
# ---------------------------------------------------------------
Titulo '3 de 4 - Impresora'
$impresoras = @()
try { $impresoras = @(Get-Printer | Select-Object -ExpandProperty Name) } catch {
  try { $impresoras = @(Get-WmiObject Win32_Printer | Select-Object -ExpandProperty Name) } catch { }
}
if ($impresoras.Count -eq 0) {
  Mal 'No pude listar las impresoras: se usa la predeterminada de Windows.'
  $cfg.impresora = ''
} else {
  Write-Host '   0) Usar la impresora predeterminada de Windows' -ForegroundColor Gray
  for ($i = 0; $i -lt $impresoras.Count; $i++) {
    Write-Host ("  {0,2}) {1}" -f ($i + 1), $impresoras[$i]) -ForegroundColor Gray
  }
  $n = Read-Host '  Numero de la impresora donde salen las recetas'
  if ($n -match '^\d+$' -and [int]$n -ge 1 -and [int]$n -le $impresoras.Count) {
    $cfg.impresora = $impresoras[[int]$n - 1]
  } else {
    $cfg.impresora = ''
  }
}
Bien ("Impresora: " + $(if ($cfg.impresora) { $cfg.impresora } else { 'la predeterminada de Windows' }))

# Guardar config.json (sin las claves de ayuda que empiezan con _)
$salida = [ordered]@{}
foreach ($p in $cfg.PSObject.Properties) { if ($p.Name -notlike '_*') { $salida[$p.Name] = $p.Value } }
($salida | ConvertTo-Json -Depth 5) | Set-Content -Path $ConfigFile -Encoding UTF8
Bien 'Configuracion guardada en config.json'

# ---------------------------------------------------------------
# 4. Prueba y arranque automático
# ---------------------------------------------------------------
Titulo '4 de 4 - Prueba'
try {
  $body = @{ email = $cfg.email; password = $cfg.password } | ConvertTo-Json -Compress
  $tok = Invoke-RestMethod -Method Post -Uri "$($cfg.url)/auth/v1/token?grant_type=password" `
           -Headers @{ apikey = $cfg.anonKey } -ContentType 'application/json' `
           -Body ([Text.Encoding]::UTF8.GetBytes($body))
  Bien "Entra bien a la app como $($cfg.email)"

  Invoke-RestMethod -Method Get -Uri "$($cfg.url)/rest/v1/impresiones?select=id&limit=1" `
    -Headers @{ apikey = $cfg.anonKey; Authorization = "Bearer $($tok.access_token)" } | Out-Null
  Bien 'La cola de impresion responde.'
} catch {
  Mal "La prueba fallo: $($_.Exception.Message)"
  Write-Host '       Revisa el email/contrasena, o que haya internet.' -ForegroundColor Yellow
  Write-Host '       Podes volver a correr este instalador cuando quieras.' -ForegroundColor Yellow
}

$r = Read-Host '  Que el agente arranque solo al prender la PC? (S/n)'
if ($r -notmatch '^[nN]') {
  try {
    $lnk = [Environment]::GetFolderPath('Startup') + '\Agente impresion recetas.lnk'
    $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
    $s.TargetPath = (Join-Path $Aqui 'iniciar.bat')
    $s.WorkingDirectory = $Aqui
    $s.Description = 'Imprime las recetas enviadas desde la app'
    $s.Save()
    Bien 'Va a arrancar solo con Windows.'
  } catch { Mal "No se pudo: $($_.Exception.Message)" }
}

Write-Host ''
Write-Host '  =========================================================' -ForegroundColor Green
Write-Host '   LISTO. Ahora se abre el agente.' -ForegroundColor Green
Write-Host '   Dejar esa ventana abierta (se puede minimizar).' -ForegroundColor Green
Write-Host '   Probalo: desde el celular, en una paciente con receta' -ForegroundColor Green
Write-Host '   generada, toca "Enviar a imprimir".' -ForegroundColor Green
Write-Host '  =========================================================' -ForegroundColor Green
Write-Host ''
Read-Host '  Enter para abrir el agente'

Start-Process -FilePath (Join-Path $Aqui 'iniciar.bat') -WorkingDirectory $Aqui

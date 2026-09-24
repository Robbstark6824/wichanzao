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
Titulo '2 de 4 - Usuario de la app'

function Set-Campo { param($o, $n, $v) $o | Add-Member -NotePropertyName $n -NotePropertyValue $v -Force }

$cfg = Get-Content $Ejemplo -Raw -Encoding UTF8 | ConvertFrom-Json
if (Test-Path $ConfigFile) {
  $previo = Get-Content $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
  Write-Host "  Ya hay una configuracion para el usuario: $($previo.usuario)" -ForegroundColor Gray
  $r = Read-Host '  Volver a configurar? (s/N)'
  if ($r -notmatch '^[sS]') {
    # Se conserva lo de esta PC (usuario, impresora...), pero la conexion
    # (url, clave, bucket) viene siempre del instalador: si Supabase cambia de
    # clave, reinstalar encima basta para ponerse al dia.
    $nuevo = $cfg
    $cfg = $previo
    foreach ($k in @('url', 'anonKey', 'bucket')) { Set-Campo $cfg $k $nuevo.$k }
  }
}

# La app no usa correos: se entra con "usuario (carpeta)" + contrasena. El
# correo real de Supabase lo arma la app como <carpeta>.<servicio>@wichanzao.local,
# y el servicio sale de la tabla workers. Acá hacemos lo mismo para no pedirle
# a nadie un dato que no conoce.
function Resolver-Correo {
  param([string]$Usuario)
  $folder = ($Usuario.Trim().ToLower() -replace '[^a-z0-9\-]', '-') -replace '-+', '-'
  $folder = $folder.Trim('-')
  if (-not $folder) { return $null }
  $w = Invoke-RestMethod -Method Get -Headers @{ apikey = $cfg.anonKey } `
        -Uri "$($cfg.url)/rest/v1/workers?folder_id=eq.$folder&select=servicio"
  if (@($w).Count -eq 0) { return $null }
  return "$folder.$(@($w)[0].servicio)@wichanzao.local"
}

if (-not $cfg.email -or $cfg.email -eq '') {
  Write-Host '  El MISMO usuario y contrasena con los que entras a la app.' -ForegroundColor Gray
  Write-Host '  (El usuario es el nombre de tu carpeta, no un correo.)' -ForegroundColor DarkGray
  while ($true) {
    $usuario = (Read-Host '  Usuario').Trim()
    $correo = $null
    try { $correo = Resolver-Correo $usuario } catch { Mal "No se pudo consultar: $($_.Exception.Message)" }
    if ($correo) {
      Set-Campo $cfg 'usuario' $usuario
      Set-Campo $cfg 'email' $correo
      Bien "Usuario encontrado."
      break
    }
    Mal "No hay ningun usuario '$usuario' en la app."
    Write-Host '       Escribilo igual que cuando entras en el celular.' -ForegroundColor Yellow
    if ((Read-Host '  Reintentar? (S/n)') -match '^[nN]') { break }
  }
  $sec = Read-Host '  Contrasena (no se ve nada al escribir, es normal)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  Set-Campo $cfg 'password' ([Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr))
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
  Set-Campo $cfg 'impresora' ''
} else {
  Write-Host '   0) Usar la impresora predeterminada de Windows' -ForegroundColor Gray
  for ($i = 0; $i -lt $impresoras.Count; $i++) {
    Write-Host ("  {0,2}) {1}" -f ($i + 1), $impresoras[$i]) -ForegroundColor Gray
  }
  $n = Read-Host '  Numero de la impresora donde salen las recetas'
  if ($n -match '^\d+$' -and [int]$n -ge 1 -and [int]$n -le $impresoras.Count) {
    Set-Campo $cfg 'impresora' $impresoras[[int]$n - 1]
  } else {
    Set-Campo $cfg 'impresora' ''
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
  Bien "Entra bien a la app como $($cfg.usuario)"

  Invoke-RestMethod -Method Get -Uri "$($cfg.url)/rest/v1/impresiones?select=id&limit=1" `
    -Headers @{ apikey = $cfg.anonKey; Authorization = "Bearer $($tok.access_token)" } | Out-Null
  Bien 'La cola de impresion responde.'
} catch {
  Mal "La prueba fallo: $($_.Exception.Message)"
  Write-Host '       Revisa el email/contrasena, o que haya internet.' -ForegroundColor Yellow
  Write-Host '       Podes volver a correr este instalador cuando quieras.' -ForegroundColor Yellow
}

# Si habia un agente corriendo (por ejemplo, la version anterior), se cierra:
# el que quede andando tiene que ser este, con esta configuracion.
. (Join-Path $Aqui 'arranque-automatico.ps1')
try { $n = Cerrar-Agentes; if ($n -gt 0) { Bien "Cerre el agente anterior ($n proceso(s))." } } catch { }

$auto = $false
$r = Read-Host '  Que el agente quede SIEMPRE andando, solo y escondido? (S/n)'
if ($r -notmatch '^[nN]') {
  try {
    Instalar-ArranqueAutomatico -Carpeta $Aqui
    $auto = $true
    Bien 'Arranca solo al prender la PC, al desbloquearla y al despertar.'
    Bien 'Cada 5 minutos se revisa: si se cayo o se colgo, vuelve solo.'
  } catch { Mal "No se pudo: $($_.Exception.Message)" }

  Write-Host ''
  Write-Host '  Si la PC se SUSPENDE, no puede imprimir hasta que alguien la despierte.' -ForegroundColor Gray
  $r2 = Read-Host '  Que no se suspenda nunca estando enchufada? (la pantalla si se apaga) (S/n)'
  if ($r2 -notmatch '^[nN]') {
    if (Evitar-Suspension) { Bien 'Listo: enchufada, ya no se suspende.' }
    else {
      Mal 'Windows no dejo cambiarlo (puede hacer falta un usuario administrador).'
      Write-Host '       A mano: Configuracion > Sistema > Energia > Suspender: Nunca.' -ForegroundColor Yellow
    }
  }
}

Write-Host ''
if ($auto) {
  $log = Join-Path $Aqui 'impresion.log'
  $antes = 0
  if (Test-Path $log) { $antes = (Get-Item $log).Length }
  try { Lanzar-Vigilante } catch { }
  Write-Host '  Arrancando en segundo plano...' -ForegroundColor Gray
  $ok = $false
  for ($i = 0; $i -lt 15 -and -not $ok; $i++) {
    Start-Sleep -Seconds 2
    if ((Test-Path $log) -and (Get-Item $log).Length -gt $antes -and ((Get-Content $log -Tail 8) -match 'Sesi')) { $ok = $true }
  }
  if ($ok) {
    Write-Host '  =========================================================' -ForegroundColor Green
    Write-Host '   LISTO. El agente ya esta andando, escondido, y queda asi' -ForegroundColor Green
    Write-Host '   para siempre: no hay que volver a tocar nada.' -ForegroundColor Green
    Write-Host '' -ForegroundColor Green
    Write-Host '   Probalo: desde el celular, en una paciente con receta,' -ForegroundColor Green
    Write-Host '   toca "Enviar a imprimir" y fijate que salga el papel.' -ForegroundColor Green
    Write-Host '  =========================================================' -ForegroundColor Green
  } else {
    Mal 'Arranco, pero todavia no vi que entrara a la app.'
    Write-Host '       Mira impresion.log en esta carpeta, o corre iniciar.bat' -ForegroundColor Yellow
    Write-Host '       (antes detener.bat) para ver el error en pantalla.' -ForegroundColor Yellow
  }
  Write-Host ''
  Read-Host '  Enter para cerrar'
} else {
  Write-Host '  Se abre el agente en una ventana para probarlo.' -ForegroundColor Green
  Read-Host '  Enter para abrir el agente'
  Start-Process -FilePath (Join-Path $Aqui 'iniciar.bat') -WorkingDirectory $Aqui
}

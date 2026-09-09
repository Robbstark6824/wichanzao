<#
================================================================
 AGENTE DE IMPRESIÓN DE RECETAS — Servicio de Ginecología, Laredo
================================================================
 Corre en la PC del servicio (la que tiene la impresora al lado).
 Cada pocos segundos mira la cola 'impresiones' de Supabase; por cada
 trabajo pendiente baja el PDF de la receta y lo manda a la impresora.

 Así, desde la app del celular —estando en cualquier lado— se toca
 «Enviar a imprimir» y la receta sale acá.

   pendiente  -> el agente lo toma      -> imprimiendo
   imprimiendo-> salió por la impresora -> impresa
                 falló algo             -> error (+ detalle en la app)

 Requisitos: Windows con PowerShell (el que ya trae) y SumatraPDF.
 Configuración: config.json (al lado de este archivo). Ver LEEME.md.
================================================================
#>

param(
  [string]$Config = "$PSScriptRoot\config.json",
  # Una sola pasada y salir (para probar que todo funciona).
  [switch]$UnaVez,
  # Corriendo sin ventana (lo usa iniciar-oculto.vbs): no hay nadie para
  # apretar Enter, así que ante un error se sale directo y queda en el log.
  [switch]$Silencioso
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
# Supabase exige TLS 1.2; Windows PowerShell 5.1 no siempre lo usa por defecto.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$LogFile = Join-Path $PSScriptRoot 'impresion.log'

function Salir($code) {
  if (-not $Silencioso) { Read-Host 'Enter para cerrar' }
  exit $code
}

function Log {
  param([string]$Msg, [string]$Color = 'Gray')
  $linea = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Msg
  Write-Host $linea -ForegroundColor $Color
  try {
    # Log chico: si pasa de 1 MB se empieza de nuevo.
    if ((Test-Path $LogFile) -and ((Get-Item $LogFile).Length -gt 1MB)) { Clear-Content $LogFile }
    Add-Content -Path $LogFile -Value $linea -Encoding UTF8
  } catch { }
}

# ---------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------
if (-not (Test-Path $Config)) {
  Log "No encuentro $Config. Copiá config.ejemplo.json a config.json y completá usuario y contraseña." 'Red'
  Salir 1
}
$cfg = Get-Content $Config -Raw -Encoding UTF8 | ConvertFrom-Json

$Url       = $cfg.url.TrimEnd('/')
$AnonKey   = $cfg.anonKey
$Bucket    = if ($cfg.bucket) { $cfg.bucket } else { 'documentos' }
$Impresora = $cfg.impresora                       # vacío = impresora predeterminada
$Intervalo = if ($cfg.intervaloSegundos) { [int]$cfg.intervaloSegundos } else { 2 }
# Cuánto esperamos a que SumatraPDF se cierre antes de dar el trabajo por
# entregado a la impresora (ver el comentario en Imprimir-Pdf).
$EsperaMs  = 1000 * $(if ($cfg.esperaImpresionSegundos) { [int]$cfg.esperaImpresionSegundos } else { 10 })
$Sumatra   = $cfg.sumatra

# La app no usa correos: se entra con "usuario (carpeta)" + contraseña, y el
# correo real se arma como <carpeta>.<servicio>@wichanzao.local. Normalmente lo
# resuelve el instalador; si alguien editó el config a mano y solo puso el
# usuario, lo deducimos acá igual que lo hace la app.
if ((-not $cfg.email -or $cfg.email -eq '') -and $cfg.usuario) {
  try {
    $folder = ($cfg.usuario.Trim().ToLower() -replace '[^a-z0-9\-]', '-') -replace '-+', '-'
    $folder = $folder.Trim('-')
    $w = Invoke-RestMethod -Method Get -Headers @{ apikey = $AnonKey } `
          -Uri "$Url/rest/v1/workers?folder_id=eq.$folder&select=servicio"
    if (@($w).Count -gt 0) {
      $cfg | Add-Member -NotePropertyName 'email' -NotePropertyValue "$folder.$(@($w)[0].servicio)@wichanzao.local" -Force
    } else {
      Log "El usuario '$($cfg.usuario)' no existe en la app." 'Red'
    }
  } catch { Log "No se pudo resolver el usuario: $($_.Exception.Message)" 'Yellow' }
}

if (-not $cfg.email -or -not $cfg.password) {
  Log 'Falta usuario/contraseña en config.json (los mismos de la app).' 'Red'
  Log 'Corré INSTALAR.bat para configurarlo.' 'Red'
  Salir 1
}

# SumatraPDF: si el config trae una ruta relativa, se busca al lado del script.
if ($Sumatra -and -not [IO.Path]::IsPathRooted($Sumatra)) {
  $cand = Join-Path $PSScriptRoot $Sumatra
  if (Test-Path $cand) { $Sumatra = $cand }
}
$HaySumatra = $Sumatra -and (Test-Path $Sumatra)
if (-not $HaySumatra) {
  Log 'Sin SumatraPDF: se usará el visor de PDF de Windows (abre una ventana por receta).' 'Yellow'
  Log 'Recomendado: bajar SumatraPDF portable y dejar SumatraPDF.exe en esta carpeta.' 'Yellow'
}

# ---------------------------------------------------------------
# Sesión: el agente entra como un trabajador más (respeta las RLS).
# ---------------------------------------------------------------
$script:Token = $null

function Iniciar-Sesion {
  $body = @{ email = $cfg.email; password = $cfg.password } | ConvertTo-Json -Compress
  $r = Invoke-RestMethod -Method Post -Uri "$Url/auth/v1/token?grant_type=password" `
        -Headers @{ apikey = $AnonKey } -ContentType 'application/json' `
        -Body ([Text.Encoding]::UTF8.GetBytes($body))
  $script:Token = $r.access_token
  Log ("Sesión iniciada como {0}" -f $(if ($cfg.usuario) { $cfg.usuario } else { $cfg.email })) 'Green'
}

# Llama a la API REST. Si el token venció (401) vuelve a entrar y reintenta.
function Api {
  param(
    [string]$Method,
    [string]$Path,
    $Body = $null,
    [hashtable]$Extra = @{}
  )
  for ($intento = 1; $intento -le 2; $intento++) {
    if (-not $script:Token) { Iniciar-Sesion }
    $h = @{ apikey = $AnonKey; Authorization = "Bearer $($script:Token)" }
    foreach ($k in $Extra.Keys) { $h[$k] = $Extra[$k] }
    try {
      if ($null -ne $Body) {
        $json = $Body | ConvertTo-Json -Compress
        return Invoke-RestMethod -Method $Method -Uri "$Url$Path" -Headers $h `
                 -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($json))
      }
      return Invoke-RestMethod -Method $Method -Uri "$Url$Path" -Headers $h
    } catch {
      $code = $null
      if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      if ($code -eq 401 -and $intento -eq 1) { $script:Token = $null; continue }
      throw
    }
  }
}

function Ahora { (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }

function Marcar {
  param([string]$Id, [hashtable]$Campos)
  Api 'Patch' "/rest/v1/impresiones?id=eq.$Id" $Campos @{ Prefer = 'return=minimal' } | Out-Null
}

# ---------------------------------------------------------------
# Impresión de un PDF ya bajado
# ---------------------------------------------------------------
function Imprimir-Pdf {
  param([string]$Archivo, [int]$Copias = 1)

  if ($HaySumatra) {
    # OJO: -ArgumentList con un array NO entrecomilla los elementos que tienen
    # espacios, y TODOS los nombres de impresora los tienen ("EPSON L3250
    # Series"). SumatraPDF recibía el nombre partido y salía con código 3.
    # Por eso se arma una sola línea con las comillas puestas a mano.
    $ar = if ($Impresora) { '-print-to "{0}"' -f $Impresora } else { '-print-to-default' }
    if ($Copias -gt 1) { $ar += ' -print-settings "{0}x"' -f $Copias }
    $ar += ' -silent -exit-when-done "{0}"' -f $Archivo

    # SumatraPDF con -exit-when-done no se cierra hasta que la cola de Windows
    # da por terminado el trabajo, y con una impresora de red eso tarda un par
    # de minutos aunque el papel ya haya salido. Esperarlo hacía que en el
    # celular quedara «Imprimiendo…» un rato largo de más.
    # Lo que falla de verdad (impresora inexistente, PDF ilegible) falla en un
    # segundo; si sigue vivo pasada la espera, es que el trabajo ya está en la
    # impresora y solo queda el spooler. Ahí seguimos y avisamos «impresa».
    $p = Start-Process -FilePath $Sumatra -ArgumentList $ar -PassThru -WindowStyle Hidden
    if (-not $p.WaitForExit($EsperaMs)) {
      Log '  (ya está en la impresora; SumatraPDF sigue esperando al spooler)' 'DarkGray'
      return
    }
    if ($p.ExitCode -ne 0) {
      # Mensajes en criollo, que es lo que se ve en el celular.
      $pista = switch ($p.ExitCode) {
        1 { if ($Impresora) { "no encontró la impresora «$Impresora»" } else { 'no encontró la impresora predeterminada' } }
        2 { 'no pudo leer el PDF de la receta' }
        3 { 'el nombre de la impresora llegó mal' }
        default { "código $($p.ExitCode)" }
      }
      throw "No se pudo imprimir: $pista"
    }
    return
  }

  # Sin SumatraPDF: verbo Print del visor de PDF asociado en Windows.
  for ($i = 0; $i -lt $Copias; $i++) {
    $p = Start-Process -FilePath $Archivo -Verb Print -PassThru
    Start-Sleep -Seconds 8                       # darle tiempo a mandar el trabajo
    if ($p -and -not $p.HasExited) { try { $p.CloseMainWindow() | Out-Null } catch { } }
  }
}

# ---------------------------------------------------------------
# Un trabajo de la cola
# ---------------------------------------------------------------
function Procesar {
  param($t)

  $etiqueta = if ($t.etiqueta) { $t.etiqueta } else { $t.objeto }

  # Tomarlo: el filtro estado=eq.pendiente evita que dos agentes impriman lo mismo.
  $tomado = Api 'Patch' "/rest/v1/impresiones?id=eq.$($t.id)&estado=eq.pendiente" `
              @{ estado = 'imprimiendo'; tomado_at = (Ahora) } @{ Prefer = 'return=representation' }
  if (-not $tomado -or $tomado.Count -eq 0) { return }   # lo tomó otro, o se canceló

  Log "-> $etiqueta" 'Cyan'
  $tmp = Join-Path $env:TEMP ("receta_{0}.pdf" -f $t.id)
  try {
    $nombre = if ($t.nombre_archivo) { $t.nombre_archivo } else { 'receta.pdf' }
    $src = "$Url/storage/v1/object/public/$Bucket/$($t.objeto)"
    Invoke-WebRequest -Uri $src -OutFile $tmp -UseBasicParsing -TimeoutSec 60 | Out-Null
    if (-not (Test-Path $tmp) -or (Get-Item $tmp).Length -lt 500) { throw 'El PDF bajó vacío o incompleto' }

    $copias = if ($t.copias) { [int]$t.copias } else { 1 }
    Imprimir-Pdf -Archivo $tmp -Copias $copias

    $imp = if ($Impresora) { $Impresora } else { 'predeterminada' }
    Marcar $t.id @{ estado = 'impresa'; impresa_at = (Ahora); impresora = $imp; detalle_error = $null }
    Log "  [OK] impresa ($nombre)" 'Green'
  } catch {
    $msg = $_.Exception.Message
    if ($msg.Length -gt 300) { $msg = $msg.Substring(0, 300) }
    try { Marcar $t.id @{ estado = 'error'; detalle_error = $msg } } catch { }
    Log "  [X] error: $msg" 'Red'
  } finally {
    # Si SumatraPDF todavía tiene el PDF abierto, Windows no deja borrarlo:
    # queda para la limpieza de abajo, que barre los de impresiones anteriores.
    try { if (Test-Path $tmp) { Remove-Item $tmp -Force } } catch { }
    try {
      Get-ChildItem $env:TEMP -Filter 'receta_*.pdf' |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddMinutes(-15) } |
        ForEach-Object { try { Remove-Item $_.FullName -Force } catch { } }
    } catch { }
  }
}

# Trabajos que quedaron colgados en 'imprimiendo' (por ejemplo, si se cortó la
# luz en medio): pasados 10 minutos vuelven a la cola.
function Rescatar-Colgados {
  $limite = (Get-Date).ToUniversalTime().AddMinutes(-10).ToString('yyyy-MM-ddTHH:mm:ssZ')
  try {
    $r = Api 'Patch' "/rest/v1/impresiones?estado=eq.imprimiendo&tomado_at=lt.$limite" `
           @{ estado = 'pendiente'; tomado_at = $null } @{ Prefer = 'return=representation' }
    if ($r -and $r.Count -gt 0) { Log "$($r.Count) trabajo(s) colgado(s) devueltos a la cola" 'Yellow' }
  } catch { }
}

# ---------------------------------------------------------------
# Bucle principal
# ---------------------------------------------------------------
Log '=========================================================' 'White'
Log 'Agente de impresión de recetas — Ginecología Laredo' 'White'
Log ("Impresora: {0} - revisa cada {1}s" -f $(if ($Impresora) { $Impresora } else { 'predeterminada de Windows' }), $Intervalo) 'White'
Log 'Dejá esta ventana abierta. Ctrl+C para cerrar.' 'White'
Log '=========================================================' 'White'

Iniciar-Sesion
Rescatar-Colgados

$fallos = 0
while ($true) {
  $hubo = $false
  try {
    $pendientes = Api 'Get' '/rest/v1/impresiones?estado=eq.pendiente&order=solicitado_at.asc&limit=5'
    $fallos = 0
    foreach ($t in $pendientes) { $hubo = $true; Procesar $t }
  } catch {
    $fallos++
    # No spamear el log si se cayó internet: avisar la primera vez y cada 20 vueltas.
    if ($fallos -eq 1 -or $fallos % 20 -eq 0) {
      Log "Sin conexión con Supabase ($($_.Exception.Message))" 'Yellow'
    }
    $script:Token = $null
  }
  if ($UnaVez) { Log 'Pasada única terminada.' 'White'; break }
  # Si acabamos de imprimir algo, mirar de nuevo enseguida: varias recetas
  # mandadas una atrás de otra salen sin espera entre medio.
  if (-not $hubo) { Start-Sleep -Seconds $Intervalo }
}

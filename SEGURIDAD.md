# Seguridad — estado, decisiones y pendientes

Última revisión: 2026-10-06. Datos de pacientes: DNI, nombres, teléfonos y
diagnósticos. Tratar todo lo de aquí como información sensible.

## Cómo está protegido hoy

- **Cuentas.** Supabase Auth. Una cuenta nueva debe ser **aprobada** antes de
  poder usar la app.
- **Base de datos.** Row Level Security en las tablas. Un usuario no autenticado
  recibe 401 en `pacientes`, `historial_estados`, `recetas_plantillas` y sus
  historiales.
- **Claves de API.** La app usa la clave **publishable** (`sb_publishable_…`),
  pública por diseño. Las herramientas y el Apps Script usan una **secret key**
  (`sb_secret_…`) que vive solo en el `.env` local y en las propiedades del
  Apps Script. Las claves JWT antiguas (`anon` y `service_role`) están
  **desactivadas** desde 2026-10-06.
- **Apps Script.** Escribir, borrar, sincronizar y exportar exigen la sesión de
  un usuario aprobado y con permiso sobre el servicio. El paciente se lee de la
  base, no de lo que manda el teléfono.
- **Respaldo.** Nocturno, con espejo de archivos, fuera del repositorio.

## Incidente cerrado: secretos en el historial público (2026-10-06)

El repositorio fue público y su historial contenía:

- la contraseña de Postgres (6 commits y un archivo vigente),
- la clave `service_role` de Supabase (vigencia hasta 2036).

Acciones tomadas: contraseña de la base cambiada; claves JWT legacy desactivadas
(la `service_role` filtrada responde 401); el código ya no contiene
contraseñas; los nombres y DNI reales de pacientes fueron sustituidos por datos
ficticios. **El historial anterior de git conserva todo lo anterior**, por lo
que la versión entregada se genera **sin historial** (ver "Entrega").

## Decisiones y riesgos conocidos

### 1. La hoja antigua de Google está publicada en la web — PENDIENTE
Cualquiera con el enlace puede descargarla como CSV sin iniciar sesión (verificado
2026-10-06: HTTP 200, ~230 filas con nombres, DNI y teléfonos). **La app ya no la
lee** (la lectura ocurre dentro del Apps Script), así que cerrarla no rompe la
app. Para cerrarla: en la hoja, *Compartir → Acceso general → Restringido*, y
*Archivo → Compartir → Publicar en la web → Dejar de publicar*. Algunas
herramientas de `tools/` que descargan ese CSV dejarán de funcionar y habrá que
leerlas por el Apps Script.

### 2. El token `WZ-GERESA-…` es público — ACEPTADO, documentado
Está escrito en `index.html` (`QX_SHEET_TOKEN`) y en el Apps Script (`TOKEN`).
**No es un secreto** y no se debe tratar como tal. La seguridad real es la sesión
del usuario. Con solo el token se puede consultar `estado` (hora de la última
sincronización y un contador, sin datos de pacientes); borrar, escribir,
sincronizar y exportar responden "falta la sesión". Mejora posible: quitar el
token de la app y del script. Requiere publicar el Apps Script y la app a la vez.

### 3. `doGet` del Apps Script no pide autenticación — ACEPTADO, documentado
Devuelve cuántos pacientes hay en la hoja (`total`). No expone nombres ni DNI.
Mejora posible: que devuelva solo `{ok:true}`.

### 4. Lectura anónima de cinco columnas de `workers` — INTENCIONAL, revisable
Sin sesión, la clave pública puede leer `id`, `folder_id`, `name`, `servicio` y
`area` de `workers` (nombres del personal). Es deliberado: lo necesitan el inicio
de sesión y el registro (`sql/004-rls-workers.sql`); `is_admin`, el correo y el
rol quedan fuera de los permisos. Si la Red no quiere exponer ni los nombres,
habría que cambiar el flujo de entrada para que no los lea antes de autenticarse.

### 5. Tablas legibles sin sesión
`servicios` (catálogo) e `impresiones` (hoy sin filas). La primera es un
catálogo sin datos personales; revisar `impresiones` si algún día contiene filas.

### 6. El bucket de Storage `documentos` es público — A DECIDIR (hallazgo del esquema)
`sql/esquema/esquema-actual.sql` declara el bucket con `public = true`. Quien
conozca la dirección exacta de un archivo puede descargarlo **sin iniciar sesión**.
Hoy lo mitigan dos cosas: el listado del bucket está cerrado (sin sesión devuelve
`[]`) y los archivos de pacientes (recetas en PDF, carpetas de hospitalización) se
nombran con UUID, imposibles de adivinar. Pero es seguridad por oscuridad: si una
dirección se filtra (un chat, un historial del navegador, un registro), el archivo
queda abierto para siempre. En el mismo bucket están las recetas y también los
instaladores de `herramientas/`, que sí deben ser descargables. Mejora
recomendada: bucket **privado** con URL firmadas y de corta duración, y los
instaladores en un bucket aparte. Cambia cómo la app muestra y descarga archivos,
así que requiere pruebas.

### 7. Funciones que un usuario sin sesión puede ejecutar — REVISADO en parte
El esquema marca, función por función, cuáles puede ejecutar `anon`. Las
`SECURITY DEFINER` corren con los permisos de su dueño, por eso importa que
validen quién llama:
- `admin_delete_worker`: **verificado**. Comprueba `is_admin()` antes de hacer
  nada; sin sesión falla con "No autorizado". Aun así, `anon` no necesita poder
  ejecutarla (`REVOKE EXECUTE … FROM anon`).
- `check_service_code(servicio, codigo)`: **riesgo**. Devuelve si un código de
  servicio es correcto y cualquiera puede llamarla sin límite de intentos: sirve
  para adivinar los códigos de registro por fuerza bruta. Lo mitiga que una cuenta
  nueva necesita aprobación de un administrador. Mejora: limitar intentos o mover
  la comprobación a un servidor.
- `es_jefe_info`, `estoy_aprobado`, `is_admin`, `mi_servicio`, `puede_editar_servicio`,
  `puede_ver_servicio`: leen `auth.uid()`, que sin sesión es nulo, y devuelven
  "no". No se revisó el cuerpo de las demás con el mismo detalle.

### 8. Historial de git
Los commits anteriores a la limpieza contienen nombres y DNI de pacientes
reales y contraseñas ya inválidas. No difundir el repositorio original.

## Rotar claves (procedimiento)

1. **Contraseña de Postgres.** Supabase → Database → Settings → *Reset database
   password*. Actualizar `SUPABASE_DB_PASSWORD` en `.env`. Probar con
   `node tools/respaldo-bd.mjs`.
2. **Secret key.** Supabase → Project Settings → API Keys → crear una nueva
   *secret key*. Actualizar `SUPABASE_SERVICE_ROLE_KEY` en `.env` y la propiedad
   `SUPABASE_KEY` del Apps Script (pegarla en `guardarClaveSupabase`, ejecutarla
   y **borrarla del código**; comprobar con `comprobarClave`). Revocar la anterior.
3. **Agente de impresión.** `tools/impresora/config.json` (lleva la contraseña de
   la cuenta que imprime; no se sube a git).
4. Si se sospecha una filtración: rotar primero, investigar después.

## Reglas para quien mantenga el código

- Ningún secreto en el repositorio, ni "temporalmente". El `.env` está ignorado.
- Ningún dato real de pacientes en pruebas, comentarios ni nombres de archivo.
- El respaldo y cualquier exportación van **fuera** del repositorio.
- Antes de hacer público cualquier repositorio o carpeta: buscar claves
  (`eyJ…`, `sb_secret_`, `password`) y DNI.

## Entrega

La copia entregada se genera con `git archive` desde un commit limpio, **sin
historial**, para que no arrastre los commits anteriores. No entregar la carpeta
de trabajo comprimida: contiene archivos locales ignorados por git (por ejemplo
exportaciones de la hoja con datos de pacientes).

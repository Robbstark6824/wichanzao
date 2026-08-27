# Despliegue — Sincronizar a la hoja OFICIAL GERESA (además de la antigua)

Ahora **un solo Apps Script escribe a las DOS hojas** a la vez. La app **NO cambia de URL**:
sigue apuntando al mismo `/exec` (variable `QX_SHEET_URL` de `index.html`). El script ya
recibe el paciente completo y decide qué escribir en cada hoja.

## 1) Crear las columnas nuevas en Supabase

Ejecutar en **Supabase Dashboard → SQL Editor**:

```sql
-- contenido de: sql/019-campos-geresa-oficial.sql
```

Agrega `detalle_suspension`, `lugar_cirugia` y `observacion` a `public.pacientes`.

## 2) La hoja OFICIAL (la nueva) — NO borres nada

**No borres ninguna fila.** Las filas que ya tiene la hoja son **datos oficiales**:
hay pacientes de otras especialidades y también pacientes nuestras que solo falta
completar con los datos nuevos que pide GERESA.

El script **no borra ni reemplaza**: hace *upsert*:
- Si encuentra a la paciente por **DNI** (o por nombre en una fila aún sin DNI),
  **actualiza esa misma fila** completando los datos que faltan.
- Si no la encuentra, **inserta en la primera fila vacía** de abajo.

Así que la hoja se deja **exactamente como está**. Los pacientes que ya existen en la
hoja antigua aparecerán en la oficial cuando la app los vuelva a guardar/editar
(y luego se pueden migrar en lote, ver más abajo).

## 3) Actualizar el Apps Script (sin romper el acceso público)

**No crees un proyecto nuevo.** El memory `geresa-sheets-deploy` lo resume: hay 2 proyectos
y debes actualizar el **antiguo** para conservar la URL `/exec`.

1. Abre la hoja **antigua** (la que ya usas, `SS_ID`).
2. Extensiones → Apps Script.
3. Borra TODO el contenido y pega el nuevo `google/apps-script-sync.gs`.
4. Revisa arriba las constantes:
   - `SS_ID`, `SHEET_NAME` (hoja antigua).
   - `SS_ID_2`, `SHEET_NAME_2` (hoja oficial nueva).
   - `TOKEN` (debe ser igual a `QX_SHEET_TOKEN` de la app).
5. Guarda (Ctrl+S).
6. **Desplegar → Administrar implementaciones → ✏️ Editar → "Nueva versión"**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
7. La URL `/exec` **no cambia**; la app sigue funcionando igual.

## 4) Dar permiso de edición a la cuenta del script sobre la hoja NUEVA

La cuenta de Google que ejecuta el Apps Script (la tuya, "Ejecutar como: Yo") debe poder
editar la hoja oficial. Comparte la hoja nueva con tu propia cuenta (Editor), o asegúrate
de que el script use una cuenta con acceso de edición a ambas hojas.

> Si el script devuelve `oficial: { ok:false, error:"No se encontró la pestaña..." }` o
> un error de permisos, es porque esa cuenta no ve/edita la hoja nueva.

## 5) Probar

1. En el editor de Apps Script, ejecuta `test()` (Ejecutar → test). Debe escribir el
   paciente de prueba en **ambas** hojas.
2. Desde la app, registra/edita una paciente y verifica que aparezca en la pestaña
   `LISTA_ESPERA_QX` de la hoja nueva **y** en la hoja antigua.

## 6) Migrar en lote las pacientes que ya existen (opcional)

La sync solo dispara cuando la app **guarda/edita** a una paciente. Para que TODAS las
pacientes que ya tienes en la hoja antigua (y en Supabase) aparezcan en la oficial **sin
abrirlas una por una**, hay que re-enviarlas en lote al `/exec`:

- Claude puede hacerlo por ti: lee todas las pacientes de ginecología desde Supabase y
  hace un `POST` al endpoint por cada una. El script hace *upsert*, así que:
  - Las que ya estén en la oficial por DNI → se actualizan (se completan datos).
  - Las que no → se insertan en filas vacías.
  - Las de **otras especialidades** que ya están en la hoja → **no se tocan**.

Esto se hace **después** de desplegar el script nuevo (paso 3), porque el `/exec` debe
estar corriendo el código que escribe a las dos hojas.

## Cómo se llena cada columna (resumen)

- **Establecimiento destino** = `HOSPITAL DISTRITAL LAREDO` · código `00005231` · red `TRUJILLO`.
- **Origen** = por defecto `N.A. - Paciente propio / no referido` (código vacío). Si refiere
  otro establecimiento, se usa el texto que escribas en la app (idealmente el nombre exacto
  de `CAT_ORIGEN`).
- **Género** `Femenino/Masculino`, **seguro** `SIS/FISSAL/ESSALUD/Particular/Otro`,
  **nivel** `Mayor/Menor`, **anestesia** `Regional/General` o `Local` — la app captura un
  nivel más fino (REGIONAL/GENERAL/COMBINADA/RAQUÍDEA…) y el script lo traduce al catálogo oficial.
- **Estado actual**: `Operado` / `Suspendido` / `Cerrado sin cirugía` / `En lista de espera`
  según el estado de la app.
- **Suspensión**: motivo (desplegable de 13 opciones) + detalle (`detalle_suspension`).
- **Cierre**: se llena solo al operar (`Cirugía realizada`) o referir (`Salida de lista sin cirugía`),
  con fecha, lugar de cirugía (`lugar_cirugia`) y observaciones (`observacion`).

## Campos obligatorios (según DICCIONARIO_DATOS de la hoja oficial)

La app los marca con asterisco y **no deja guardar** sin ellos:

| Campo GERESA | Dónde se captura | Regla |
|---|---|---|
| Establecimiento quirúrgico destino | Asistente · paso 1 | siempre (viene con el valor fijo del hospital) |
| Establecimiento origen que refiere | Asistente · paso 1 (buscador CAT_ORIGEN) | siempre (`N.A.` si es propia) |
| DNI **o** N° historia clínica | Asistente · paso 1 | la app exige DNI, que además es la llave del *upsert* |
| CIE-10 principal | Asistente · paso 2 | siempre |
| Diagnóstico principal | Asistente · paso 2 | siempre |
| Procedimiento quirúrgico propuesto | Asistente · paso 3 | siempre |
| Tipo de anestesia | Asistente · paso 3 | siempre |
| ¿Aplica diagnóstico por imágenes? | Asistente · paso 4 | siempre |
| F. primera evaluación por cirugía | Asistente · paso 4 | siempre |
| Fecha referencia aceptada | Asistente · paso 1 | **solo si** el origen es una IPRESS real |
| F. diagnóstico por imágenes | Asistente · paso 4 | **solo si** aplica imágenes = Sí |
| Fecha programación quirúrgica | Asistente · paso 6 | **solo si** el estado es Programado |
| Estado de programación · Estado actual · Resultado eval. preoperatoria · Tipo/motivo cierre | — | los deriva el Apps Script del estado de la paciente |

Marcador rojo `*` = obligatorio siempre · ámbar `*` = obligatorio condicional.
Las reglas viven en `QX_GERESA_OBLIG` (index.html); si GERESA cambia el diccionario,
se edita esa lista y nada más.

## Un dato, la hoja que corresponda

Los valores se escriben por **nombre de encabezado**, no por posición
(`upsert()` → `for (var key in values) { var col = colMap[key]; if (!col) continue; }`).
Consecuencia práctica: cada hoja recibe solo las columnas que realmente tiene.

- La hoja **antigua** tiene 47 columnas; la **oficial**, 56. La antigua es un
  subconjunto exacto de la oficial.
- Las 9 columnas que solo existen en la oficial son las de cierre:
  `Fecha suspensión`, `Motivo suspensión`, `Detalle motivo suspensión`,
  `Tipo cierre`, `Motivo cierre`, `Fecha cierre`, `Fecha real de operación`,
  `Lugar/IPRESS donde se realizó la cirugía` y `Observación`.
- Por eso `buildValuesOld()` ni las calcula: si se colaran, la escritura las
  ignoraría igual. Agregar un campo nuevo a una sola hoja no rompe la otra.
- `Observación` (solo oficial) recoge lo que la app captura y el formato no
  tiene dónde poner: el hospital al que se refirió a la paciente y el motivo
  escrito a mano al cerrar el caso.

## Columnas que la app NO captura (porque no aplican a ginecología o las calcula el aplicativo)

Los "campos calculados" (fecha base de oportunidad, días, vigencia, prioridad, calidad de
datos) los calcula el aplicativo de GERESA, **no se escriben** — así lo indica el
`INSTRUCTIVO` de la propia hoja.

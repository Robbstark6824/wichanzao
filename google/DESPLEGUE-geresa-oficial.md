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

## 2) Preparar la hoja OFICIAL (la nueva)

1. Abre la hoja nueva:
   `https://docs.google.com/spreadsheets/d/1IoT5KGuTcT83ZLyHh4SrLR4yhbFjIKkI`
2. Pestaña `LISTA_ESPERA_QX`.
3. **Borra todas las filas de ejemplo** (filas 4 a 95). Son 16 pacientes de muestra
   (Cirugía General) + filas vacías pre-numeradas con IDs. Deben quedar **solo los
   encabezados** (fila 3) y nada más abajo.
   - Nota: la fila 20 trae `HOSPITAL DISTRITAL LAREDO` pre-llenado en la columna B;
     bórrala también para que el primer paciente caiga limpio.
4. No toques los encabezados ni las pestañas `CATALOGOS`, `CAT_ORIGEN`, `CAT_DESTINO`,
   `DICCIONARIO_DATOS`, etc.

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

## Columnas que la app NO captura (porque no aplican a ginecología o las calcula el aplicativo)

Los "campos calculados" (fecha base de oportunidad, días, vigencia, prioridad, calidad de
datos) los calcula el aplicativo de GERESA, **no se escriben** — así lo indica el
`INSTRUCTIVO` de la propia hoja.

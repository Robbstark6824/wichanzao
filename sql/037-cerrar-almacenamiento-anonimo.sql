-- ============================================================
-- 037 · Cerrar el almacenamiento a quien no ha iniciado sesión
-- ============================================================
-- El bucket `documentos` tenía políticas para el rol `anon` (cualquiera que
-- abra la app, o que lea la clave pública de index.html) de las dashboards
-- viejas:
--     INSERT  "Subir archivos"        → subir cualquier archivo
--     UPDATE  "Actualizar archivos"   → sobrescribir los que hay
--     DELETE  "Eliminar solo fechas"  → borrar las carpetas de fechas
--     SELECT  (3 políticas)           → LISTAR todo el bucket
-- Con eso alguien sin cuenta podía cambiar o borrar documentos escaneados y
-- recetas, y enumerar todos los nombres.
--
-- Se quitan las seis. Lo que NO cambia:
--   · Los usuarios con sesión conservan allow_select / insert / update /
--     delete (todo el uso normal de la app, el panel de PC y el admin).
--   · Los archivos siguen descargándose por su enlace (el bucket sigue
--     siendo público): miniaturas, recetas, el instalador del agente y el
--     agente de impresión NO se enteran. Lo que se cierra es escribir y listar.
--   · service_role ("Admin full access"): sin cambios (respaldos, scripts).
--
-- Cerrar también la LECTURA por enlace (bucket privado + enlaces firmados)
-- es un cambio mayor que toca la app, el panel y el agente: aparte.
-- Revertir: 037-cerrar-almacenamiento-anonimo-REVERTIR.sql
-- ============================================================
BEGIN;

DROP POLICY IF EXISTS "Subir archivos 1ljx2yn_0"      ON storage.objects;
DROP POLICY IF EXISTS "Actualizar archivos 1ljx2yn_0" ON storage.objects;
DROP POLICY IF EXISTS "Actualizar archivos 1ljx2yn_1" ON storage.objects;
DROP POLICY IF EXISTS "Eliminar solo fechas 1ljx2yn_0" ON storage.objects;
DROP POLICY IF EXISTS "Eliminar solo fechas 1ljx2yn_1" ON storage.objects;
DROP POLICY IF EXISTS "Lectura publica 1ljx2yn_0"     ON storage.objects;

COMMIT;

SELECT policyname, cmd, roles FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname;

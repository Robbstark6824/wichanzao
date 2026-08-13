-- ============================================================
-- MÓDULO HOSPITALIZACIÓN ELIMINADO — Drop de tablas
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Drop en orden de dependencias (hijos primero).
-- Al hacer DROP TABLE, Postgres quita automáticamente la tabla
-- de la publicación realtime, así que no hace falta ALTER PUBLICATION.
-- Las políticas RLS e índices asociados se eliminan junto con la tabla.

DROP TABLE IF EXISTS public.evoluciones;
DROP TABLE IF EXISTS public.ingresos;
DROP TABLE IF EXISTS public.pacientes;
DROP TABLE IF EXISTS public.servicios;

-- Nota: No borra los archivos de Storage (fotos bajo la carpeta 'hospi/…');
-- esa limpieza es manual desde Supabase → Storage.

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT '✅ Tablas eliminadas:' AS status;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('servicios','pacientes','ingresos','evoluciones');
-- (debe devolver 0 filas)

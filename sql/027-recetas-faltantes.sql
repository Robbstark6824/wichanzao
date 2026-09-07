-- ============================================================
-- RECETA COMPLEMENTARIA — ítems que farmacia no tiene (v16)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Circuito real: se imprime la receta completa → farmacia marca qué NO hay →
-- se arma a mano una segunda receta solo con lo que falta y cubre el seguro.
-- Esa segunda receta ahora la genera la app.
--
--   1) receta_faltantes     — lista de ítems marcados como faltantes en la
--                             última generación de la receta complementaria.
--                             JSON: [{ "txt": "...", "cant": "..." }, ...]
--                             Sirve para re-abrir y regenerar sin volver a
--                             tildar todo.
--   2) receta_faltantes_at  — cuándo se generó/subió el PDF complementario
--                             (storage: documentos/recetas/<id>-2.pdf).
--                             NULL = todavía no se hizo.
--
-- Ninguno de los dos va a las hojas de Google (GERESA). Son exclusivos de la app.
-- ============================================================

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS receta_faltantes     JSONB,
  ADD COLUMN IF NOT EXISTS receta_faltantes_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.pacientes.receta_faltantes IS
  'Ítems marcados como no disponibles en farmacia para la receta complementaria: JSON [{txt,cant}]. Solo la app.';
COMMENT ON COLUMN public.pacientes.receta_faltantes_at IS
  'Última generación del PDF complementario (storage: documentos/recetas/<id>-2.pdf). NULL = nunca. Solo la app.';

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'pacientes'
   AND column_name IN ('receta_faltantes', 'receta_faltantes_at')
 ORDER BY column_name;

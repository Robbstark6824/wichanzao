-- ============================================================
-- MÓDULO PROGRAMACIÓN QUIRÚRGICA — v11 (campos para el formato oficial GERESA)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- El formato oficial GERESA ("MATRIZ NOMINAL REGIONAL DE LISTA DE
-- ESPERA QUIRÚRGICA") exige capturar, además de lo ya existente:
--   1) detalle_suspension  — texto libre complementario del motivo de suspensión
--   2) lugar_cirugia       — lugar donde se realizó la cirugía (IPRESS u otro)
--   3) observacion         — observaciones generales del registro
-- Estos tres campos son editables en la app y se escriben tal cual a la hoja.

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS detalle_suspension TEXT,
  ADD COLUMN IF NOT EXISTS lugar_cirugia       TEXT,
  ADD COLUMN IF NOT EXISTS observacion         TEXT;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pacientes'
  AND column_name IN ('detalle_suspension','lugar_cirugia','observacion')
ORDER BY column_name;

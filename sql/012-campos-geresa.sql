-- ============================================================
-- MÓDULO PROGRAMACIÓN QUIRÚRGICA — v6 (campos reporte GERESA)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Agrega a public.pacientes los campos que pide el reporte oficial
-- GERESA ("FILA AZUL") y que la app aún no capturaba:
--   1) cie10             — CIE-10 principal del diagnóstico
--   2) procedimiento     — procedimiento quirúrgico propuesto
--   3) tipo_seguro       — SIS / ESSALUD / SOAT / Particular / Otro
--   4) tipo_anestesia    — Regional / General / Local / Combinada
--   5) nivel_cirugia     — Menor / Mayor / Alta complejidad

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS cie10           VARCHAR(20),
  ADD COLUMN IF NOT EXISTS procedimiento   TEXT,
  ADD COLUMN IF NOT EXISTS tipo_seguro     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tipo_anestesia  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS nivel_cirugia   VARCHAR(30);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pacientes'
  AND column_name IN ('cie10','procedimiento','tipo_seguro','tipo_anestesia','nivel_cirugia')
ORDER BY column_name;

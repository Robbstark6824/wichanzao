-- ============================================================
-- MÓDULO PROGRAMACIÓN QUIRÚRGICA — v3 (rastreo y captación)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Captación: fecha, interno de medicina y doctor que captaron
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS fecha_captacion  DATE,
  ADD COLUMN IF NOT EXISTS interno_medicina VARCHAR(200),
  ADD COLUMN IF NOT EXISTS doctor           VARCHAR(200);

-- 2. Rastreo por fase: fecha/hora en que se completó cada fase
--    (Fase 6 = fecha_hospitalizacion, Fase 7 = fecha_resolucion, ya existen)
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS fecha_fase2 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_fase3 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_fase4 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_fase5 TIMESTAMPTZ;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pacientes'
  AND column_name IN ('fecha_captacion','interno_medicina','doctor',
                      'fecha_fase2','fecha_fase3','fecha_fase4','fecha_fase5')
ORDER BY column_name;

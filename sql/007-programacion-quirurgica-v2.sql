-- ============================================================
-- MÓDULO PROGRAMACIÓN QUIRÚRGICA — v2 (ajustes)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Fase 3: hora de las citas (además de la fecha) y teléfono
--    de contacto para llamar al llegar al hospital.
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS hora_cita_cardiologia    TIME,
  ADD COLUMN IF NOT EXISTS hora_cita_anestesiologia TIME,
  ADD COLUMN IF NOT EXISTS telefono_contacto        VARCHAR(20);

-- 2. Fase 4: recetas entregadas (nuevo check de pre-hospitalización)
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS recetas_entregadas BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pacientes'
  AND column_name IN ('hora_cita_cardiologia','hora_cita_anestesiologia','telefono_contacto','recetas_entregadas')
ORDER BY column_name;

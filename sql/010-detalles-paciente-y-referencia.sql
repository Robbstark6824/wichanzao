-- ============================================================
-- DETALLES DE PACIENTE + REFERENCIA (v4)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Agrega a public.pacientes:
--   1) edad               — edad de la paciente (años)
--   2) sexo               — sexo (Femenino / Masculino)
--   3) referencia_hospital — hospital al que se refirió cuando la
--      cirugía no se realizó (se guarda junto a motivo_suspension)

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS edad                INTEGER,
  ADD COLUMN IF NOT EXISTS sexo                VARCHAR(20),
  ADD COLUMN IF NOT EXISTS referencia_hospital VARCHAR(200);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pacientes'
  AND column_name IN ('edad','sexo','referencia_hospital')
ORDER BY column_name;

-- ============================================================
-- DIFERENCIAR "SUSPENDIDA" DE "REFERIDA" (v5)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Agrega el estado 'referida' (la cirugía no se realizó porque la
-- paciente se derivó a otro hospital de mayor capacidad resolutiva),
-- distinto de 'suspendida' (se cancela/reprograma en el mismo hospital).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'estado_paciente'::regtype AND enumlabel = 'referida'
  ) THEN
    ALTER TYPE estado_paciente ADD VALUE 'referida';
  END IF;
END $$;

-- Integridad: 'referida' requiere hospital de referencia
ALTER TABLE public.pacientes
  DROP CONSTRAINT IF EXISTS chk_referida_tiene_hospital;
ALTER TABLE public.pacientes
  ADD CONSTRAINT chk_referida_tiene_hospital
    CHECK (estado <> 'referida' OR referencia_hospital IS NOT NULL);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT enumlabel FROM pg_enum
WHERE enumtypid = 'estado_paciente'::regtype
ORDER BY enumsortorder;

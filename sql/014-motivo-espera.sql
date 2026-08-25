-- ============================================================
-- MÓDULO PROGRAMACIÓN QUIRÚRGICA — v8 (motivo de espera editable)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Agrega las columnas del reporte GERESA "motivo de espera" y
-- "detalle motivo de espera" como campos editables en la app.
-- Antes se derivaban automáticamente en el script de Google a partir
-- del estado (suspendida → SUSPENDIDO, referida → REFERIDO, resto →
-- "En lista de espera"); ahora el usuario puede fijar su propio valor.
-- El script sigue derivando solo si estos campos están vacíos.

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS motivo_espera         TEXT,
  ADD COLUMN IF NOT EXISTS detalle_motivo_espera TEXT;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pacientes'
  AND column_name IN ('motivo_espera','detalle_motivo_espera')
ORDER BY column_name;

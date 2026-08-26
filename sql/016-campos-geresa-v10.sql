-- ============================================================
-- MÓDULO PROGRAMACIÓN QUIRÚRGICA — v10 (establecimientos, ID registro y fechas de exámenes)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Agrega a public.pacientes los campos del reporte GERESA ("FILA AZUL")
-- que aún se fijaban como constantes o se derivaban de un solo valor:
--   1) id_registro             — número de paciente (sugerido por la app, autoridad en la hoja)
--   2) establecimiento_destino — establecimiento quirúrgico destino (def. HOSPITAL DISTRITAL DE LAREDO)
--   3) codigo_destino          — código único de destino (def. 5231)
--   4) establecimiento_origen  — establecimiento origen que refiere (def. HOSPITAL DISTRITAL DE LAREDO)
--   5) codigo_origen           — código único de origen (def. 5231)
--   6) fecha_examen1           — fecha del examen prequirúrgico 1 (Laboratorio)
--   7) fecha_examen2           — fecha del examen prequirúrgico 2 (EKG)
--
-- NOTA: "tipo examen prequirúrgico 1/2" son fijos (Laboratorio / EKG) y se
-- derivan de laboratorio_completo / ekg, igual que antes. "Resultado evaluación
-- preoperatoria" es automático (NO APTO por defecto → APTO al completar ambos
-- riesgos). "Fecha referencia aceptada" reutiliza fecha_captacion.

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS id_registro             INTEGER,
  ADD COLUMN IF NOT EXISTS establecimiento_destino TEXT,
  ADD COLUMN IF NOT EXISTS codigo_destino          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS establecimiento_origen  TEXT,
  ADD COLUMN IF NOT EXISTS codigo_origen           VARCHAR(20),
  ADD COLUMN IF NOT EXISTS fecha_examen1           DATE,
  ADD COLUMN IF NOT EXISTS fecha_examen2           DATE;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pacientes'
  AND column_name IN ('id_registro','establecimiento_destino','codigo_destino',
                      'establecimiento_origen','codigo_origen',
                      'fecha_examen1','fecha_examen2')
ORDER BY column_name;

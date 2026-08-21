-- ============================================================
-- MÓDULO PROGRAMACIÓN QUIRÚRGICA — v7 (campos GERESA adicionales)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Agrega los campos restantes del reporte oficial GERESA ("FILA AZUL")
-- que la app aún no captura (columnas opcionales del detalle):
--   1) cie10_secundario              — CIE-10 secundario
--   2) diagnostico_secundario        — Diagnóstico secundario
--   3) cie10_tercero                 — CIE-10 terciario
--   4) diagnostico_tercero           — Diagnóstico terciario
--   5) codigo_procedimiento          — Código del procedimiento quirúrgico
--   6) fecha_primera_evaluacion      — F. primera evaluación por cirugía
--   7) aplica_imagenes               — ¿Aplica diagnóstico por imágenes? (Sí/No)
--   8) fecha_imagenes                — F. diagnóstico por imágenes
--   9) fecha_evaluacion_preoperatoria— F. evaluación preoperatoria por cirugía
--  10) orden_intervencion            — N° orden de intervención
--
-- NOTA: "Tipo/Fecha examen prequirúrgico 1 y 2" se derivan automáticamente
-- en el script de Google a partir de laboratorio_completo / ekg + fecha_fase2
-- (no requieren columnas nuevas).

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS cie10_secundario             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS diagnostico_secundario       TEXT,
  ADD COLUMN IF NOT EXISTS cie10_tercero                VARCHAR(20),
  ADD COLUMN IF NOT EXISTS diagnostico_tercero          TEXT,
  ADD COLUMN IF NOT EXISTS codigo_procedimiento         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fecha_primera_evaluacion     DATE,
  ADD COLUMN IF NOT EXISTS aplica_imagenes              VARCHAR(3),
  ADD COLUMN IF NOT EXISTS fecha_imagenes               DATE,
  ADD COLUMN IF NOT EXISTS fecha_evaluacion_preoperatoria DATE,
  ADD COLUMN IF NOT EXISTS orden_intervencion           VARCHAR(50);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pacientes'
  AND column_name IN ('cie10_secundario','diagnostico_secundario','cie10_tercero',
                      'diagnostico_tercero','codigo_procedimiento','fecha_primera_evaluacion',
                      'aplica_imagenes','fecha_imagenes','fecha_evaluacion_preoperatoria',
                      'orden_intervencion')
ORDER BY column_name;

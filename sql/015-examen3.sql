-- ============================================================
-- MÓDULO PROGRAMACIÓN QUIRÚRGICA — v9 (examen prequirúrgico 3)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- El reporte GERESA tiene 3 slots de "Tipo/Fecha examen prequirúrgico".
-- Los slots 1 y 2 se derivan de Laboratorio completo y EKG. Este script
-- agrega el slot 3 como campo editable para que ninguna columna del
-- formato quede sin poder capturarse en la app.

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS tipo_examen3  TEXT,
  ADD COLUMN IF NOT EXISTS fecha_examen3  DATE;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pacientes'
  AND column_name IN ('tipo_examen3','fecha_examen3')
ORDER BY column_name;

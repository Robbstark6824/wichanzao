-- ============================================================
-- MÓDULO PROGRAMACIÓN QUIRÚRGICA — v12 (captar TODO lo que piden los formatos)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- La app escribía las 56 columnas, pero varias con valores FIJOS en el código,
-- así que no podía expresar lo que el catálogo oficial permite:
--
--   · Resultado evaluación preoperatoria → se derivaba de dos booleanos y
--     nunca podía dar "No apto" (solo Pendiente / Apto).
--   · Motivo cierre → el catálogo tiene 12 opciones y la app solo emitía 2.
--     Casos reales que quedaban mal: una paciente operada en el HBT o en
--     clínica privada llegaba a la hoja como "Otro motivo".
--   · Tipo cierre → fijo por código, no elegible.
--   · Fecha suspensión / cierre / real de operación → usaban fecha_resolucion,
--     que es el instante en que alguien tocó el botón, no la fecha clínica.
--     Marcar una cirugía tres días después dejaba la fecha equivocada.
-- ============================================================

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS resultado_preop      TEXT,
  ADD COLUMN IF NOT EXISTS tipo_cierre          TEXT,
  ADD COLUMN IF NOT EXISTS motivo_cierre        TEXT,
  ADD COLUMN IF NOT EXISTS fecha_cierre         DATE,
  ADD COLUMN IF NOT EXISTS fecha_suspension     DATE,
  ADD COLUMN IF NOT EXISTS fecha_real_operacion DATE;

-- ------------------------------------------------------------
-- "referida" pasa a significar "salió de la lista sin cirugía".
-- El catálogo incluye motivos sin hospital de destino (fallecimiento,
-- renuncia voluntaria, paciente no ubicable, duplicidad de registro), así que
-- exigir referencia_hospital impedía registrarlos. Ahora lo obligatorio es el
-- motivo de cierre; el hospital queda opcional y sigue valiendo para las filas
-- viejas que ya lo tienen.
-- ------------------------------------------------------------
ALTER TABLE public.pacientes
  DROP CONSTRAINT IF EXISTS chk_referida_tiene_hospital;

ALTER TABLE public.pacientes
  DROP CONSTRAINT IF EXISTS chk_referida_tiene_motivo;

ALTER TABLE public.pacientes
  ADD CONSTRAINT chk_referida_tiene_motivo
    CHECK (
      estado <> 'referida'
      OR motivo_cierre IS NOT NULL
      OR referencia_hospital IS NOT NULL
    );

-- ------------------------------------------------------------
-- Rellenar lo que ya se puede deducir de las filas existentes, para no dejar
-- huecos en las pacientes ya cerradas.
-- ------------------------------------------------------------
UPDATE public.pacientes
   SET fecha_real_operacion = COALESCE(fecha_real_operacion, fecha_cirugia),
       fecha_cierre         = COALESCE(fecha_cierre, fecha_cirugia),
       tipo_cierre          = COALESCE(tipo_cierre, 'Cirugía realizada')
 WHERE estado = 'operada';

UPDATE public.pacientes
   SET fecha_suspension = COALESCE(fecha_suspension, fecha_cirugia)
 WHERE estado = 'suspendida';

UPDATE public.pacientes
   SET tipo_cierre   = COALESCE(tipo_cierre, 'Salida de lista sin cirugía'),
       motivo_cierre = COALESCE(motivo_cierre, 'Paciente referido o transferido a otra institución'),
       fecha_cierre  = COALESCE(fecha_cierre, fecha_cirugia)
 WHERE estado = 'referida';

-- Riesgo quirúrgico y anestésico ambos evaluados → Apto; si no, Pendiente.
-- "No apto" no se puede deducir: lo tiene que marcar una persona.
UPDATE public.pacientes
   SET resultado_preop = CASE WHEN riesgo_qx AND riesgo_anestesiologico
                              THEN 'Apto' ELSE 'Pendiente' END
 WHERE resultado_preop IS NULL;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'pacientes'
   AND column_name IN ('resultado_preop','tipo_cierre','motivo_cierre',
                       'fecha_cierre','fecha_suspension','fecha_real_operacion')
 ORDER BY column_name;

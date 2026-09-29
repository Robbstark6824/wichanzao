-- ============================================================
-- 034 · "NA" (no aplica) en exámenes y riesgo quirúrgico
-- ============================================================
--
-- Cirugía General usa el mismo formato de 47 columnas que ginecología, pero
-- en las cirugías menores con anestesia local escribe "NA" en "Tipo examen
-- prequirúrgico 1/2" y en "F. riesgo quirúrgico". La app solo sabía Sí/No,
-- así que al guardar habría borrado esos "NA" de su hoja.
--
-- Tres marcas nuevas. En ginecología quedan siempre en false: la app no le
-- ofrece la opción y el Apps Script solo escribe "NA" cuando están en true.
-- ============================================================

BEGIN;

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS laboratorio_na BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ekg_na         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS riesgo_qx_na   BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pacientes.laboratorio_na IS 'No aplica laboratorio (hoja: Tipo examen prequirúrgico 1 = NA)';
COMMENT ON COLUMN public.pacientes.ekg_na         IS 'No aplica EKG (hoja: Tipo examen prequirúrgico 2 = NA)';
COMMENT ON COLUMN public.pacientes.riesgo_qx_na   IS 'No aplica riesgo quirúrgico (hoja: F. riesgo quirúrgico = NA)';

COMMIT;

SELECT count(*) FILTER (WHERE laboratorio_na OR ekg_na OR riesgo_qx_na) AS con_na, count(*) AS total
  FROM public.pacientes;

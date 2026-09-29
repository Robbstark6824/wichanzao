-- ============================================================
-- Deshace 031-multiservicio-base.sql (solo si hiciera falta volver atrás)
-- ============================================================
-- Falla a propósito si ya hay pacientes de otro servicio o un DNI repetido:
-- en ese caso volver atrás perdería datos y hay que decidirlo a mano.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pacientes WHERE servicio <> 'ginecologia') THEN
    RAISE EXCEPTION 'Hay pacientes de otros servicios: no se revierte automáticamente';
  END IF;
END $$;

ALTER TABLE public.pacientes DROP CONSTRAINT IF EXISTS pacientes_dni_servicio_key;
ALTER TABLE public.pacientes ADD CONSTRAINT pacientes_dni_key UNIQUE (dni);
DROP INDEX IF EXISTS public.idx_pacientes_servicio;
ALTER TABLE public.pacientes DROP COLUMN IF EXISTS servicio;

ALTER TABLE public.recetas_plantillas DROP COLUMN IF EXISTS servicio;

ALTER TABLE public.workers DROP CONSTRAINT IF EXISTS workers_rol_check;
ALTER TABLE public.workers DROP COLUMN IF EXISTS rol;

DROP TABLE IF EXISTS public.servicios;

COMMIT;

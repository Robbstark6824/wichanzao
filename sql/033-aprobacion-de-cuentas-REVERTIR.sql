-- Deshace 033-aprobacion-de-cuentas.sql (vuelve al registro abierto). Emergencia.
BEGIN;

DROP FUNCTION IF EXISTS public.admin_aprobar_worker(uuid, boolean);

DROP POLICY IF EXISTS impresiones_select ON public.impresiones;
DROP POLICY IF EXISTS impresiones_insert ON public.impresiones;
DROP POLICY IF EXISTS impresiones_update ON public.impresiones;
DROP POLICY IF EXISTS impresiones_delete ON public.impresiones;
CREATE POLICY impresiones_select ON public.impresiones FOR SELECT TO authenticated USING (true);
CREATE POLICY impresiones_insert ON public.impresiones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY impresiones_update ON public.impresiones FOR UPDATE TO authenticated USING (true);
CREATE POLICY impresiones_delete ON public.impresiones FOR DELETE TO authenticated USING (estado = 'pendiente');

CREATE OR REPLACE FUNCTION public.mi_servicio()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT servicio FROM workers WHERE id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.es_jefe_info()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT rol = 'jefe_info' FROM workers WHERE id = auth.uid()), false)
$$;
DROP FUNCTION IF EXISTS public.estoy_aprobado();

ALTER TABLE public.workers DROP CONSTRAINT IF EXISTS workers_folder_id_key;
ALTER TABLE public.workers DROP COLUMN IF EXISTS aprobado;

COMMIT;

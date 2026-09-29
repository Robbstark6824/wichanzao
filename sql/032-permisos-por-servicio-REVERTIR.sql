-- Deshace 032-permisos-por-servicio.sql: vuelve a "todo usuario con sesión ve
-- y edita todo", como antes de la Fase 2. Solo para una emergencia.
BEGIN;

DROP POLICY IF EXISTS pacientes_select ON public.pacientes;
DROP POLICY IF EXISTS pacientes_insert ON public.pacientes;
DROP POLICY IF EXISTS pacientes_update ON public.pacientes;
DROP POLICY IF EXISTS pacientes_delete ON public.pacientes;
CREATE POLICY pacientes_select ON public.pacientes FOR SELECT TO authenticated USING (true);
CREATE POLICY pacientes_insert ON public.pacientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY pacientes_update ON public.pacientes FOR UPDATE TO authenticated USING (true);
CREATE POLICY pacientes_delete ON public.pacientes FOR DELETE TO authenticated USING (true);
ALTER TABLE public.pacientes ALTER COLUMN servicio SET DEFAULT 'ginecologia';

DROP POLICY IF EXISTS historial_select ON public.historial_estados;
DROP POLICY IF EXISTS historial_insert ON public.historial_estados;
CREATE POLICY historial_select ON public.historial_estados FOR SELECT TO authenticated USING (true);
CREATE POLICY historial_insert ON public.historial_estados FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS recetas_plantillas_select ON public.recetas_plantillas;
CREATE POLICY recetas_plantillas_select ON public.recetas_plantillas FOR SELECT TO authenticated USING (true);

GRANT UPDATE (servicio) ON public.workers TO authenticated;

DROP FUNCTION IF EXISTS public.puede_editar_servicio(text);
DROP FUNCTION IF EXISTS public.puede_ver_servicio(text);
DROP FUNCTION IF EXISTS public.es_jefe_info();
DROP FUNCTION IF EXISTS public.mi_servicio();

COMMIT;

-- ============================================================
-- 032 · Permisos por servicio (Fase 2 de la expansión)
-- ============================================================
--
-- Hasta ahora cualquier usuario con sesión veía y editaba a TODOS los
-- pacientes: con un solo servicio daba igual. Con Cirugía General deja de dar
-- igual. Desde aquí:
--
--   · Médicos e internos: ven y editan solo los pacientes de SU servicio.
--   · Jefe de información (workers.rol = 'jefe_info'): ve todos los
--     servicios, no edita ninguno (su trabajo es revisar y exportar).
--   · Admin (workers.is_admin): ve y edita todo, como hasta hoy.
--   · El Apps Script usa la clave secreta: no pasa por estas reglas.
--
-- Además:
--   · Un paciente nuevo toma por defecto el servicio de quien lo registra, así
--     la app no necesita mandarlo. Sin sesión (Apps Script), 'ginecologia'.
--   · Nadie puede cambiarse de servicio a sí mismo (sería saltarse todo lo
--     anterior). El servicio se elige al registrarse; cambiarlo es cosa del
--     admin, por SQL.
--   · El historial de estados sigue al paciente: se ve si se ve el paciente.
--   · Las recetas: cada servicio ve las suyas; crear/editar sigue siendo admin.
--   · Sin sesión (anon) no hay ningún permiso sobre pacientes ni historial
--     (RLS ya lo bloqueaba; ahora tampoco queda el permiso de tabla).
--
-- Para ginecología no cambia nada: todos sus usuarios son de 'ginecologia' y
-- todos los pacientes también.
-- ============================================================

BEGIN;

-- 1. Funciones de apoyo ---------------------------------------------------
-- SECURITY DEFINER: leen workers sin depender de las políticas de workers.
CREATE OR REPLACE FUNCTION public.mi_servicio()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT servicio FROM workers WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.es_jefe_info()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT rol = 'jefe_info' FROM workers WHERE id = auth.uid()), false)
$$;

CREATE OR REPLACE FUNCTION public.puede_ver_servicio(s text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR public.es_jefe_info() OR s = public.mi_servicio()
$$;

CREATE OR REPLACE FUNCTION public.puede_editar_servicio(s text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR (s = public.mi_servicio() AND NOT public.es_jefe_info())
$$;

-- 2. Pacientes ------------------------------------------------------------
ALTER TABLE public.pacientes
  ALTER COLUMN servicio SET DEFAULT COALESCE(public.mi_servicio(), 'ginecologia');

DROP POLICY IF EXISTS pacientes_select ON public.pacientes;
DROP POLICY IF EXISTS pacientes_insert ON public.pacientes;
DROP POLICY IF EXISTS pacientes_update ON public.pacientes;
DROP POLICY IF EXISTS pacientes_delete ON public.pacientes;

CREATE POLICY pacientes_select ON public.pacientes FOR SELECT TO authenticated
  USING (public.puede_ver_servicio(servicio));
CREATE POLICY pacientes_insert ON public.pacientes FOR INSERT TO authenticated
  WITH CHECK (public.puede_editar_servicio(servicio));
CREATE POLICY pacientes_update ON public.pacientes FOR UPDATE TO authenticated
  USING (public.puede_editar_servicio(servicio))
  WITH CHECK (public.puede_editar_servicio(servicio));
CREATE POLICY pacientes_delete ON public.pacientes FOR DELETE TO authenticated
  USING (public.puede_editar_servicio(servicio));

REVOKE ALL ON public.pacientes FROM anon;

-- 3. Historial de estados -------------------------------------------------
DROP POLICY IF EXISTS historial_select ON public.historial_estados;
DROP POLICY IF EXISTS historial_insert ON public.historial_estados;

-- La subconsulta pasa por las políticas de pacientes: se ve el historial de
-- los pacientes que uno puede ver.
CREATE POLICY historial_select ON public.historial_estados FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pacientes p WHERE p.id = paciente_id));
CREATE POLICY historial_insert ON public.historial_estados FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.pacientes p
                       WHERE p.id = paciente_id AND public.puede_editar_servicio(p.servicio)));

REVOKE ALL ON public.historial_estados FROM anon;

-- 4. Recetas --------------------------------------------------------------
DROP POLICY IF EXISTS recetas_plantillas_select ON public.recetas_plantillas;
CREATE POLICY recetas_plantillas_select ON public.recetas_plantillas FOR SELECT TO authenticated
  USING (public.puede_ver_servicio(servicio));

-- 5. Nadie se cambia de servicio a sí mismo -------------------------------
REVOKE UPDATE (servicio) ON public.workers FROM anon, authenticated;

COMMIT;

-- ============================================================
-- 033 · Aprobación de cuentas
-- ============================================================
--
-- Hasta hoy el registro era abierto: cualquiera que abriera la app creaba una
-- cuenta y veía la lista completa de pacientes de su servicio. Desde aquí una
-- cuenta nueva queda PENDIENTE (workers.aprobado = false) y no ve nada hasta
-- que un admin la aprueba desde el panel 👑 de la app.
--
--   · Las 8 cuentas que existen hoy quedan aprobadas: nadie nota el cambio.
--   · Pendiente = sin servicio a efectos de permisos: mi_servicio() y
--     es_jefe_info() solo cuentan cuentas aprobadas, así que todas las reglas
--     de la 032 (pacientes, historial, recetas) la dejan fuera sin tocarlas.
--   · La cola de impresión también pide cuenta aprobada.
--   · Nadie se aprueba a sí mismo: la columna no se puede escribir desde la
--     app; se aprueba con admin_aprobar_worker(), que exige is_admin().
--   · folder_id (el usuario con el que se entra) pasa a ser único en toda la
--     app, no por servicio: el login busca por carpeta y con dos servicios
--     podría entrar a la cuenta equivocada.
-- ============================================================

BEGIN;

-- 1. La columna -------------------------------------------------------------
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS aprobado BOOLEAN NOT NULL DEFAULT false;
UPDATE public.workers SET aprobado = true;          -- las cuentas de hoy
REVOKE INSERT (aprobado), UPDATE (aprobado) ON public.workers FROM anon, authenticated;

ALTER TABLE public.workers DROP CONSTRAINT IF EXISTS workers_folder_id_key;
ALTER TABLE public.workers ADD CONSTRAINT workers_folder_id_key UNIQUE (folder_id);

-- 2. Pendiente = sin permisos -----------------------------------------------
CREATE OR REPLACE FUNCTION public.mi_servicio()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT servicio FROM workers WHERE id = auth.uid() AND aprobado
$$;

CREATE OR REPLACE FUNCTION public.es_jefe_info()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT rol = 'jefe_info' FROM workers WHERE id = auth.uid() AND aprobado), false)
$$;

CREATE OR REPLACE FUNCTION public.estoy_aprobado()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT aprobado OR is_admin FROM workers WHERE id = auth.uid()), false)
$$;

-- 3. Cola de impresión --------------------------------------------------------
DROP POLICY IF EXISTS impresiones_select ON public.impresiones;
DROP POLICY IF EXISTS impresiones_insert ON public.impresiones;
DROP POLICY IF EXISTS impresiones_update ON public.impresiones;
DROP POLICY IF EXISTS impresiones_delete ON public.impresiones;
CREATE POLICY impresiones_select ON public.impresiones FOR SELECT TO authenticated
  USING (public.estoy_aprobado());
CREATE POLICY impresiones_insert ON public.impresiones FOR INSERT TO authenticated
  WITH CHECK (public.estoy_aprobado());
CREATE POLICY impresiones_update ON public.impresiones FOR UPDATE TO authenticated
  USING (public.estoy_aprobado());
CREATE POLICY impresiones_delete ON public.impresiones FOR DELETE TO authenticated
  USING (estado = 'pendiente' AND public.estoy_aprobado());

-- 4. Aprobar / quitar la aprobación (solo admin) -----------------------------
CREATE OR REPLACE FUNCTION public.admin_aprobar_worker(p_id uuid, p_aprobado boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede aprobar cuentas';
  END IF;
  IF p_id = auth.uid() AND NOT p_aprobado THEN
    RAISE EXCEPTION 'No puedes quitarte la aprobación a ti mismo';
  END IF;
  UPDATE workers SET aprobado = p_aprobado WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa cuenta'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.admin_aprobar_worker(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_aprobar_worker(uuid, boolean) TO authenticated;

COMMIT;

SELECT aprobado, count(*) FROM public.workers GROUP BY 1;

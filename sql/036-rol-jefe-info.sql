-- ============================================================
-- 036 · Nombrar / quitar al jefe de información desde la app
-- ============================================================
-- workers.rol (sql/031) no se puede escribir desde la app: nadie se nombra
-- jefe a sí mismo. Esta función deja que un ADMIN lo haga desde 👑 →
-- Usuarios. Hoy lo lleva la anestesióloga, pero el rol no está atado a ella.
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_set_rol(p_id uuid, p_rol text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar roles';
  END IF;
  IF p_rol NOT IN ('medico', 'jefe_info') THEN
    RAISE EXCEPTION 'Rol desconocido: %', p_rol;
  END IF;
  UPDATE workers SET rol = p_rol WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa cuenta'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.admin_set_rol(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_rol(uuid, text) TO authenticated;

COMMIT;

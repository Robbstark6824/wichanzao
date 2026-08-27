-- ============================================================
-- FIX: al borrar un worker, borrar también su cuenta de Auth
-- ============================================================
-- Problema: adminDeleteFolder() (app) borraba la carpeta en Storage
-- y la fila en public.workers, pero NO la cuenta en auth.users.
-- Resultado: cuentas de login "huérfanas" que ya no tenían ni fila
-- ni carpeta, pero seguían ocupando espacio en Auth.
--
-- Solución: una función SECURITY DEFINER que, en una sola transacción,
-- borra la fila de workers Y la cuenta de Auth (auth.users) con su
-- cascade (identities, sessions, refresh_tokens, mfa). El cliente la
-- invoca con sb.rpc('admin_delete_worker', { p_folder_id }).
--
-- Seguridad:
--   · La función corre como postgres (superuser), capaz de borrar en auth.users.
--   · Dentro valida public.is_admin() → solo un admin autenticado puede usarla.
--   · Solo el rol `authenticated` tiene EXECUTE (anon no).
--
-- Proyecto: xqphjvppfgwabfruyjae (Wichanzao-docs)
-- Ejecutar en: Supabase Dashboard → SQL Editor (o pooler directo)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_delete_worker(p_folder_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Solo un admin autenticado puede borrar.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT id INTO v_user_id FROM public.workers WHERE folder_id = p_folder_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Trabajador no encontrado: %', p_folder_id;
  END IF;

  -- 1) Borra la fila de workers.
  DELETE FROM public.workers WHERE id = v_user_id;

  -- 2) Borra la cuenta de Auth (cascade limpia identities/sessions/refresh_tokens).
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

-- Seguridad: restringe la invocación al rol autenticado.
REVOKE EXECUTE ON FUNCTION public.admin_delete_worker(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_worker(text) TO authenticated;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT '✅ admin_delete_worker creada' AS status;

SELECT p.proname AS function, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'admin_delete_worker' AND n.nspname = 'public';

-- ============================================================
-- 039 · check_service_code: solo con sesión y con límite de intentos
-- ============================================================
-- Antes: cualquiera sin sesión podía llamarla, sin límite → fuerza bruta de los
-- códigos de servicio (hallazgo 7 de SEGURIDAD.md).
-- Ahora:
--   · `anon` y PUBLIC ya no pueden ejecutarla; solo `authenticated`
--     (el panel de PC la llama con la sesión de quien ya inició sesión).
--   · Máximo 5 intentos fallidos por usuario cada 15 minutos; superado el
--     límite responde false sin mirar la tabla (y sigue contando).
-- Revertir: 039-check-service-code-con-sesion-y-limite-REVERTIR.sql
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.service_code_fallos (
  id  bigserial PRIMARY KEY,
  uid uuid        NOT NULL,
  at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_code_fallos_uid_at ON public.service_code_fallos (uid, at);
ALTER TABLE public.service_code_fallos ENABLE ROW LEVEL SECURITY;  -- sin políticas: nadie la toca salvo la función
REVOKE ALL ON public.service_code_fallos FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_service_code(p_servicio text, p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ok  boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  DELETE FROM service_code_fallos WHERE at < now() - interval '1 day';

  IF (SELECT count(*) FROM service_code_fallos
       WHERE uid = v_uid AND at > now() - interval '15 minutes') >= 5 THEN
    INSERT INTO service_code_fallos (uid) VALUES (v_uid);
    RETURN false;
  END IF;

  SELECT EXISTS (SELECT 1 FROM service_codes WHERE servicio = p_servicio AND code = p_code)
    INTO v_ok;
  IF NOT v_ok THEN INSERT INTO service_code_fallos (uid) VALUES (v_uid); END IF;
  RETURN v_ok;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.check_service_code(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_service_code(text, text) TO authenticated;

COMMIT;

SELECT has_function_privilege('anon', 'public.check_service_code(text,text)', 'execute')          AS anon_puede,
       has_function_privilege('authenticated', 'public.check_service_code(text,text)', 'execute') AS auth_puede;

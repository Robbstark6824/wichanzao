-- Revierte 039: vuelve a la función simple, ejecutable por anon.
BEGIN;
CREATE OR REPLACE FUNCTION public.check_service_code(p_servicio text, p_code text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
      SELECT 1 FROM service_codes WHERE servicio = p_servicio AND code = p_code
    );
  $function$;
GRANT EXECUTE ON FUNCTION public.check_service_code(text, text) TO PUBLIC, anon, authenticated;
DROP TABLE IF EXISTS public.service_code_fallos;
COMMIT;

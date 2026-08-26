-- ============================================================
-- FIX: el admin no podía borrar un worker (403 "permission denied
-- for table workers") y el worker "fantasma" seguía apareciendo en
-- el panel admin después de borrar su carpeta en Storage.
-- Proyecto: xqphjvppfgwabfruyjae (Wichanzao-docs)
-- Ejecutar en: Supabase Dashboard → SQL Editor (o pooler directo)
-- ============================================================
--
-- Causa raíz: 004-rls-workers.sql hizo
--   REVOKE INSERT, UPDATE, DELETE ON public.workers FROM anon, authenticated;
-- y 008-fix-workers-registro.sql solo restauró INSERT/UPDATE (no DELETE).
-- La policy `admin_delete` (USING is_admin()) SÍ existe, pero una policy
-- RLS no otorga privilegios: solo filtra filas. Sin el GRANT DELETE a nivel
-- de tabla, `authenticated` (el admin) ni siquiera puede intentar el DELETE.
--
-- El `admin_delete` ya restringe a `is_admin()`, así que este GRANT es
-- seguro: un usuario autenticado NO-admin podrá emitir DELETE pero RLS le
-- devolverá 0 filas (no puede borrar nada).

GRANT DELETE ON public.workers TO authenticated;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT '✅ DELETE restaurado para authenticated' AS status;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'workers'
  AND privilege_type = 'DELETE'
ORDER BY grantee;

-- ============================================================
-- FIX: registro de usuarios roto (403 / 42501)
-- Error: "permission denied for table workers"
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- El rol `authenticated` perdió los privilegios INSERT/UPDATE sobre
-- public.workers (no es un problema de políticas RLS). Se restauran los
-- permisos, manteniendo la protección de `is_admin` (solo service_role).

-- 1. Asegurar RLS
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

-- 2. Recrear políticas (idempotente)
DROP POLICY IF EXISTS "workers_select" ON public.workers;
DROP POLICY IF EXISTS "workers_insert_self" ON public.workers;
DROP POLICY IF EXISTS "workers_update_self" ON public.workers;

CREATE POLICY "workers_select" ON public.workers
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "workers_insert_self" ON public.workers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "workers_update_self" ON public.workers
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 3. Restaurar privilegios (la causa real del 403)
--    anon: solo leer columnas públicas para el login
GRANT SELECT (id, folder_id, name, servicio, area) ON public.workers TO anon;

--    authenticated: INSERT/UPDATE sobre columnas seguras (sin is_admin)
GRANT INSERT (id, folder_id, name, servicio, area, picture, email, google, created_at, last_active)
  ON public.workers TO authenticated;
GRANT UPDATE (folder_id, name, servicio, area, picture, email, google, last_active)
  ON public.workers TO authenticated;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT '✅ Privilegios restaurados:' AS status;
SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'workers'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type, column_name;

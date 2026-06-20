-- ============================================================
-- SEGURIDAD: RLS en public.workers (aplicada en Supabase 2026-06-20)
-- Proyecto: xqphjvppfgwabfruyjae (Wichanzao-docs)
-- ============================================================
-- Cierra el hueco donde la anon key podía leer/escribir cualquier
-- worker (incluido is_admin). No rompe:
--   · login (anon lee servicio por folder_id antes de autenticar)
--   · registro (authenticated inserta SU propia fila, id = auth.uid())
--   · admin (service_role salta RLS)
-- ============================================================

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

-- Políticas de fila
CREATE POLICY "workers_select" ON public.workers
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "workers_insert_self" ON public.workers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "workers_update_self" ON public.workers
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Privilegios de columna: anti-escalada de is_admin + menor superficie anon
REVOKE INSERT, UPDATE, DELETE ON public.workers FROM anon, authenticated;
REVOKE SELECT ON public.workers FROM anon;

GRANT SELECT (id, folder_id, name, servicio, area) ON public.workers TO anon;
GRANT INSERT (id, folder_id, name, servicio, area, picture, email, google, created_at, last_active)
  ON public.workers TO authenticated;
GRANT UPDATE (folder_id, name, servicio, area, picture, email, google, last_active)
  ON public.workers TO authenticated;
-- is_admin NO está en ningún grant → solo service_role puede cambiarlo.

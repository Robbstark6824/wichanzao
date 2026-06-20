-- ============================================================
-- MÓDULO HOSPITALIZACIÓN — Paso 3: Datos estructurados
-- Proyecto Wichanzao · Centro de Salud
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Agrega una columna JSONB "datos" para guardar información
-- clínica estructurada, sin romper los registros existentes:
--   · evoluciones.datos → snapshot del día (dengue / antibióticos)
--   · ingresos.datos     → estado vivo (esquemas antibióticos activos)
-- Ambas son NULLABLE y retrocompatibles.
-- ============================================================

-- 1. Columnas nuevas (idempotente)
ALTER TABLE public.evoluciones ADD COLUMN IF NOT EXISTS datos JSONB;
ALTER TABLE public.ingresos    ADD COLUMN IF NOT EXISTS datos JSONB;

-- 2. Política de UPDATE en ingresos
--    La app actualiza ingresos.datos con el cliente service_role
--    (sbAdmin), que IGNORA RLS, por lo que esto funciona aunque la
--    política no aplique. Se deja por completitud para el cliente
--    autenticado normal. Si ya existe (creada en 001), este bloque
--    la recrea sin error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ingresos'
      AND policyname = 'ingresos_update'
  ) THEN
    CREATE POLICY "ingresos_update" ON public.ingresos
      FOR UPDATE TO authenticated USING (auth.uid() = created_by);
  END IF;
END $$;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT '✅ Columnas datos agregadas' AS status;
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'datos'
  AND table_name IN ('evoluciones','ingresos')
ORDER BY table_name;

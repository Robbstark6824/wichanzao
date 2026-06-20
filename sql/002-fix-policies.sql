-- ============================================================
-- Paso 1: Diagnosticar quién es dueño de las tablas
-- ============================================================
SELECT tablename, tableowner
FROM pg_tables
WHERE tablename IN ('pacientes','ingresos','evoluciones','servicios')
AND schemaname = 'public';

-- Paso 2: Mostrar quién eres
SELECT current_user, session_user;

-- ============================================================
-- Si el dueño NO es postgres, copia y ejecuta SOLO la línea
-- que corresponda al dueño real (reemplaza NOMBRE_DEL_DUENO):
-- ============================================================
-- SET ROLE NOMBRE_DEL_DUENO;
-- CREATE POLICY "pacientes_update" ON public.pacientes FOR UPDATE TO authenticated USING (true);
-- CREATE POLICY "evoluciones_update" ON public.evoluciones FOR UPDATE TO authenticated USING (auth.uid() = author_id);

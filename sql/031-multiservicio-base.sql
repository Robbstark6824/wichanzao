-- ============================================================
-- 031 · Base de datos multi-servicio (Fase 1 de la expansión)
-- ============================================================
--
-- La app deja de ser solo de Ginecología: se suma Cirugía General y un perfil
-- de Jefe de información que exporta los datos a la GERESA. Esta migración
-- SOLO AGREGA; todo lo que existe queda en 'ginecologia' y la app actual no
-- nota nada:
--
--   1. Tabla `servicios`: el servicio pasa a ser un dato. Cirugía General
--      entra con activo = false; se enciende en la Fase 5, cuando el Apps
--      Script ya sepa separar servicios (si entrara antes un paciente de
--      Cirugía General, la sincronización lo escribiría en la hoja de gineco).
--
--   2. pacientes.servicio (DEFAULT 'ginecologia'). El DNI deja de ser único
--      solo: lo único pasa a ser (dni, servicio). Una misma persona puede
--      esperar una cirugía ginecológica y otra de cirugía general — raro,
--      pero son dos esperas distintas, cada una en su servicio.
--
--   3. workers.rol: 'medico' (médicos e internos) o 'jefe_info' (ve todos
--      los servicios y exporta). Nadie puede ponerse el rol a sí mismo: no se
--      da permiso de INSERT/UPDATE sobre la columna (igual que is_admin).
--
--   4. recetas_plantillas.servicio: cada servicio tendrá sus recetas.
--
-- Verificación: node tools/referencia-geresa.mjs --con-servicio  → idéntico.
-- ============================================================

BEGIN;

-- 1. Catálogo de servicios ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.servicios (
  clave               TEXT PRIMARY KEY,
  nombre              TEXT NOT NULL,          -- como se muestra en la app
  especialidad_geresa TEXT NOT NULL,          -- "Especialidad quirúrgica" en las hojas
  activo              BOOLEAN NOT NULL DEFAULT true,
  orden               INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.servicios (clave, nombre, especialidad_geresa, activo, orden) VALUES
  ('ginecologia',     'Ginecología y Obstetricia', 'GINECOLOGIA',     true,  1),
  ('cirugia_general', 'Cirugía General',           'CIRUGIA GENERAL', false, 2)
ON CONFLICT (clave) DO NOTHING;

-- Lo leen todos (la pantalla de registro lo necesita antes de iniciar sesión);
-- nadie lo escribe desde la app: se administra por SQL.
ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.servicios FROM anon, authenticated;
GRANT SELECT ON public.servicios TO anon, authenticated;
DROP POLICY IF EXISTS servicios_select ON public.servicios;
CREATE POLICY servicios_select ON public.servicios
  FOR SELECT TO anon, authenticated USING (true);

-- 2. Pacientes ------------------------------------------------------------
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS servicio TEXT NOT NULL DEFAULT 'ginecologia'
  REFERENCES public.servicios(clave) ON UPDATE CASCADE;

ALTER TABLE public.pacientes DROP CONSTRAINT IF EXISTS pacientes_dni_key;
ALTER TABLE public.pacientes DROP CONSTRAINT IF EXISTS pacientes_dni_servicio_key;
ALTER TABLE public.pacientes
  ADD CONSTRAINT pacientes_dni_servicio_key UNIQUE (dni, servicio);

CREATE INDEX IF NOT EXISTS idx_pacientes_servicio ON public.pacientes (servicio);

-- 3. Rol de cada usuario --------------------------------------------------
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'medico';
ALTER TABLE public.workers DROP CONSTRAINT IF EXISTS workers_rol_check;
ALTER TABLE public.workers
  ADD CONSTRAINT workers_rol_check CHECK (rol IN ('medico', 'jefe_info'));
-- Leerlo sí (authenticated ya tiene SELECT de tabla); escribirlo no.
REVOKE INSERT (rol), UPDATE (rol) ON public.workers FROM anon, authenticated;

-- 4. Recetas por servicio -------------------------------------------------
ALTER TABLE public.recetas_plantillas
  ADD COLUMN IF NOT EXISTS servicio TEXT NOT NULL DEFAULT 'ginecologia'
  REFERENCES public.servicios(clave) ON UPDATE CASCADE;

COMMIT;

-- Comprobación
SELECT servicio, count(*) FROM public.pacientes GROUP BY 1;
SELECT rol, count(*) FROM public.workers GROUP BY 1;
SELECT servicio, count(*) FROM public.recetas_plantillas GROUP BY 1;

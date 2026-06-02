-- ============================================================
-- MÓDULO CENSO HOSPITALARIO — Paso 1: Creación de Tablas
-- Proyecto Wichanzao · Centro de Salud
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. SERVICIOS — Catálogo de servicios hospitalarios
CREATE TABLE IF NOT EXISTS public.servicios (
  id         SERIAL PRIMARY KEY,
  nombre     VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: servicios iniciales
INSERT INTO public.servicios (nombre) VALUES
  ('Medicina Interna'),
  ('Cirugía'),
  ('Gineco-Obstetricia')
ON CONFLICT (nombre) DO NOTHING;

-- 2. PACIENTES — Datos inmutables del paciente
CREATE TABLE IF NOT EXISTS public.pacientes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dni              VARCHAR(20) UNIQUE NOT NULL,
  nombres          VARCHAR(200) NOT NULL,
  apellidos        VARCHAR(200) NOT NULL,
  fecha_nacimiento DATE,
  sexo             VARCHAR(20),
  alergias         TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pacientes_dni ON public.pacientes(dni);

-- 3. INGRESOS — Relaciona paciente con servicio y cama
CREATE TABLE IF NOT EXISTS public.ingresos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id  UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  servicio_id  INT NOT NULL REFERENCES public.servicios(id),
  cama         VARCHAR(50) NOT NULL,           -- texto libre: "Cama 4", "Pasillo"
  dx_ingreso   TEXT,                            -- diagnóstico de ingreso (opcional)
  fecha_ingreso TIMESTAMPTZ DEFAULT NOW(),
  fecha_egreso TIMESTAMPTZ,                     -- NULL = activo
  estado       VARCHAR(20) DEFAULT 'Activo' CHECK (estado IN ('Activo','Alta','Fallecido','Transferido')),
  created_by   UUID NOT NULL,                   -- auth.users.id del interno
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ingresos_servicio  ON public.ingresos(servicio_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_estado    ON public.ingresos(estado);
CREATE INDEX IF NOT EXISTS idx_ingresos_paciente  ON public.ingresos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_dashboard ON public.ingresos(servicio_id, estado);

-- 4. EVOLUCIONES — Notas clínicas (principalmente fotos)
CREATE TABLE IF NOT EXISTS public.evoluciones (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingreso_id UUID NOT NULL REFERENCES public.ingresos(id) ON DELETE CASCADE,
  tipo       VARCHAR(20) NOT NULL DEFAULT 'Foto'
             CHECK (tipo IN ('Foto','SOAP','Laboratorio','Imagen','Procedimiento','Interconsulta','Nota')),
  nota       TEXT,                               -- caption / nota rápida (opcional)
  image_urls TEXT[],                             -- URLs a Supabase Storage (principal)
  author_id  UUID NOT NULL,                      -- auth.users.id del interno
  author_name VARCHAR(200) NOT NULL,             -- desnormalizado para display
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evoluciones_ingreso ON public.evoluciones(ingreso_id);
CREATE INDEX IF NOT EXISTS idx_evoluciones_timeline ON public.evoluciones(ingreso_id, created_at DESC);

-- 5. Habilitar REAL TIME en las tablas clave
ALTER PUBLICATION supabase_realtime ADD TABLE public.ingresos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.evoluciones;

-- 6. Políticas RLS — Seguridad por servicio
ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingresos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evoluciones ENABLE ROW LEVEL SECURITY;

-- Servicios: todos los autenticados pueden leer
CREATE POLICY "servicios_select" ON public.servicios
  FOR SELECT TO authenticated USING (true);

-- Pacientes: todos los autenticados pueden leer/crear
CREATE POLICY "pacientes_select" ON public.pacientes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pacientes_insert" ON public.pacientes
  FOR INSERT TO authenticated WITH CHECK (true);

-- Ingresos: todos los autenticados pueden leer; solo el creador puede modificar
CREATE POLICY "ingresos_select" ON public.ingresos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ingresos_insert" ON public.ingresos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "ingresos_update" ON public.ingresos
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "ingresos_delete" ON public.ingresos
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Evoluciones: todos los autenticados pueden leer; solo el autor puede insertar
CREATE POLICY "evoluciones_select" ON public.evoluciones
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "evoluciones_insert" ON public.evoluciones
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT '✅ Tablas creadas:' AS status;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('servicios','pacientes','ingresos','evoluciones') ORDER BY table_name;
SELECT '✅ Realtime habilitado en: ingresos, evoluciones' AS realtime_status;

-- ============================================================
-- MÓDULO PROGRAMACIÓN QUIRÚRGICA — Pipeline clínico de 7 fases
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- La PWA (index.html) habla directo a estas tablas. El cliente
-- service_role (sbAdmin) ignora RLS; las políticas de abajo son una
-- red de seguridad para acceso directo de usuarios autenticados.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ------------------------------------------------------------
-- 1. ENUMs
-- ------------------------------------------------------------
CREATE TYPE estado_paciente AS ENUM (
  'en_tramite',        -- Fases 1→3 (captación, exámenes, citas)
  'apta_para_sala',    -- Fase 4 completa
  'programada',        -- Fase 5 completa (fecha + turno)
  'hospitalizada',     -- Fase 6 completa (cama asignada)
  'operada',           -- Fase 7: resolución exitosa
  'suspendida'         -- Fase 7: cancelada
);

CREATE TYPE turno_qx AS ENUM ('manana', 'tarde');

-- ------------------------------------------------------------
-- 2. Tabla principal: pacientes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pacientes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Fase 1 · Captación
  dni                   VARCHAR(20)  UNIQUE NOT NULL,
  nombre                VARCHAR(200) NOT NULL,
  hcl                   VARCHAR(50),
  telefono              VARCHAR(20),           -- 51XXXXXXXXX (para wa.me)
  diagnostico           TEXT,
  estado                estado_paciente NOT NULL DEFAULT 'en_tramite',

  -- Fase 2 · Exámenes (bloquean Fase 3+)
  laboratorio_completo  BOOLEAN NOT NULL DEFAULT FALSE,
  ekg                   BOOLEAN NOT NULL DEFAULT FALSE,

  -- Fase 3 · Citas e Interconsultas
  fecha_cita_cardiologia     DATE,
  fecha_cita_anestesiologia  DATE,
  riesgo_qx                  BOOLEAN NOT NULL DEFAULT FALSE,
  riesgo_anestesiologico     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Fase 4 · Pre-Hospitalización (→ 'apta_para_sala')
  hcl_hospitalizacion   BOOLEAN NOT NULL DEFAULT FALSE,
  consentimientos       BOOLEAN NOT NULL DEFAULT FALSE,
  solicitud_sala_dejada BOOLEAN NOT NULL DEFAULT FALSE,

  -- Fase 5 · Programación Quirúrgica
  fecha_cirugia         DATE,
  turno                 turno_qx,

  -- Fase 6 · Hospitalización
  cama_hospitalizacion  VARCHAR(20),
  fecha_hospitalizacion TIMESTAMPTZ,

  -- Fase 7 · Resolución
  fecha_resolucion      TIMESTAMPTZ,
  motivo_suspension     TEXT,                  -- solo si estado = 'suspendida'

  -- Auditoría
  created_by            UUID,                   -- auth.users.id del interno que registró
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pacientes_estado        ON public.pacientes(estado);
CREATE INDEX IF NOT EXISTS idx_pacientes_fecha_cirugia ON public.pacientes(fecha_cirugia);
CREATE INDEX IF NOT EXISTS idx_pacientes_turno         ON public.pacientes(turno);

-- ------------------------------------------------------------
-- 3. Trigger updated_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pacientes_updated_at ON public.pacientes;
CREATE TRIGGER trg_pacientes_updated_at
  BEFORE UPDATE ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- 4. Constraints de integridad (red de seguridad)
--    La validación autoritativa vive en el JS de la PWA.
-- ------------------------------------------------------------
ALTER TABLE public.pacientes
  ADD CONSTRAINT chk_programada_requiere_fecha_turno
    CHECK (estado <> 'programada' OR (fecha_cirugia IS NOT NULL AND turno IS NOT NULL));

ALTER TABLE public.pacientes
  ADD CONSTRAINT chk_hospitalizada_requiere_cama
    CHECK (estado <> 'hospitalizada' OR cama_hospitalizacion IS NOT NULL);

ALTER TABLE public.pacientes
  ADD CONSTRAINT chk_suspendida_tiene_motivo
    CHECK (estado <> 'suspendida' OR motivo_suspension IS NOT NULL);

-- ------------------------------------------------------------
-- 5. Auditoría: historial de cambios de estado
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.historial_estados (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id     UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  estado_anterior estado_paciente,
  estado_nuevo    estado_paciente NOT NULL,
  motivo          TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historial_paciente
  ON public.historial_estados(paciente_id, created_at DESC);

-- ------------------------------------------------------------
-- 6. Row Level Security
-- ------------------------------------------------------------
ALTER TABLE public.pacientes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_estados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pacientes_select" ON public.pacientes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pacientes_insert" ON public.pacientes
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pacientes_update" ON public.pacientes
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "pacientes_delete" ON public.pacientes
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "historial_select" ON public.historial_estados
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "historial_insert" ON public.historial_estados
  FOR INSERT TO authenticated WITH CHECK (true);

-- ------------------------------------------------------------
-- 7. Verificación
-- ------------------------------------------------------------
SELECT '✅ Tablas creadas:' AS status;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('pacientes','historial_estados')
ORDER BY table_name;

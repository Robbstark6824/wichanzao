-- ============================================================
-- COLA DE IMPRESIÓN REMOTA DE RECETAS (v17)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Generar la receta NO la imprime. Desde la app, con la receta ya generada,
-- se toca «Enviar a imprimir» y eso encola un trabajo acá. En la PC del
-- servicio corre un agente (tools/impresora/agente-impresion.ps1) que:
--
--   1) toma los trabajos en 'pendiente' y los pasa a 'imprimiendo',
--   2) baja el PDF de documentos/recetas/<id><variante>.pdf,
--   3) lo manda a la impresora,
--   4) los deja en 'impresa' o en 'error' con el detalle.
--
-- La app lee el estado para mostrar «En cola / Imprimiendo / Impresa».
-- Sirve igual para la receta completa (variante '') y la complementaria ('-2').
--
-- Esta tabla NO se sincroniza a las hojas de Google (GERESA): el Apps Script
-- solo escribe su lista blanca de columnas de 'pacientes'.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS public.impresiones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id     UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,

  -- '' = receta completa · '-2' = receta complementaria (faltantes de farmacia)
  variante        TEXT NOT NULL DEFAULT '' CHECK (variante IN ('', '-2')),

  -- Ruta dentro del bucket 'documentos' y nombre legible para el archivo temporal
  objeto          TEXT NOT NULL,
  nombre_archivo  TEXT,
  -- Texto para el log del agente y el panel de PC: "Receta AQV — NOMBRE"
  etiqueta        TEXT,

  copias          SMALLINT NOT NULL DEFAULT 1 CHECK (copias BETWEEN 1 AND 5),

  estado          TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'imprimiendo', 'impresa', 'error')),
  detalle_error   TEXT,
  impresora       TEXT,          -- qué impresora la sacó (la escribe el agente)

  solicitado_por  UUID,          -- auth.users.id de quien tocó el botón
  solicitado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tomado_at       TIMESTAMPTZ,   -- cuándo el agente la tomó
  impresa_at      TIMESTAMPTZ
);

-- El agente solo mira los pendientes: índice parcial, chico y siempre caliente.
CREATE INDEX IF NOT EXISTS idx_impresiones_cola
  ON public.impresiones(solicitado_at)
  WHERE estado IN ('pendiente', 'imprimiendo');

-- La app pide el último trabajo de cada paciente al abrir la ficha.
CREATE INDEX IF NOT EXISTS idx_impresiones_paciente
  ON public.impresiones(paciente_id, solicitado_at DESC);

-- ------------------------------------------------------------
-- Row Level Security — mismo criterio que el resto del proyecto:
-- cualquier usuario autenticado del servicio puede encolar y ver la cola.
-- El agente entra con la cuenta de un trabajador (no con service_role).
-- ------------------------------------------------------------
ALTER TABLE public.impresiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "impresiones_select" ON public.impresiones;
DROP POLICY IF EXISTS "impresiones_insert" ON public.impresiones;
DROP POLICY IF EXISTS "impresiones_update" ON public.impresiones;
DROP POLICY IF EXISTS "impresiones_delete" ON public.impresiones;

CREATE POLICY "impresiones_select" ON public.impresiones
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "impresiones_insert" ON public.impresiones
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "impresiones_update" ON public.impresiones
  FOR UPDATE TO authenticated USING (true);
-- Borrar solo sirve para cancelar algo que todavía no se imprimió.
CREATE POLICY "impresiones_delete" ON public.impresiones
  FOR DELETE TO authenticated USING (estado = 'pendiente');

COMMENT ON TABLE public.impresiones IS
  'Cola de impresión remota de recetas. La app encola; el agente de la PC del servicio imprime y actualiza el estado. Solo la app: NO se sincroniza a GERESA.';

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'impresiones'
 ORDER BY ordinal_position;

SELECT policyname, cmd FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'impresiones'
 ORDER BY policyname;

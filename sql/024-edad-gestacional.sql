-- ============================================================
-- EDAD GESTACIONAL QUE SE ACTUALIZA SOLA (v14)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- El servicio capta gestantes alrededor de la semana 36 cuando el feto ya va
-- en percentil 97, previendo que llegará muy grande a las 38-40 y terminará en
-- cesárea. Se las programa esperando a la semana 38.
--
-- El problema: la edad gestacional NO es un dato fijo, avanza cada día. En la
-- ficha quedaba congelada la del día de la captación ("GU 36ss 2/7 d x eco
-- 1TRI") y había que recalcular a mano cuántas semanas tiene hoy, y cuántas
-- tendrá el día de la cirugía. Varias veces al día.
--
-- La solución NO es guardar las semanas: sería volver a congelarlas. Se guarda
-- el punto de partida —la FUR, o la ecografía del primer trimestre— y la app
-- cuenta los días cada vez que se abre la ficha.
--
-- Si hay ecografía del primer trimestre, manda ella: es más fiable que la FUR
-- referida por la paciente.
-- ============================================================

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS fur          DATE,
  ADD COLUMN IF NOT EXISTS eco_fecha    DATE,
  ADD COLUMN IF NOT EXISTS eco_semanas  SMALLINT,
  ADD COLUMN IF NOT EXISTS eco_dias     SMALLINT;

COMMENT ON COLUMN public.pacientes.fur IS
  'Fecha de última regla. Punto de partida para contar la edad gestacional.';
COMMENT ON COLUMN public.pacientes.eco_fecha IS
  'Fecha de la ecografía del primer trimestre.';
COMMENT ON COLUMN public.pacientes.eco_semanas IS
  'Semanas de gestación que marcaba ESA ecografía (no las de hoy).';
COMMENT ON COLUMN public.pacientes.eco_dias IS
  'Días sueltos que marcaba ESA ecografía, 0-6 (no los de hoy).';

-- Coherencia: los días sueltos son 0-6 y las semanas, un embarazo posible.
ALTER TABLE public.pacientes
  DROP CONSTRAINT IF EXISTS chk_eco_dias_validos;
ALTER TABLE public.pacientes
  ADD CONSTRAINT chk_eco_dias_validos
    CHECK (eco_dias IS NULL OR (eco_dias >= 0 AND eco_dias <= 6));

ALTER TABLE public.pacientes
  DROP CONSTRAINT IF EXISTS chk_eco_semanas_validas;
ALTER TABLE public.pacientes
  ADD CONSTRAINT chk_eco_semanas_validas
    CHECK (eco_semanas IS NULL OR (eco_semanas >= 0 AND eco_semanas <= 45));

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'pacientes'
   AND column_name IN ('fur','eco_fecha','eco_semanas','eco_dias')
 ORDER BY column_name;

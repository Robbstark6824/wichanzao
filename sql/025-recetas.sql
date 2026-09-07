-- ============================================================
-- RECETAS QUIRÚRGICAS POR TIPO DE CIRUGÍA (v15)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- El servicio arma la receta de sala (insumos + medicación/anestesia) a mano,
-- copiando de un Excel por tipo de cirugía y rellenando los datos de la
-- paciente uno por uno. Todo lo que va en esa receta —salvo el sello y la
-- fecha— ya está en la app.
--
--   1) tipo_receta        — qué plantilla de receta corresponde a esta cirugía.
--                           Se elige en el paso 3 del wizard, al lado del
--                           procedimiento. Con esto la ficha habilita el botón
--                           "Receta" para exportar el PDF listo para imprimir.
--   2) receta_generada_at — cuándo se generó y subió el PDF por última vez.
--                           NULL = todavía no se generó. La página de PC lo usa
--                           para listar las recetas y avisar si los datos de la
--                           paciente cambiaron después de generarla.
--
-- IMPORTANTE: ninguno de los dos campos se sincroniza a las hojas de Google
-- (GERESA). El Apps Script escribe solo su lista blanca de columnas
-- (buildValuesNew / buildValuesOld); cualquier campo que no esté ahí se ignora.
-- Son campos exclusivos de la app.
-- ============================================================

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS tipo_receta        TEXT,
  ADD COLUMN IF NOT EXISTS receta_generada_at TIMESTAMPTZ;

-- Solo las 8 plantillas que existen en /RECETAS/. legrado, histerectomia y
-- prolapso comparten la misma lista de insumos/medicación pero se guardan por
-- separado para que el PDF salga con su propio título.
ALTER TABLE public.pacientes DROP CONSTRAINT IF EXISTS chk_tipo_receta;
ALTER TABLE public.pacientes
  ADD CONSTRAINT chk_tipo_receta
    CHECK (tipo_receta IS NULL OR tipo_receta IN (
      'aqv', 'cst', 'cst_aqv', 'cono_frio',
      'legrado', 'histerectomia', 'prolapso', 'tumorectomia'
    ));

COMMENT ON COLUMN public.pacientes.tipo_receta IS
  'Plantilla de receta quirúrgica a exportar (aqv | cst | cst_aqv | cono_frio | legrado | histerectomia | prolapso | tumorectomia). Solo la app: NO se sincroniza a las hojas GERESA.';
COMMENT ON COLUMN public.pacientes.receta_generada_at IS
  'Última vez que se generó y subió el PDF de la receta (storage: documentos/recetas/<id>.pdf). NULL = nunca. Solo la app.';

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'pacientes'
   AND column_name IN ('tipo_receta', 'receta_generada_at')
 ORDER BY column_name;

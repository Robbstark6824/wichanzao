-- ============================================================
-- RECETAS QUIRÚRGICAS EDITABLES DESDE LA APP (fase 1 de la sección 💊 Recetas)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor (una sola vez; se puede repetir)
-- ============================================================
-- Hasta ahora las 8 recetas (QX_RECETAS) estaban escritas en index.html y la
-- base solo aceptaba esas 8 claves en pacientes.tipo_receta (chk_tipo_receta).
-- Con este script:
--
--   1) recetas_plantillas            — una fila por receta (nombre, ítems de
--                                      insumos y de anestesia, si lleva la
--                                      lista de parto, activa/archivada).
--                                      Leen todos; crean y editan SOLO admins
--                                      (public.is_admin()). No se borran: se
--                                      archivan (activa = false).
--   2) recetas_plantillas_historial  — cada alta/cambio queda anotado con quién,
--                                      cuándo, y la receta antes/después. Lo
--                                      llena un trigger: la app no puede
--                                      saltárselo ni escribirlo a mano.
--   3) pacientes.tipo_receta         — deja la lista fija de 8 valores y pasa
--                                      a apuntar a recetas_plantillas(clave).
--
-- Se carga con las 8 recetas actuales, idénticas a las de index.html y
-- tools/recetas-plantillas.json. La app sigue trayendo esas 8 embebidas como
-- respaldo (sin conexión o si esta tabla todavía no existe).
--
-- NADA de esto va a las hojas GERESA: el Apps Script escribe solo su lista
-- blanca de columnas (buildValuesNew / buildValuesOld) y tipo_receta no está.
-- ============================================================

-- is_admin() vive en el Dashboard (no en sql/). Sin ella, este script no sirve.
DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Falta la función public.is_admin(); no se crea nada.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1) Plantillas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recetas_plantillas (
  clave         TEXT PRIMARY KEY
                CHECK (clave ~ '^[a-z0-9_]{2,40}$'),
  titulo        TEXT NOT NULL                          -- sale en el PDF: "RECETA QUIRÚRGICA — <titulo>"
                CHECK (length(btrim(titulo)) BETWEEN 1 AND 60),
  nombre_largo  TEXT NOT NULL                          -- se ve en el selector del paso 3
                CHECK (length(btrim(nombre_largo)) BETWEEN 1 AND 120),
  insumos       JSONB NOT NULL DEFAULT '[]'::jsonb     -- [{n, d, c}] nombre · dosis/detalle · cantidad
                CHECK (jsonb_typeof(insumos) = 'array'),
  anestesia     JSONB NOT NULL DEFAULT '[]'::jsonb
                CHECK (jsonb_typeof(anestesia) = 'array'),
  es_parto      BOOLEAN NOT NULL DEFAULT false,        -- suma la lista de útiles de parto
  activa        BOOLEAN NOT NULL DEFAULT true,         -- false = archivada (no sale en el selector)
  orden         INTEGER NOT NULL DEFAULT 100,
  version       INTEGER NOT NULL DEFAULT 1,            -- sube en cada cambio (evita pisar ediciones)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID DEFAULT auth.uid()
);

COMMENT ON TABLE public.recetas_plantillas IS
  'Recetas quirúrgicas por tipo de cirugía (módulo Qx). Leen todos los autenticados; crean/editan solo admins. No se borran, se archivan. Solo la app: NO se sincroniza a GERESA.';

-- ------------------------------------------------------------
-- 2) Historial
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recetas_plantillas_historial (
  id          BIGSERIAL PRIMARY KEY,
  clave       TEXT NOT NULL,
  accion      TEXT NOT NULL CHECK (accion IN ('crear', 'editar', 'archivar', 'reactivar')),
  version     INTEGER,
  antes       JSONB,
  despues     JSONB,
  por         UUID,
  por_nombre  TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recetas_plantillas_historial_clave_at
  ON public.recetas_plantillas_historial (clave, at DESC);

COMMENT ON TABLE public.recetas_plantillas_historial IS
  'Quién cambió qué receta y cuándo (antes/después). Lo escribe el trigger trg_recetas_plantillas_historial; la app solo lo lee (admins).';

-- Antes de guardar: sella fecha/autor, sube la versión y no deja cambiar la clave
-- (las pacientes apuntan a ella).
CREATE OR REPLACE FUNCTION public.recetas_plantillas_sellar()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.clave IS DISTINCT FROM OLD.clave THEN
      RAISE EXCEPTION 'La clave de una receta no se puede cambiar';
    END IF;
    NEW.created_at := OLD.created_at;
    NEW.version    := OLD.version + 1;
  ELSE
    NEW.version    := 1;
    NEW.created_at := now();
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_recetas_plantillas_sellar ON public.recetas_plantillas;
CREATE TRIGGER trg_recetas_plantillas_sellar
  BEFORE INSERT OR UPDATE ON public.recetas_plantillas
  FOR EACH ROW EXECUTE FUNCTION public.recetas_plantillas_sellar();

-- Después de guardar: anota en el historial (SECURITY DEFINER: la app no
-- tiene permiso de escribir el historial directamente).
CREATE OR REPLACE FUNCTION public.recetas_plantillas_historial_anotar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_accion TEXT;
  v_nombre TEXT;
  v_meta   TEXT[] := ARRAY['version', 'created_at', 'updated_at', 'updated_by'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_accion := 'crear';
  ELSE
    -- Guardar sin cambiar nada no deja rastro.
    IF (to_jsonb(NEW) - v_meta) = (to_jsonb(OLD) - v_meta) THEN
      RETURN NEW;
    END IF;
    IF OLD.activa AND NOT NEW.activa THEN v_accion := 'archivar';
    ELSIF NOT OLD.activa AND NEW.activa THEN v_accion := 'reactivar';
    ELSE v_accion := 'editar';
    END IF;
  END IF;

  SELECT name INTO v_nombre FROM public.workers WHERE id = auth.uid();

  INSERT INTO public.recetas_plantillas_historial (clave, accion, version, antes, despues, por, por_nombre)
  VALUES (NEW.clave, v_accion, NEW.version,
          CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) - v_meta END,
          to_jsonb(NEW) - v_meta,
          auth.uid(),
          COALESCE(v_nombre, CASE WHEN auth.uid() IS NULL THEN 'Carga inicial / SQL' END));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_recetas_plantillas_historial ON public.recetas_plantillas;
CREATE TRIGGER trg_recetas_plantillas_historial
  AFTER INSERT OR UPDATE ON public.recetas_plantillas
  FOR EACH ROW EXECUTE FUNCTION public.recetas_plantillas_historial_anotar();

-- ------------------------------------------------------------
-- Permisos (RLS)
-- ------------------------------------------------------------
ALTER TABLE public.recetas_plantillas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recetas_plantillas_historial ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.recetas_plantillas           FROM anon, authenticated;
REVOKE ALL ON public.recetas_plantillas_historial FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.recetas_plantillas           TO authenticated;
GRANT SELECT                 ON public.recetas_plantillas_historial TO authenticated;
-- Sin DELETE para nadie desde la app: las recetas se archivan.

DROP POLICY IF EXISTS recetas_plantillas_select ON public.recetas_plantillas;
CREATE POLICY recetas_plantillas_select ON public.recetas_plantillas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS recetas_plantillas_insert ON public.recetas_plantillas;
CREATE POLICY recetas_plantillas_insert ON public.recetas_plantillas
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS recetas_plantillas_update ON public.recetas_plantillas;
CREATE POLICY recetas_plantillas_update ON public.recetas_plantillas
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS recetas_plantillas_historial_select ON public.recetas_plantillas_historial;
CREATE POLICY recetas_plantillas_historial_select ON public.recetas_plantillas_historial
  FOR SELECT TO authenticated USING (public.is_admin());

-- ------------------------------------------------------------
-- Carga inicial: las 8 recetas actuales (idénticas a QX_RECETAS de index.html).
-- ON CONFLICT DO NOTHING: si se vuelve a correr no pisa lo editado en la app.
-- ------------------------------------------------------------
INSERT INTO public.recetas_plantillas (clave, titulo, nombre_largo, es_parto, orden, insumos, anestesia) VALUES
  ('aqv', 'AQV', 'AQV — Anticoncepción quirúrgica voluntaria', false, 10,
   '[{"n":"CLORURO DE SODIO 0.9%","d":"","c":"03 FCO"},{"n":"CEFAZOLINA","d":"1 G","c":"02 AMP"},{"n":"GUANTES LIMPIOS","d":"","c":"10 PAR"},{"n":"EQUIPO DE VENOCLISIS","d":"","c":"01 UNI"},{"n":"CATETER ENDOVENOSO PERIFERICO","d":"N° 18","c":"01 UNI"},{"n":"EQUIPO DE VOLUTROL","d":"","c":"01 UNI"},{"n":"HOJA DE BISTURI","d":"N° 21","c":"01 UNI"},{"n":"JERINGA DESCARTABLE","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLE","d":"5 ML","c":"01 UNI"},{"n":"GUANTES QUIRURGICOS","d":"7.5","c":"03 PAR"},{"n":"GUANTES QUIRURGICOS","d":"6.5","c":"03 PAR"},{"n":"GUANTES QUIRURGICOS","d":"7","c":"02 PAR"},{"n":"SUTURA CATGUT CROMICO","d":"N° 2/0 HR 35","c":"01 UNI"},{"n":"SUTURA CATGUT CROMICO","d":"N° 1 MR 40","c":"02 UNI"},{"n":"SUTURA ACIDO POLIGLICOLICO","d":"N° 1 MR 40","c":"02 UNI"},{"n":"SUTURA NYLON","d":"N° 3/0 TC 30","c":"01 UNI"},{"n":"SONDA NELATON","d":"N° 14","c":"01 UNI"},{"n":"YODOPOVIDONA SOLUCION X 120 ML","d":"","c":"01 UNI"},{"n":"YODOPOVIDONA ESPUMA X 120 ML","d":"","c":"01 UNI"},{"n":"AGUJA N° 25","d":"","c":"01 UNI"},{"n":"LLAVE TRIPLE VIA CON EXTENSION DISS","d":"","c":"01 UNI"},{"n":"GASA DE 15X50","d":"","c":"03 PAQ"},{"n":"GASA COMPRESA 48X48","d":"","c":"02 PAQ"},{"n":"TEGADERM 10X12","d":"","c":"01 UNI"},{"n":"BRAZALETE ADULTO","d":"","c":"01 UNI"},{"n":"TUBO DE SUCCION","d":"","c":"01 UNI"},{"n":"DRESSING","d":"","c":"02 UNI"},{"n":"SEDA NEGRA MULTIEMPAQUE","d":"2/0","c":"01 UNI"},{"n":"ESPARADRAPO","d":"","c":"01 UNI"},{"n":"ELECTROBISTURI","d":"","c":"01 UNI"},{"n":"MANDIL LIMPIO","d":"","c":"01 UNI"},{"n":"GORRO","d":"","c":"01 UNI"},{"n":"BOTAS","d":"","c":"01 PAR"},{"n":"MASCARILLA","d":"","c":"01 UNI"}]'::jsonb,
   '[{"n":"AGUJA DE PUNCION RAQUIDEA (BRAUN)","d":"N° 27","c":"01 UNI"},{"n":"BUPIVACAINA HIPERBARICA","d":"4 MG","c":"01 AMP"},{"n":"GUANTES LIMPIOS","d":"","c":"02 PAR"},{"n":"FENTANILO 0.5%","d":"10 ML","c":"01 AMP"},{"n":"DEXAMETASONA","d":"4 MG","c":"02 AMP"},{"n":"DIMENHIDRINATO","d":"50 MG","c":"01 AMP"},{"n":"METOCLOPRAMIDA","d":"10 MG","c":"01 AMP"},{"n":"TRAMADOL","d":"50 MG","c":"02 AMP"},{"n":"METAMIZOL","d":"1 G","c":"02 AMP"},{"n":"ETILEFRINA","d":"10 MG","c":"01 AMP"},{"n":"ATROPINA","d":"1 MG","c":"01 AMP"},{"n":"JERINGA DESCARTABLES","d":"20 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"5 ML","c":"01 UNI"},{"n":"AGUJA","d":"N° 18","c":"02 UNI"},{"n":"GUANTES QX","d":"7","c":"01 PAR"}]'::jsonb),
  ('cst', 'CST', 'CST — Cesárea segmentaria transversa', true, 20,
   '[{"n":"CLORURO DE SODIO 0.9%","d":"","c":"03 FCO"},{"n":"OXITOCINA","d":"10 UI","c":"05 AMP"},{"n":"CEFAZOLINA","d":"1 G","c":"02 AMP"},{"n":"EQUIPO VOLUTROL","d":"","c":"01 UNI"},{"n":"EQUIPO DE VENOCLISIS","d":"","c":"01 UNI"},{"n":"CATETER ENDOVENOSO PERIFERICO","d":"N° 18","c":"01 UNI"},{"n":"HOJA DE BISTURI","d":"N° 21","c":"02 UNI"},{"n":"JERINGA DESCARTABLE","d":"10 ML","c":"02 UNI"},{"n":"JERINGA DESCARTABLE","d":"5 ML","c":"02 UNI"},{"n":"GUANTES QUIRURGICOS","d":"7.5","c":"02 PAR"},{"n":"GUANTES QUIRURGICOS","d":"7","c":"02 PAR"},{"n":"CATGUT CROMICO","d":"N° 2/0 HR 35","c":"02 UNI"},{"n":"CATGUT CROMICO","d":"N° 1 HR 40","c":"01 UNI"},{"n":"ACIDO POLIETILENGLICOLITICO","d":"N° 1 HR 35-40","c":"01 UNI"},{"n":"NYLON","d":"N° 3/0 TC 30","c":"01 UNI"},{"n":"SONDA NELATON","d":"N° 14","c":"01 UNI"},{"n":"YODOPOVIDONA SOLUCION X 120 ML","d":"","c":"01 UNI"},{"n":"YODOPOVIDONA ESPUMA X 120 ML","d":"","c":"01 UNI"},{"n":"AGUJA N° 25","d":"","c":"02 UNI"},{"n":"LLAVE TRIPLE VIA CON EXTENSION DIS","d":"","c":"01 UNI"},{"n":"COMPRESA DE GASA DE 15X50","d":"","c":"03 UNI"},{"n":"TEGADERM 10X12","d":"","c":"01 UNI"},{"n":"BRAZALETE ADULTO","d":"","c":"01 UNI"},{"n":"TUBO DE SUCCION","d":"","c":"01 UNI"},{"n":"DRESSING","d":"","c":"01 UNI"},{"n":"ESPARADRAPO","d":"","c":"01 UNI"},{"n":"ERGOMETRINA 0.2%","d":"","c":"01 UNI"},{"n":"MISOPROSTOL","d":"200 MG","c":"04 UNI"},{"n":"GLUCONATO DE CALCIO","d":"","c":"01 UNI"},{"n":"ELECTROBISTURI","d":"","c":"01 UNI"},{"n":"GUANTES NO ESTERILES","d":"","c":"10 PAR"},{"n":"MANDIL","d":"","c":"01 UNI"},{"n":"BOTAS","d":"","c":"01 UNI"},{"n":"MASCARILLA QX","d":"","c":"01 UNI"},{"n":"GORRO","d":"","c":"01 UNI"},{"n":"GASAS COMPRESAS 48X48","d":"","c":"02 UNI"},{"n":"ACIDO TRANEXAMICO","d":"1 G","c":"01 UNI"}]'::jsonb,
   '[{"n":"AGUJA DE PUNCION RAQUIDEA (BRAUN)","d":"N° 27","c":"01 UNI"},{"n":"BUPIVACAINA HIPERBARICA","d":"","c":"01 AMP"},{"n":"GUANTES LIMPIOS","d":"","c":"02 UNI"},{"n":"FENTANILO 0.5%","d":"10 ML","c":"01 AMP"},{"n":"DEXAMETASONA","d":"4 MG","c":"02 AMP"},{"n":"DIMENHIDRINATO","d":"50 MG","c":"01 AMP"},{"n":"METOCLOPRAMIDA","d":"10 MG","c":"01 AMP"},{"n":"TRAMADOL","d":"50 MG","c":"02 AMP"},{"n":"METAMIZOL","d":"1 G","c":"02 AMP"},{"n":"ETILEFRINA","d":"10 MG","c":"01 AMP"},{"n":"ATROPINA","d":"1 MG","c":"01 AMP"},{"n":"ELECTRODOS ADULTO","d":"","c":"03 UNI"},{"n":"JERINGA DESCARTABLES","d":"20 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"5 ML","c":"02 UNI"},{"n":"AGUJA","d":"N° 18","c":"02 UNI"},{"n":"GUANTES QX","d":"7","c":"01 PAR"}]'::jsonb),
  ('cst_aqv', 'CST + AQV', 'CST + AQV — Cesárea + ligadura', true, 30,
   '[{"n":"CLORURO DE SODIO 0.9%","d":"","c":"03 FCO"},{"n":"OXITOCINA","d":"10 UI","c":"04 AMP"},{"n":"CEFAZOLINA","d":"1 G","c":"02 AMP"},{"n":"GUANTES LIMPIOS","d":"","c":"10 PAR"},{"n":"EQUIPO DE VENOCLISIS","d":"","c":"01 UNI"},{"n":"CATETER ENDOVENOSO PERIFERICO","d":"N° 18","c":"01 UNI"},{"n":"EQUIPO DE VOLUTROL","d":"","c":"01 UNI"},{"n":"HOJA DE BISTURI","d":"N° 21","c":"01 UNI"},{"n":"JERINGA DESCARTABLE","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLE","d":"5 ML","c":"01 UNI"},{"n":"GUANTES QUIRURGICOS","d":"7.5","c":"03 PAR"},{"n":"GUANTES QUIRURGICOS","d":"6.5","c":"03 PAR"},{"n":"GUANTES QUIRURGICOS","d":"7","c":"02 PAR"},{"n":"SUTURA CATGUT CROMICO","d":"N° 2/0 HR 35","c":"01 UNI"},{"n":"SUTURA CATGUT CROMICO","d":"N° 1 MR 40","c":"02 UNI"},{"n":"SUTURA ACIDO POLIGLICOLICO","d":"N° 1 MR 40","c":"02 UNI"},{"n":"SUTURA NYLON","d":"N° 3/0 TC 30","c":"01 UNI"},{"n":"SONDA NELATON","d":"N° 14","c":"01 UNI"},{"n":"YODOPOVIDONA SOLUCION X 120 ML","d":"","c":"01 UNI"},{"n":"YODOPOVIDONA ESPUMA X 120 ML","d":"","c":"01 UNI"},{"n":"AGUJA N° 25","d":"","c":"01 UNI"},{"n":"LLAVE TRIPLE VIA CON EXTENSION DISS","d":"","c":"01 UNI"},{"n":"GASA DE 15X50","d":"","c":"03 PAQ"},{"n":"GASA COMPRESA 48X48","d":"","c":"02 PAQ"},{"n":"TEGADERM 10X12","d":"","c":"01 UNI"},{"n":"BRAZALETE ADULTO","d":"","c":"01 UNI"},{"n":"TUBO DE SUCCION","d":"","c":"01 UNI"},{"n":"DRESSING","d":"","c":"02 UNI"},{"n":"SEDA NEGRA MULTIEMPAQUE","d":"2/0","c":"01 UNI"},{"n":"ESPARADRAPO","d":"","c":"01 UNI"},{"n":"ELECTROBISTURI","d":"","c":"01 UNI"},{"n":"ERGOMETRINA 0.2%","d":"","c":"01 AMP"},{"n":"GLUCONATO DE CALCIO","d":"","c":"01 AMP"},{"n":"MISOPROSTOL","d":"200 MG","c":"04 TAB"},{"n":"MANDIL LIMPIO","d":"","c":"01 UNI"},{"n":"GORRO","d":"","c":"01 UNI"},{"n":"BOTAS","d":"","c":"01 PAR"},{"n":"MASCARILLA","d":"","c":"01 UNI"}]'::jsonb,
   '[{"n":"AGUJA DE PUNCION RAQUIDEA (BRAUN)","d":"N° 27","c":"01 UNI"},{"n":"BUPIVACAINA HIPERBARICA","d":"4 MG","c":"01 AMP"},{"n":"GUANTES LIMPIOS","d":"","c":"02 PAR"},{"n":"FENTANILO 0.5%","d":"10 ML","c":"01 AMP"},{"n":"DEXAMETASONA","d":"4 MG","c":"02 AMP"},{"n":"DIMENHIDRINATO","d":"50 MG","c":"01 AMP"},{"n":"METOCLOPRAMIDA","d":"10 MG","c":"01 AMP"},{"n":"TRAMADOL","d":"50 MG","c":"02 AMP"},{"n":"METAMIZOL","d":"1 G","c":"02 AMP"},{"n":"ETILEFRINA","d":"10 MG","c":"01 AMP"},{"n":"ATROPINA","d":"1 MG","c":"01 AMP"},{"n":"JERINGA DESCARTABLES","d":"20 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"5 ML","c":"01 UNI"},{"n":"AGUJA","d":"N° 18","c":"02 UNI"},{"n":"GUANTES QX","d":"7","c":"01 PAR"}]'::jsonb),
  ('cono_frio', 'CONO FRÍO', 'Cono frío — Conización cervical', false, 40,
   '[{"n":"CLORURO DE SODIO 0.9%","d":"","c":"03 FCO"},{"n":"VENDA 5X5","d":"","c":"02 UNI"},{"n":"CEFAZOLINA","d":"1 G","c":"02 AMP"},{"n":"EQUIPO DE VENOCLISIS","d":"","c":"01 UNI"},{"n":"CATETER ENDOVENOSO PERIFERICO","d":"N° 18","c":"01 UNI"},{"n":"EQUIPO DE VOLUTROL","d":"","c":"01 UNI"},{"n":"HOJA DE BISTURI","d":"N° 21","c":"01 UNI"},{"n":"JERINGA DESCARTABLE","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLE","d":"5 ML","c":"01 UNI"},{"n":"GUANTES QUIRURGICOS","d":"7.5","c":"04 PAR"},{"n":"GUANTES QUIRURGICOS","d":"7","c":"02 PAR"},{"n":"GUANTES QUIRURGICOS","d":"6.5","c":"03 PAR"},{"n":"SUTURA ACIDO POLIETILENGLICOLITICO","d":"N° 1 MR 40","c":"04 UNI"},{"n":"YODOPOVIDONA SOLUCION X 120 ML","d":"","c":"01 UNI"},{"n":"YODOPOVIDONA ESPUMA X 120 ML","d":"","c":"01 UNI"},{"n":"AGUJA N° 25","d":"","c":"02 UNI"},{"n":"LLAVE TRIPLE VIA CON EXTENSION DIS","d":"","c":"01 UNI"},{"n":"GASA DE 15X50","d":"","c":"03 UNI"},{"n":"GASA COMPRESA 48X48","d":"","c":"02 PAQ"},{"n":"TEGADERM 10X12","d":"","c":"01 UNI"},{"n":"BRAZALETE ADULTO","d":"","c":"01 UNI"},{"n":"TUBO DE SUCCION","d":"","c":"01 UNI"},{"n":"FRASCO COLECTOR DE ORINA","d":"","c":"01 UNI"},{"n":"GUANTES LIMPIOS","d":"","c":"10 PAR"},{"n":"GORRO","d":"","c":"01 UNI"},{"n":"MANDIL LIMPIO","d":"","c":"01 UNI"},{"n":"BOTAS","d":"","c":"01 PAR"},{"n":"MASCARILLA","d":"","c":"01 UNI"}]'::jsonb,
   '[{"n":"AGUJA DE PUNCION RAQUIDEA (BRAUN)","d":"N° 27","c":"01 UNI"},{"n":"BUPIVACAINA HIPERBARICA","d":"4 MG","c":"01 AMP"},{"n":"GUANTES LIMPIOS","d":"","c":"03 PAR"},{"n":"FENTANILO 0.5%","d":"10 ML","c":"01 AMP"},{"n":"DEXAMETASONA","d":"4 MG","c":"02 AMP"},{"n":"DIMENHIDRINATO","d":"50 MG","c":"01 AMP"},{"n":"METOCLOPRAMIDA","d":"10 MG","c":"01 AMP"},{"n":"OMEPRAZOL","d":"40 MG","c":"01 AMP"},{"n":"TRAMADOL","d":"50 MG","c":"02 AMP"},{"n":"METAMIZOL","d":"1 G","c":"02 AMP"},{"n":"ETILEFRINA","d":"10 MG","c":"01 AMP"},{"n":"ATROPINA","d":"1 MG","c":"01 AMP"},{"n":"MIDAZOLAM","d":"5 MG","c":"01 AMP"},{"n":"JERINGA DESCARTABLES","d":"20 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"5 ML","c":"01 UNI"},{"n":"AGUJA","d":"N° 18","c":"02 UNI"},{"n":"GUANTES QX","d":"7","c":"01 PAR"}]'::jsonb),
  ('legrado', 'LEGRADO', 'Legrado uterino', false, 50,
   '[{"n":"CLORURO DE SODIO 0.9%","d":"","c":"03 FCO"},{"n":"VENDA 5X5","d":"","c":"02 UNI"},{"n":"CEFAZOLINA","d":"1 G","c":"02 AMP"},{"n":"ELECTROBISTURI","d":"","c":"01 UNI"},{"n":"EQUIPO DE VENOCLISIS","d":"","c":"01 UNI"},{"n":"CATETER ENDOVENOSO PERIFERICO","d":"N° 18","c":"01 UNI"},{"n":"EQUIPO DE VOLUTROL","d":"","c":"01 UNI"},{"n":"HOJA DE BISTURI","d":"N° 21","c":"01 UNI"},{"n":"JERINGA DESCARTABLE","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLE","d":"5 ML","c":"01 UNI"},{"n":"GUANTES QUIRURGICOS","d":"7.5","c":"04 PAR"},{"n":"GUANTES QUIRURGICOS","d":"7","c":"02 PAR"},{"n":"GUANTES QUIRURGICOS","d":"6.5","c":"03 PAR"},{"n":"SUTURA CATGUT CROMICO","d":"N° 2/0 MR 40","c":"02 UNI"},{"n":"SUTURA CATGUT CROMICO","d":"N° 1 MR 40","c":"01 UNI"},{"n":"SUTURA ACIDO POLIETILENGLICOLITICO","d":"N° 1 MR 40","c":"06 UNI"},{"n":"SUTURA NYLON","d":"N° 3/0 TC 30","c":"01 UNI"},{"n":"SONDA FOLEY CON BOLSA COLECTORA DE ORINA","d":"N° 14","c":"01 UNI"},{"n":"YODOPOVIDONA SOLUCION X 120 ML","d":"","c":"01 UNI"},{"n":"YODOPOVIDONA ESPUMA X 120 ML","d":"","c":"01 UNI"},{"n":"AGUJA N° 25","d":"","c":"02 UNI"},{"n":"LLAVE TRIPLE VIA CON EXTENSION DIS","d":"","c":"01 UNI"},{"n":"GASA DE 15X50","d":"","c":"03 UNI"},{"n":"GASA COMPRESA 48X48","d":"","c":"02 PAQ"},{"n":"TEGADERM 10X12","d":"","c":"01 UNI"},{"n":"BRAZALETE ADULTO","d":"","c":"01 UNI"},{"n":"TUBO DE SUCCION","d":"","c":"01 UNI"},{"n":"DRESSING","d":"","c":"02 UNI"},{"n":"FRASCO COLECTOR DE ORINA","d":"","c":"01 UNI"},{"n":"GUANTES LIMPIOS","d":"","c":"10 PAR"},{"n":"ESPARADRAPO","d":"","c":"01 UNI"},{"n":"GORRO","d":"","c":"01 UNI"},{"n":"MANDIL LIMPIO","d":"","c":"01 UNI"},{"n":"BOTAS","d":"","c":"01 PAR"},{"n":"MASCARILLA","d":"","c":"01 UNI"}]'::jsonb,
   '[{"n":"AGUJA DE PUNCION RAQUIDEA (BRAUN)","d":"N° 27","c":"01 UNI"},{"n":"BUPIVACAINA HIPERBARICA","d":"4 MG","c":"01 AMP"},{"n":"GUANTES LIMPIOS","d":"","c":"03 PAR"},{"n":"FENTANILO 0.5%","d":"10 ML","c":"01 AMP"},{"n":"DEXAMETASONA","d":"4 MG","c":"02 AMP"},{"n":"DIMENHIDRINATO","d":"50 MG","c":"01 AMP"},{"n":"METOCLOPRAMIDA","d":"10 MG","c":"01 AMP"},{"n":"OMEPRAZOL","d":"40 MG","c":"01 AMP"},{"n":"TRAMADOL","d":"50 MG","c":"02 AMP"},{"n":"METAMIZOL","d":"1 G","c":"02 AMP"},{"n":"ETILEFRINA","d":"10 MG","c":"01 AMP"},{"n":"ATROPINA","d":"1 MG","c":"01 AMP"},{"n":"MIDAZOLAM","d":"5 MG","c":"01 AMP"},{"n":"JERINGA DESCARTABLES","d":"20 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"5 ML","c":"01 UNI"},{"n":"AGUJA","d":"N° 18","c":"02 UNI"},{"n":"GUANTES QX","d":"7","c":"01 PAR"}]'::jsonb),
  ('histerectomia', 'HISTERECTOMÍA', 'Histerectomía', false, 60,
   '[{"n":"CLORURO DE SODIO 0.9%","d":"","c":"03 FCO"},{"n":"VENDA 5X5","d":"","c":"02 UNI"},{"n":"CEFAZOLINA","d":"1 G","c":"02 AMP"},{"n":"ELECTROBISTURI","d":"","c":"01 UNI"},{"n":"EQUIPO DE VENOCLISIS","d":"","c":"01 UNI"},{"n":"CATETER ENDOVENOSO PERIFERICO","d":"N° 18","c":"01 UNI"},{"n":"EQUIPO DE VOLUTROL","d":"","c":"01 UNI"},{"n":"HOJA DE BISTURI","d":"N° 21","c":"01 UNI"},{"n":"JERINGA DESCARTABLE","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLE","d":"5 ML","c":"01 UNI"},{"n":"GUANTES QUIRURGICOS","d":"7.5","c":"04 PAR"},{"n":"GUANTES QUIRURGICOS","d":"7","c":"02 PAR"},{"n":"GUANTES QUIRURGICOS","d":"6.5","c":"03 PAR"},{"n":"SUTURA CATGUT CROMICO","d":"N° 2/0 MR 40","c":"02 UNI"},{"n":"SUTURA CATGUT CROMICO","d":"N° 1 MR 40","c":"01 UNI"},{"n":"SUTURA ACIDO POLIETILENGLICOLITICO","d":"N° 1 MR 40","c":"06 UNI"},{"n":"SUTURA NYLON","d":"N° 3/0 TC 30","c":"01 UNI"},{"n":"SONDA FOLEY CON BOLSA COLECTORA DE ORINA","d":"N° 14","c":"01 UNI"},{"n":"YODOPOVIDONA SOLUCION X 120 ML","d":"","c":"01 UNI"},{"n":"YODOPOVIDONA ESPUMA X 120 ML","d":"","c":"01 UNI"},{"n":"AGUJA N° 25","d":"","c":"02 UNI"},{"n":"LLAVE TRIPLE VIA CON EXTENSION DIS","d":"","c":"01 UNI"},{"n":"GASA DE 15X50","d":"","c":"03 UNI"},{"n":"GASA COMPRESA 48X48","d":"","c":"02 PAQ"},{"n":"TEGADERM 10X12","d":"","c":"01 UNI"},{"n":"BRAZALETE ADULTO","d":"","c":"01 UNI"},{"n":"TUBO DE SUCCION","d":"","c":"01 UNI"},{"n":"DRESSING","d":"","c":"02 UNI"},{"n":"FRASCO COLECTOR DE ORINA","d":"","c":"01 UNI"},{"n":"GUANTES LIMPIOS","d":"","c":"10 PAR"},{"n":"ESPARADRAPO","d":"","c":"01 UNI"},{"n":"GORRO","d":"","c":"01 UNI"},{"n":"MANDIL LIMPIO","d":"","c":"01 UNI"},{"n":"BOTAS","d":"","c":"01 PAR"},{"n":"MASCARILLA","d":"","c":"01 UNI"}]'::jsonb,
   '[{"n":"AGUJA DE PUNCION RAQUIDEA (BRAUN)","d":"N° 27","c":"01 UNI"},{"n":"BUPIVACAINA HIPERBARICA","d":"4 MG","c":"01 AMP"},{"n":"GUANTES LIMPIOS","d":"","c":"03 PAR"},{"n":"FENTANILO 0.5%","d":"10 ML","c":"01 AMP"},{"n":"DEXAMETASONA","d":"4 MG","c":"02 AMP"},{"n":"DIMENHIDRINATO","d":"50 MG","c":"01 AMP"},{"n":"METOCLOPRAMIDA","d":"10 MG","c":"01 AMP"},{"n":"OMEPRAZOL","d":"40 MG","c":"01 AMP"},{"n":"TRAMADOL","d":"50 MG","c":"02 AMP"},{"n":"METAMIZOL","d":"1 G","c":"02 AMP"},{"n":"ETILEFRINA","d":"10 MG","c":"01 AMP"},{"n":"ATROPINA","d":"1 MG","c":"01 AMP"},{"n":"MIDAZOLAM","d":"5 MG","c":"01 AMP"},{"n":"JERINGA DESCARTABLES","d":"20 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"5 ML","c":"01 UNI"},{"n":"AGUJA","d":"N° 18","c":"02 UNI"},{"n":"GUANTES QX","d":"7","c":"01 PAR"}]'::jsonb),
  ('prolapso', 'PROLAPSO', 'Prolapso genital', false, 70,
   '[{"n":"CLORURO DE SODIO 0.9%","d":"","c":"03 FCO"},{"n":"VENDA 5X5","d":"","c":"02 UNI"},{"n":"CEFAZOLINA","d":"1 G","c":"02 AMP"},{"n":"ELECTROBISTURI","d":"","c":"01 UNI"},{"n":"EQUIPO DE VENOCLISIS","d":"","c":"01 UNI"},{"n":"CATETER ENDOVENOSO PERIFERICO","d":"N° 18","c":"01 UNI"},{"n":"EQUIPO DE VOLUTROL","d":"","c":"01 UNI"},{"n":"HOJA DE BISTURI","d":"N° 21","c":"01 UNI"},{"n":"JERINGA DESCARTABLE","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLE","d":"5 ML","c":"01 UNI"},{"n":"GUANTES QUIRURGICOS","d":"7.5","c":"04 PAR"},{"n":"GUANTES QUIRURGICOS","d":"7","c":"02 PAR"},{"n":"GUANTES QUIRURGICOS","d":"6.5","c":"03 PAR"},{"n":"SUTURA CATGUT CROMICO","d":"N° 2/0 MR 40","c":"02 UNI"},{"n":"SUTURA CATGUT CROMICO","d":"N° 1 MR 40","c":"01 UNI"},{"n":"SUTURA ACIDO POLIETILENGLICOLITICO","d":"N° 1 MR 40","c":"06 UNI"},{"n":"SUTURA NYLON","d":"N° 3/0 TC 30","c":"01 UNI"},{"n":"SONDA FOLEY CON BOLSA COLECTORA DE ORINA","d":"N° 14","c":"01 UNI"},{"n":"YODOPOVIDONA SOLUCION X 120 ML","d":"","c":"01 UNI"},{"n":"YODOPOVIDONA ESPUMA X 120 ML","d":"","c":"01 UNI"},{"n":"AGUJA N° 25","d":"","c":"02 UNI"},{"n":"LLAVE TRIPLE VIA CON EXTENSION DIS","d":"","c":"01 UNI"},{"n":"GASA DE 15X50","d":"","c":"03 UNI"},{"n":"GASA COMPRESA 48X48","d":"","c":"02 PAQ"},{"n":"TEGADERM 10X12","d":"","c":"01 UNI"},{"n":"BRAZALETE ADULTO","d":"","c":"01 UNI"},{"n":"TUBO DE SUCCION","d":"","c":"01 UNI"},{"n":"DRESSING","d":"","c":"02 UNI"},{"n":"FRASCO COLECTOR DE ORINA","d":"","c":"01 UNI"},{"n":"GUANTES LIMPIOS","d":"","c":"10 PAR"},{"n":"ESPARADRAPO","d":"","c":"01 UNI"},{"n":"GORRO","d":"","c":"01 UNI"},{"n":"MANDIL LIMPIO","d":"","c":"01 UNI"},{"n":"BOTAS","d":"","c":"01 PAR"},{"n":"MASCARILLA","d":"","c":"01 UNI"}]'::jsonb,
   '[{"n":"AGUJA DE PUNCION RAQUIDEA (BRAUN)","d":"N° 27","c":"01 UNI"},{"n":"BUPIVACAINA HIPERBARICA","d":"4 MG","c":"01 AMP"},{"n":"GUANTES LIMPIOS","d":"","c":"03 PAR"},{"n":"FENTANILO 0.5%","d":"10 ML","c":"01 AMP"},{"n":"DEXAMETASONA","d":"4 MG","c":"02 AMP"},{"n":"DIMENHIDRINATO","d":"50 MG","c":"01 AMP"},{"n":"METOCLOPRAMIDA","d":"10 MG","c":"01 AMP"},{"n":"OMEPRAZOL","d":"40 MG","c":"01 AMP"},{"n":"TRAMADOL","d":"50 MG","c":"02 AMP"},{"n":"METAMIZOL","d":"1 G","c":"02 AMP"},{"n":"ETILEFRINA","d":"10 MG","c":"01 AMP"},{"n":"ATROPINA","d":"1 MG","c":"01 AMP"},{"n":"MIDAZOLAM","d":"5 MG","c":"01 AMP"},{"n":"JERINGA DESCARTABLES","d":"20 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"5 ML","c":"01 UNI"},{"n":"AGUJA","d":"N° 18","c":"02 UNI"},{"n":"GUANTES QX","d":"7","c":"01 PAR"}]'::jsonb),
  ('tumorectomia', 'TUMORECTOMÍA (EXÉRESIS DE FIBROADENOMA)', 'Tumorectomía — Exéresis de fibroadenoma', false, 80,
   '[{"n":"CLORURO DE SODIO 0.9%","d":"","c":"03 FCO"},{"n":"VENDA 5X5","d":"","c":"02 UNI"},{"n":"CEFAZOLINA","d":"1 G","c":"02 AMP"},{"n":"EQUIPO DE VENOCLISIS","d":"","c":"01 UNI"},{"n":"CATETER ENDOVENOSO PERIFERICO","d":"N° 18","c":"01 UNI"},{"n":"EQUIPO DE VOLUTROL","d":"","c":"01 UNI"},{"n":"HOJA DE BISTURI","d":"N° 21","c":"01 UNI"},{"n":"JERINGA DESCARTABLE","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLE","d":"5 ML","c":"01 UNI"},{"n":"GUANTES QUIRURGICOS","d":"7.5","c":"04 PAR"},{"n":"GUANTES QUIRURGICOS","d":"7","c":"02 PAR"},{"n":"GUANTES QUIRURGICOS","d":"6.5","c":"03 PAR"},{"n":"SUTURA CATGUT CROMICO","d":"N° 2/0 MR 40","c":"03 UNI"},{"n":"SUTURA ACIDO POLIETILENGLICOLITICO","d":"N° 1 MR 40","c":"04 UNI"},{"n":"SUTURA NYLON","d":"N° 3/0 TC 30","c":"01 UNI"},{"n":"YODOPOVIDONA SOLUCION X 120 ML","d":"","c":"01 UNI"},{"n":"YODOPOVIDONA ESPUMA X 120 ML","d":"","c":"01 UNI"},{"n":"AGUJA N° 25","d":"","c":"02 UNI"},{"n":"LLAVE TRIPLE VIA CON EXTENSION DIS","d":"","c":"01 UNI"},{"n":"GASA DE 15X50","d":"","c":"03 UNI"},{"n":"GASA COMPRESA 48X48","d":"","c":"02 PAQ"},{"n":"BRAZALETE ADULTO","d":"","c":"01 UNI"},{"n":"TUBO DE SUCCION","d":"","c":"01 UNI"},{"n":"FRASCO COLECTOR DE ORINA","d":"","c":"01 UNI"},{"n":"GUANTES LIMPIOS","d":"","c":"10 PAR"},{"n":"GORRO","d":"","c":"01 UNI"},{"n":"MANDIL LIMPIO","d":"","c":"01 UNI"},{"n":"BOTAS","d":"","c":"01 PAR"},{"n":"MASCARILLA","d":"","c":"01 UNI"}]'::jsonb,
   '[{"n":"AGUJA DE PUNCION RAQUIDEA (BRAUN)","d":"N° 27","c":"01 UNI"},{"n":"BUPIVACAINA HIPERBARICA","d":"4 MG","c":"01 AMP"},{"n":"GUANTES LIMPIOS","d":"","c":"03 PAR"},{"n":"FENTANILO 0.5%","d":"10 ML","c":"01 AMP"},{"n":"DEXAMETASONA","d":"4 MG","c":"02 AMP"},{"n":"DIMENHIDRINATO","d":"50 MG","c":"01 AMP"},{"n":"METOCLOPRAMIDA","d":"10 MG","c":"01 AMP"},{"n":"OMEPRAZOL","d":"40 MG","c":"01 AMP"},{"n":"TRAMADOL","d":"50 MG","c":"02 AMP"},{"n":"METAMIZOL","d":"1 G","c":"02 AMP"},{"n":"ETILEFRINA","d":"10 MG","c":"01 AMP"},{"n":"ATROPINA","d":"1 MG","c":"01 AMP"},{"n":"MIDAZOLAM","d":"5 MG","c":"01 AMP"},{"n":"JERINGA DESCARTABLES","d":"20 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"10 ML","c":"01 UNI"},{"n":"JERINGA DESCARTABLES","d":"5 ML","c":"01 UNI"},{"n":"AGUJA","d":"N° 18","c":"02 UNI"},{"n":"GUANTES QX","d":"7","c":"01 PAR"}]'::jsonb)
ON CONFLICT (clave) DO NOTHING;

-- ------------------------------------------------------------
-- 3) pacientes.tipo_receta: de lista fija (8 valores) a referencia a la tabla.
--    Las recetas no se borran, así que la referencia nunca queda colgando.
-- ------------------------------------------------------------
ALTER TABLE public.pacientes DROP CONSTRAINT IF EXISTS chk_tipo_receta;
ALTER TABLE public.pacientes DROP CONSTRAINT IF EXISTS fk_tipo_receta;
ALTER TABLE public.pacientes
  ADD CONSTRAINT fk_tipo_receta
    FOREIGN KEY (tipo_receta) REFERENCES public.recetas_plantillas (clave)
    ON UPDATE CASCADE ON DELETE RESTRICT;

COMMENT ON COLUMN public.pacientes.tipo_receta IS
  'Receta quirúrgica a exportar (clave de recetas_plantillas). Solo la app: NO se sincroniza a las hojas GERESA.';

-- ============================================================
-- VERIFICACIÓN — debe listar las 8 recetas, 8 filas de historial "crear"
-- y la referencia fk_tipo_receta.
-- ============================================================
SELECT clave, titulo, es_parto, activa, orden, version,
       jsonb_array_length(insumos) AS n_insumos, jsonb_array_length(anestesia) AS n_anestesia
  FROM public.recetas_plantillas ORDER BY orden;
SELECT accion, count(*) FROM public.recetas_plantillas_historial GROUP BY accion;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'public.pacientes'::regclass AND conname IN ('chk_tipo_receta', 'fk_tipo_receta');

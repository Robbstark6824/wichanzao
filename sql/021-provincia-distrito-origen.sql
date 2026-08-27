-- ============================================================
-- MÓDULO PROGRAMACIÓN QUIRÚRGICA — v13 (provincia y distrito de origen)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Hasta ahora provincia y distrito de origen se DERIVABAN del nombre del
-- establecimiento (el catálogo trae "NOMBRE - PROVINCIA - DISTRITO") y, para
-- paciente propia, iban vacías: es lo que pide GERESA y lo que hacen los demás
-- hospitales de la hoja regional.
--
-- El hospital decidió llenarlas siempre. Para paciente propia se usan las del
-- propio establecimiento (TRUJILLO / LAREDO). Además pasan a ser campos
-- editables en la app, por si el catálogo trae un sufijo que no corresponde.
-- ============================================================

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS provincia_origen TEXT,
  ADD COLUMN IF NOT EXISTS distrito_origen  TEXT;

-- ------------------------------------------------------------
-- Relleno inicial:
--   · Paciente propia (o sin origen) → TRUJILLO / LAREDO.
--   · Referida        → se parte el sufijo "… - PROVINCIA - DISTRITO".
-- ------------------------------------------------------------
UPDATE public.pacientes
   SET provincia_origen = 'TRUJILLO',
       distrito_origen  = 'LAREDO'
 WHERE provincia_origen IS NULL
   AND (
     establecimiento_origen IS NULL
     OR establecimiento_origen = ''
     OR lower(establecimiento_origen) LIKE '%paciente propio%'
     OR lower(establecimiento_origen) LIKE 'n.a%'
     OR lower(establecimiento_origen) LIKE '%hospital distrital laredo%'
     OR lower(establecimiento_origen) LIKE '%hospital distrital de laredo%'
   );

UPDATE public.pacientes
   SET provincia_origen = btrim(split_part(establecimiento_origen, ' - ',
         array_length(string_to_array(establecimiento_origen, ' - '), 1) - 1)),
       distrito_origen  = btrim(split_part(establecimiento_origen, ' - ',
         array_length(string_to_array(establecimiento_origen, ' - '), 1)))
 WHERE provincia_origen IS NULL
   AND establecimiento_origen IS NOT NULL
   AND array_length(string_to_array(establecimiento_origen, ' - '), 1) >= 3;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT nombre,
       COALESCE(establecimiento_origen, '(sin origen)') AS origen,
       provincia_origen,
       distrito_origen
  FROM public.pacientes
 ORDER BY nombre;

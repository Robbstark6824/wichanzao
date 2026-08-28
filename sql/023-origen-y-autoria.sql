-- ============================================================
-- DE DÓNDE SALIÓ CADA PACIENTE (v13)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- El 26/08/2026 apareció en la lista "CALDERON OTINIANO, ELIZABETH" con fecha
-- de cirugía y todo, y nadie en el servicio sabía quién era. Rastrearla costó
-- cruzar la base, la hoja de Google y los inicios de sesión, porque la ficha no
-- guardaba NADA sobre su procedencia: created_by estaba vacío en las 13 filas y
-- no había forma de distinguir una paciente registrada por una persona de una
-- importada por la sincronización.
--
-- (Era la paciente de prueba de la función test() del Apps Script, que escribía
-- en las hojas de producción. Eso se corrigió aparte, en apps-script-sync.gs.)
--
-- Esta columna hace que la pregunta "¿de dónde salió esta paciente?" se pueda
-- responder mirando su ficha.
-- ============================================================

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS origen TEXT;

COMMENT ON COLUMN public.pacientes.origen IS
  'app  = la registró una persona en la aplicación (created_by dice quién).
   hoja = entró por la sincronización con la hoja GERESA.
   NULL = ficha anterior a este registro; no se puede afirmar su origen.';

-- A propósito NO se rellenan las filas viejas: de las que ya están no se puede
-- saber con certeza, y una suposición escrita en la base se lee después como un
-- hecho. NULL significa "no consta", que es la verdad.

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT origen, count(*) FROM public.pacientes GROUP BY origen;

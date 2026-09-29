-- ============================================================
-- 035 · Encender Cirugía General
-- ============================================================
-- Desde aquí:
--   · "Crear cuenta" ofrece Cirugía General (las cuentas quedan pendientes
--     hasta que un admin las aprueba, sql/033).
--   · El reconciliador del Apps Script lee la hoja de Cirugía General y trae
--     sus pacientes con su estado real (importarTalCual).
-- Ensayado antes con tools/simular-importacion-cg.mjs.
-- Para apagarlo: activo = false (los pacientes ya importados se quedan).
-- ============================================================
UPDATE public.servicios SET activo = true WHERE clave = 'cirugia_general';
SELECT clave, nombre, activo FROM public.servicios ORDER BY orden;

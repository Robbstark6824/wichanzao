-- ============================================================
-- MÓDULO PROGRAMACIÓN QUIRÚRGICA — día en que la paciente pasó los dos riesgos
-- ============================================================
-- La alerta de "paciente estancada" cuenta los días de pre-hospitalización
-- desde que la paciente tiene los DOS riesgos (quirúrgico y anestesiológico)
-- guardados en Sí. Ese día no se registraba en ningún lado: fecha_fase3 solo
-- se sella cuando además están las citas.
--
-- Dato interno de la app. NO va a las hojas GERESA: el Apps Script arma las
-- filas con una lista blanca de columnas (buildValuesNew / buildValuesOld) y
-- esta no está en ella. No cambia ninguna regla de fases.
--
-- Mientras no se corra este script la app funciona igual (ignora el error al
-- anotar la fecha y la alerta usa fecha_fase3 como respaldo).

ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS fecha_riesgos TIMESTAMPTZ;

COMMENT ON COLUMN pacientes.fecha_riesgos IS
  'Cuándo quedaron los dos riesgos (qx y anestesiológico) en Sí. Solo para la alerta de estancadas; no se sincroniza con las hojas.';

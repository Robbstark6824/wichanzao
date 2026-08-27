-- ============================================================
-- MÓDULO PROGRAMACIÓN QUIRÚRGICA — v14 (las dos últimas columnas fijas)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- Quedaban dos columnas del formato oficial que salían de constantes del
-- código y no se podían tocar desde la app: "Red/RIS destino" y "Especialidad
-- quirúrgica". Son invariantes hoy (Red TRUJILLO, servicio de GINECOLOGIA),
-- pero el hospital pidió que TODA columna del formato se pueda llenar desde la
-- app. Pasan a ser campos editables, con esos mismos valores por defecto.
-- ============================================================

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS red_destino  TEXT,
  ADD COLUMN IF NOT EXISTS especialidad TEXT;

UPDATE public.pacientes
   SET red_destino  = COALESCE(red_destino,  'TRUJILLO'),
       especialidad = COALESCE(especialidad, 'GINECOLOGIA');

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT nombre, red_destino, especialidad, provincia_origen, distrito_origen
  FROM public.pacientes
 ORDER BY nombre;

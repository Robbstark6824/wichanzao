-- ============================================================
-- STORAGE: permitir subir las recetas a documentos/recetas/  (v15)
-- Proyecto: Servicio de Ginecología - Hospital de Laredo
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- SOLO ES NECESARIO SI, al generar una receta desde la app, aparece el aviso
-- "No se pudo subir al servidor (permiso de storage)" / error 403.
--
-- La app sube el PDF de cada receta a:
--     bucket 'documentos'  →  recetas/<id_paciente>.pdf
-- (ruta fija; regenerar sobrescribe; el enlace público nunca cambia).
--
-- El bucket 'documentos' ya acepta subidas de usuarios autenticados para las
-- carpetas de Laredo Scan (ginecologia/workers/...). Si esa policy está
-- limitada por prefijo, no cubre 'recetas/' y hay que agregar la de abajo.
-- Es ADITIVA (las policies del mismo comando se combinan con OR): no afecta
-- en nada las subidas que ya funcionan.
--
-- Si estas sentencias fallan por permisos, creá la policy a mano en
-- Dashboard → Storage → Policies (bucket 'documentos') con la misma condición.
-- ============================================================

-- INSERT (crear la receta la primera vez)
DROP POLICY IF EXISTS "recetas_insert_auth" ON storage.objects;
CREATE POLICY "recetas_insert_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documentos'
    AND (storage.foldername(name))[1] = 'recetas'
  );

-- UPDATE (regenerar = upsert sobre el mismo archivo)
DROP POLICY IF EXISTS "recetas_update_auth" ON storage.objects;
CREATE POLICY "recetas_update_auth" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documentos'
    AND (storage.foldername(name))[1] = 'recetas'
  )
  WITH CHECK (
    bucket_id = 'documentos'
    AND (storage.foldername(name))[1] = 'recetas'
  );

-- La lectura del PDF para imprimir en la PC usa el endpoint /object/public/
-- del bucket (que es público): NO necesita policy de SELECT.

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND policyname LIKE 'recetas_%'
 ORDER BY policyname;

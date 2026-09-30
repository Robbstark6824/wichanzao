-- Vuelve a abrir el almacenamiento al rol anon (las seis políticas de antes).
-- Solo para una emergencia: deja a cualquiera subir, sobrescribir, borrar y listar.
BEGIN;

CREATE POLICY "Subir archivos 1ljx2yn_0" ON storage.objects FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Actualizar archivos 1ljx2yn_0" ON storage.objects FOR UPDATE TO anon USING (true);
CREATE POLICY "Actualizar archivos 1ljx2yn_1" ON storage.objects FOR SELECT TO anon USING (true);
CREATE POLICY "Eliminar solo fechas 1ljx2yn_0" ON storage.objects FOR DELETE TO anon
  USING (name ~ '^\w+/workers/[^/]+/\d{4}-\d{2}-\d{2}/');
CREATE POLICY "Eliminar solo fechas 1ljx2yn_1" ON storage.objects FOR SELECT TO anon
  USING (name ~ '^\w+/workers/[^/]+/\d{4}-\d{2}-\d{2}/');
CREATE POLICY "Lectura publica 1ljx2yn_0" ON storage.objects FOR SELECT TO anon USING (true);

COMMIT;

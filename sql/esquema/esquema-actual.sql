-- ESQUEMA DE LA BASE — solo estructura, SIN DATOS
-- Generado: 2026-10-07 con tools/exportar-esquema.mjs
--
-- Úsalo para ENTENDER y AUDITAR la base (quién puede leer o escribir qué) y como
-- punto de partida para reconstruirla en un proyecto Supabase NUEVO y vacío.
-- No es una migración incremental: no es idempotente y asume una base vacía.
--
-- NO incluye (se configuran en el panel de Supabase, no en la base):
--   · Ajustes de Auth: confirmación de correo desactivada, largo mínimo de
--     contraseña, proveedor Google, URL del sitio y redirecciones.
--   · Claves de API y secretos.
--   · Los archivos del bucket de Storage (solo se declara el bucket).
--   · Las cuentas de usuarios (auth.users) ni ningún dato de pacientes.
--
-- Los archivos numerados de sql/ cuentan la historia de cómo se llegó aquí; ante
-- cualquier diferencia, ESTE archivo describe el estado real de la base.

-- ======================================================================
-- EXTENSIONES
-- ======================================================================

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ======================================================================
-- TIPOS
-- ======================================================================

CREATE TYPE public."estado_paciente" AS ENUM ('en_tramite', 'apta_para_sala', 'programada', 'hospitalizada', 'operada', 'suspendida', 'referida');
CREATE TYPE public."turno_qx" AS ENUM ('manana', 'tarde');

-- ======================================================================
-- TABLAS (8)
-- ======================================================================

CREATE TABLE IF NOT EXISTS public."historial_estados" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "paciente_id" uuid NOT NULL,
  "estado_anterior" estado_paciente,
  "estado_nuevo" estado_paciente NOT NULL,
  "motivo" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."impresiones" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "paciente_id" uuid NOT NULL,
  "variante" text DEFAULT ''::text NOT NULL,
  "objeto" text NOT NULL,
  "nombre_archivo" text,
  "etiqueta" text,
  "copias" smallint DEFAULT 1 NOT NULL,
  "estado" text DEFAULT 'pendiente'::text NOT NULL,
  "detalle_error" text,
  "impresora" text,
  "solicitado_por" uuid,
  "solicitado_at" timestamp with time zone DEFAULT now() NOT NULL,
  "tomado_at" timestamp with time zone,
  "impresa_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public."pacientes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "dni" character varying(20) NOT NULL,
  "nombre" character varying(200) NOT NULL,
  "hcl" character varying(50),
  "telefono" character varying(20),
  "diagnostico" text,
  "estado" estado_paciente DEFAULT 'en_tramite'::estado_paciente NOT NULL,
  "laboratorio_completo" boolean DEFAULT false NOT NULL,
  "ekg" boolean DEFAULT false NOT NULL,
  "fecha_cita_cardiologia" date,
  "fecha_cita_anestesiologia" date,
  "riesgo_qx" boolean DEFAULT false NOT NULL,
  "riesgo_anestesiologico" boolean DEFAULT false NOT NULL,
  "hcl_hospitalizacion" boolean DEFAULT false NOT NULL,
  "consentimientos" boolean DEFAULT false NOT NULL,
  "solicitud_sala_dejada" boolean DEFAULT false NOT NULL,
  "fecha_cirugia" date,
  "turno" turno_qx,
  "cama_hospitalizacion" character varying(20),
  "fecha_hospitalizacion" timestamp with time zone,
  "fecha_resolucion" timestamp with time zone,
  "motivo_suspension" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "hora_cita_cardiologia" time without time zone,
  "hora_cita_anestesiologia" time without time zone,
  "telefono_contacto" character varying(20),
  "recetas_entregadas" boolean DEFAULT false NOT NULL,
  "fecha_captacion" date,
  "interno_medicina" character varying(200),
  "doctor" character varying(200),
  "fecha_fase2" timestamp with time zone,
  "fecha_fase3" timestamp with time zone,
  "fecha_fase4" timestamp with time zone,
  "fecha_fase5" timestamp with time zone,
  "edad" integer,
  "sexo" character varying(20),
  "referencia_hospital" character varying(200),
  "cie10" character varying(20),
  "procedimiento" text,
  "tipo_seguro" character varying(50),
  "tipo_anestesia" character varying(50),
  "nivel_cirugia" character varying(30),
  "cie10_secundario" character varying(20),
  "diagnostico_secundario" text,
  "cie10_tercero" character varying(20),
  "diagnostico_tercero" text,
  "codigo_procedimiento" character varying(50),
  "fecha_primera_evaluacion" date,
  "aplica_imagenes" character varying(3),
  "fecha_imagenes" date,
  "fecha_evaluacion_preoperatoria" date,
  "orden_intervencion" character varying(50),
  "motivo_espera" text,
  "detalle_motivo_espera" text,
  "tipo_examen3" text,
  "fecha_examen3" date,
  "id_registro" integer,
  "establecimiento_destino" text,
  "codigo_destino" character varying(20),
  "establecimiento_origen" text,
  "codigo_origen" character varying(20),
  "fecha_examen1" date,
  "fecha_examen2" date,
  "detalle_suspension" text,
  "lugar_cirugia" text,
  "observacion" text,
  "resultado_preop" text,
  "tipo_cierre" text,
  "motivo_cierre" text,
  "fecha_cierre" date,
  "fecha_suspension" date,
  "fecha_real_operacion" date,
  "provincia_origen" text,
  "distrito_origen" text,
  "red_destino" text,
  "especialidad" text,
  "origen" text,
  "fur" date,
  "eco_fecha" date,
  "eco_semanas" smallint,
  "eco_dias" smallint,
  "tipo_receta" text,
  "receta_generada_at" timestamp with time zone,
  "receta_faltantes" jsonb,
  "receta_faltantes_at" timestamp with time zone,
  "fecha_riesgos" timestamp with time zone,
  "servicio" text DEFAULT COALESCE(mi_servicio(), 'ginecologia'::text) NOT NULL,
  "laboratorio_na" boolean DEFAULT false NOT NULL,
  "ekg_na" boolean DEFAULT false NOT NULL,
  "riesgo_qx_na" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public."recetas_plantillas" (
  "clave" text NOT NULL,
  "titulo" text NOT NULL,
  "nombre_largo" text NOT NULL,
  "insumos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "anestesia" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "es_parto" boolean DEFAULT false NOT NULL,
  "activa" boolean DEFAULT true NOT NULL,
  "orden" integer DEFAULT 100 NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid DEFAULT auth.uid(),
  "servicio" text DEFAULT 'ginecologia'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."recetas_plantillas_historial" (
  "id" bigint DEFAULT nextval('recetas_plantillas_historial_id_seq'::regclass) NOT NULL,
  "clave" text NOT NULL,
  "accion" text NOT NULL,
  "version" integer,
  "antes" jsonb,
  "despues" jsonb,
  "por" uuid,
  "por_nombre" text,
  "at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."service_codes" (
  "servicio" text NOT NULL,
  "code" text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."servicios" (
  "clave" text NOT NULL,
  "nombre" text NOT NULL,
  "especialidad_geresa" text NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  "orden" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."workers" (
  "id" uuid NOT NULL,
  "folder_id" text NOT NULL,
  "name" text NOT NULL,
  "servicio" text NOT NULL,
  "area" text NOT NULL,
  "is_admin" boolean DEFAULT false,
  "picture" text,
  "email" text,
  "google" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "last_active" timestamp with time zone DEFAULT now(),
  "rol" text DEFAULT 'medico'::text NOT NULL,
  "aprobado" boolean DEFAULT false NOT NULL
);


-- ======================================================================
-- RESTRICCIONES
-- ======================================================================

ALTER TABLE public."historial_estados" ADD CONSTRAINT "historial_estados_pkey" PRIMARY KEY (id);
ALTER TABLE public."impresiones" ADD CONSTRAINT "impresiones_pkey" PRIMARY KEY (id);
ALTER TABLE public."pacientes" ADD CONSTRAINT "pacientes_pkey" PRIMARY KEY (id);
ALTER TABLE public."recetas_plantillas" ADD CONSTRAINT "recetas_plantillas_pkey" PRIMARY KEY (clave);
ALTER TABLE public."recetas_plantillas_historial" ADD CONSTRAINT "recetas_plantillas_historial_pkey" PRIMARY KEY (id);
ALTER TABLE public."service_codes" ADD CONSTRAINT "service_codes_pkey" PRIMARY KEY (servicio);
ALTER TABLE public."servicios" ADD CONSTRAINT "servicios_pkey" PRIMARY KEY (clave);
ALTER TABLE public."workers" ADD CONSTRAINT "workers_pkey" PRIMARY KEY (id);
ALTER TABLE public."pacientes" ADD CONSTRAINT "pacientes_dni_servicio_key" UNIQUE (dni, servicio);
ALTER TABLE public."workers" ADD CONSTRAINT "workers_folder_id_key" UNIQUE (folder_id);
ALTER TABLE public."workers" ADD CONSTRAINT "workers_folder_id_servicio_key" UNIQUE (folder_id, servicio);
ALTER TABLE public."impresiones" ADD CONSTRAINT "impresiones_copias_check" CHECK (((copias >= 1) AND (copias <= 5)));
ALTER TABLE public."impresiones" ADD CONSTRAINT "impresiones_estado_check" CHECK ((estado = ANY (ARRAY['pendiente'::text, 'imprimiendo'::text, 'impresa'::text, 'error'::text])));
ALTER TABLE public."impresiones" ADD CONSTRAINT "impresiones_variante_check" CHECK ((variante = ANY (ARRAY[''::text, '-2'::text])));
ALTER TABLE public."pacientes" ADD CONSTRAINT "chk_eco_dias_validos" CHECK (((eco_dias IS NULL) OR ((eco_dias >= 0) AND (eco_dias <= 6))));
ALTER TABLE public."pacientes" ADD CONSTRAINT "chk_eco_semanas_validas" CHECK (((eco_semanas IS NULL) OR ((eco_semanas >= 0) AND (eco_semanas <= 45))));
ALTER TABLE public."pacientes" ADD CONSTRAINT "chk_hospitalizada_requiere_cama" CHECK (((estado <> 'hospitalizada'::estado_paciente) OR (cama_hospitalizacion IS NOT NULL)));
ALTER TABLE public."pacientes" ADD CONSTRAINT "chk_programada_requiere_fecha_turno" CHECK (((estado <> 'programada'::estado_paciente) OR ((fecha_cirugia IS NOT NULL) AND (turno IS NOT NULL))));
ALTER TABLE public."pacientes" ADD CONSTRAINT "chk_referida_tiene_motivo" CHECK (((estado <> 'referida'::estado_paciente) OR (motivo_cierre IS NOT NULL) OR (referencia_hospital IS NOT NULL)));
ALTER TABLE public."pacientes" ADD CONSTRAINT "chk_suspendida_tiene_motivo" CHECK (((estado <> 'suspendida'::estado_paciente) OR (motivo_suspension IS NOT NULL)));
ALTER TABLE public."recetas_plantillas" ADD CONSTRAINT "recetas_plantillas_anestesia_check" CHECK ((jsonb_typeof(anestesia) = 'array'::text));
ALTER TABLE public."recetas_plantillas" ADD CONSTRAINT "recetas_plantillas_clave_check" CHECK ((clave ~ '^[a-z0-9_]{2,40}$'::text));
ALTER TABLE public."recetas_plantillas" ADD CONSTRAINT "recetas_plantillas_insumos_check" CHECK ((jsonb_typeof(insumos) = 'array'::text));
ALTER TABLE public."recetas_plantillas" ADD CONSTRAINT "recetas_plantillas_nombre_largo_check" CHECK (((length(btrim(nombre_largo)) >= 1) AND (length(btrim(nombre_largo)) <= 120)));
ALTER TABLE public."recetas_plantillas" ADD CONSTRAINT "recetas_plantillas_titulo_check" CHECK (((length(btrim(titulo)) >= 1) AND (length(btrim(titulo)) <= 60)));
ALTER TABLE public."recetas_plantillas_historial" ADD CONSTRAINT "recetas_plantillas_historial_accion_check" CHECK ((accion = ANY (ARRAY['crear'::text, 'editar'::text, 'archivar'::text, 'reactivar'::text])));
ALTER TABLE public."workers" ADD CONSTRAINT "workers_rol_check" CHECK ((rol = ANY (ARRAY['medico'::text, 'jefe_info'::text])));
ALTER TABLE public."historial_estados" ADD CONSTRAINT "historial_estados_paciente_id_fkey" FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE;
ALTER TABLE public."impresiones" ADD CONSTRAINT "impresiones_paciente_id_fkey" FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE;
ALTER TABLE public."pacientes" ADD CONSTRAINT "fk_tipo_receta" FOREIGN KEY (tipo_receta) REFERENCES recetas_plantillas(clave) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public."pacientes" ADD CONSTRAINT "pacientes_servicio_fkey" FOREIGN KEY (servicio) REFERENCES servicios(clave) ON UPDATE CASCADE;
ALTER TABLE public."recetas_plantillas" ADD CONSTRAINT "recetas_plantillas_servicio_fkey" FOREIGN KEY (servicio) REFERENCES servicios(clave) ON UPDATE CASCADE;
ALTER TABLE public."workers" ADD CONSTRAINT "workers_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ======================================================================
-- ÍNDICES
-- ======================================================================

CREATE INDEX idx_historial_paciente ON public.historial_estados USING btree (paciente_id, created_at DESC);
CREATE INDEX idx_impresiones_cola ON public.impresiones USING btree (solicitado_at) WHERE (estado = ANY (ARRAY['pendiente'::text, 'imprimiendo'::text]));
CREATE INDEX idx_impresiones_paciente ON public.impresiones USING btree (paciente_id, solicitado_at DESC);
CREATE INDEX idx_pacientes_estado ON public.pacientes USING btree (estado);
CREATE INDEX idx_pacientes_fecha_cirugia ON public.pacientes USING btree (fecha_cirugia);
CREATE INDEX idx_pacientes_servicio ON public.pacientes USING btree (servicio);
CREATE INDEX idx_pacientes_turno ON public.pacientes USING btree (turno);
CREATE INDEX recetas_plantillas_historial_clave_at ON public.recetas_plantillas_historial USING btree (clave, at DESC);
CREATE INDEX idx_workers_folder ON public.workers USING btree (folder_id);

-- ======================================================================
-- SEGURIDAD A NIVEL DE FILA (RLS)
-- ======================================================================

ALTER TABLE public."historial_estados" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."impresiones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pacientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."recetas_plantillas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."recetas_plantillas_historial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."service_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."servicios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."workers" ENABLE ROW LEVEL SECURITY;
-- storage.objects: RLS activado (lo gestiona Supabase)

-- ======================================================================
-- POLÍTICAS
-- ======================================================================

CREATE POLICY "historial_insert" ON public."historial_estados" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM pacientes p
  WHERE ((p.id = historial_estados.paciente_id) AND puede_editar_servicio(p.servicio)))));
CREATE POLICY "historial_select" ON public."historial_estados" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM pacientes p
  WHERE (p.id = historial_estados.paciente_id))));
CREATE POLICY "impresiones_delete" ON public."impresiones" AS PERMISSIVE FOR DELETE TO authenticated
  USING (((estado = 'pendiente'::text) AND estoy_aprobado()));
CREATE POLICY "impresiones_insert" ON public."impresiones" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (estoy_aprobado());
CREATE POLICY "impresiones_select" ON public."impresiones" AS PERMISSIVE FOR SELECT TO authenticated
  USING (estoy_aprobado());
CREATE POLICY "impresiones_update" ON public."impresiones" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (estoy_aprobado());
CREATE POLICY "pacientes_delete" ON public."pacientes" AS PERMISSIVE FOR DELETE TO authenticated
  USING (puede_editar_servicio(servicio));
CREATE POLICY "pacientes_insert" ON public."pacientes" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (puede_editar_servicio(servicio));
CREATE POLICY "pacientes_select" ON public."pacientes" AS PERMISSIVE FOR SELECT TO authenticated
  USING (puede_ver_servicio(servicio));
CREATE POLICY "pacientes_update" ON public."pacientes" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (puede_editar_servicio(servicio))
  WITH CHECK (puede_editar_servicio(servicio));
CREATE POLICY "recetas_plantillas_insert" ON public."recetas_plantillas" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_admin());
CREATE POLICY "recetas_plantillas_select" ON public."recetas_plantillas" AS PERMISSIVE FOR SELECT TO authenticated
  USING (puede_ver_servicio(servicio));
CREATE POLICY "recetas_plantillas_update" ON public."recetas_plantillas" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "recetas_plantillas_historial_select" ON public."recetas_plantillas_historial" AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
CREATE POLICY "servicios_select" ON public."servicios" AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY "admin_delete" ON public."workers" AS PERMISSIVE FOR DELETE TO public
  USING (is_admin());
CREATE POLICY "admin_select_all" ON public."workers" AS PERMISSIVE FOR SELECT TO public
  USING (is_admin());
CREATE POLICY "insert_own" ON public."workers" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = id));
CREATE POLICY "select_own" ON public."workers" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = id));
CREATE POLICY "update_own" ON public."workers" AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = id));
CREATE POLICY "workers_insert_self" ON public."workers" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = id));
CREATE POLICY "workers_select" ON public."workers" AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY "workers_update_self" ON public."workers" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((auth.uid() = id))
  WITH CHECK ((auth.uid() = id));
CREATE POLICY "Admin full access" ON storage."objects" AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "allow_delete" ON storage."objects" AS PERMISSIVE FOR DELETE TO public
  USING (((bucket_id = 'documentos'::text) AND (auth.uid() IS NOT NULL)));
CREATE POLICY "allow_insert" ON storage."objects" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((bucket_id = 'documentos'::text) AND (auth.uid() IS NOT NULL)));
CREATE POLICY "allow_select" ON storage."objects" AS PERMISSIVE FOR SELECT TO public
  USING (((bucket_id = 'documentos'::text) AND (auth.uid() IS NOT NULL)));
CREATE POLICY "allow_update" ON storage."objects" AS PERMISSIVE FOR UPDATE TO public
  USING (((bucket_id = 'documentos'::text) AND (auth.uid() IS NOT NULL)));

-- ======================================================================
-- PERMISOS DE TABLA Y COLUMNA (anon, authenticated, service_role)
-- ======================================================================

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public."historial_estados" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public."historial_estados" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public."impresiones" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public."impresiones" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public."impresiones" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public."pacientes" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public."pacientes" TO service_role;
GRANT INSERT, SELECT, UPDATE ON public."recetas_plantillas" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public."recetas_plantillas" TO service_role;
GRANT SELECT ON public."recetas_plantillas_historial" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public."recetas_plantillas_historial" TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public."service_codes" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public."service_codes" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public."service_codes" TO service_role;
GRANT SELECT ON public."servicios" TO anon;
GRANT SELECT ON public."servicios" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public."servicios" TO service_role;
GRANT REFERENCES, TRIGGER, TRUNCATE ON public."workers" TO anon;
GRANT DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public."workers" TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public."workers" TO service_role;

-- Permisos solo sobre algunas columnas (el resto de columnas queda protegido):
GRANT SELECT ("area", "folder_id", "id", "name", "servicio") ON public."workers" TO anon;
GRANT INSERT ("area", "created_at", "email", "folder_id", "google", "id", "last_active", "name", "picture", "servicio") ON public."workers" TO authenticated;
GRANT UPDATE ("area", "email", "folder_id", "google", "last_active", "name", "picture") ON public."workers" TO authenticated;

-- ======================================================================
-- FUNCIONES
-- ======================================================================

-- admin_aprobar_worker: SECURITY DEFINER (corre con los permisos de su dueño) · anon puede ejecutarla: no · authenticated: sí
CREATE OR REPLACE FUNCTION public.admin_aprobar_worker(p_id uuid, p_aprobado boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede aprobar cuentas';
  END IF;
  IF p_id = auth.uid() AND NOT p_aprobado THEN
    RAISE EXCEPTION 'No puedes quitarte la aprobación a ti mismo';
  END IF;
  UPDATE workers SET aprobado = p_aprobado WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa cuenta'; END IF;
END $function$;

-- admin_delete_worker: SECURITY DEFINER (corre con los permisos de su dueño) · anon puede ejecutarla: SÍ · authenticated: sí
CREATE OR REPLACE FUNCTION public.admin_delete_worker(p_folder_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  -- Solo un admin autenticado puede borrar.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT id INTO v_user_id FROM public.workers WHERE folder_id = p_folder_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Trabajador no encontrado: %', p_folder_id;
  END IF;

  -- 1) Borra la fila de workers.
  DELETE FROM public.workers WHERE id = v_user_id;

  -- 2) Borra la cuenta de Auth (cascade limpia identities/sessions/refresh_tokens).
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$function$;

-- admin_set_rol: SECURITY DEFINER (corre con los permisos de su dueño) · anon puede ejecutarla: no · authenticated: sí
CREATE OR REPLACE FUNCTION public.admin_set_rol(p_id uuid, p_rol text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar roles';
  END IF;
  IF p_rol NOT IN ('medico', 'jefe_info') THEN
    RAISE EXCEPTION 'Rol desconocido: %', p_rol;
  END IF;
  UPDATE workers SET rol = p_rol WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa cuenta'; END IF;
END $function$;

-- check_service_code: SECURITY DEFINER (corre con los permisos de su dueño) · anon puede ejecutarla: SÍ · authenticated: sí
CREATE OR REPLACE FUNCTION public.check_service_code(p_servicio text, p_code text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
      SELECT 1 FROM service_codes WHERE servicio = p_servicio AND code = p_code
    );
  $function$;

-- es_jefe_info: SECURITY DEFINER (corre con los permisos de su dueño) · anon puede ejecutarla: SÍ · authenticated: sí
CREATE OR REPLACE FUNCTION public.es_jefe_info()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT rol = 'jefe_info' FROM workers WHERE id = auth.uid() AND aprobado), false)
$function$;

-- estoy_aprobado: SECURITY DEFINER (corre con los permisos de su dueño) · anon puede ejecutarla: SÍ · authenticated: sí
CREATE OR REPLACE FUNCTION public.estoy_aprobado()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT aprobado OR is_admin FROM workers WHERE id = auth.uid()), false)
$function$;

-- is_admin: SECURITY DEFINER (corre con los permisos de su dueño) · anon puede ejecutarla: SÍ · authenticated: sí
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
      (SELECT is_admin FROM workers WHERE id = auth.uid()),
      false
    );
  $function$;

-- mi_servicio: SECURITY DEFINER (corre con los permisos de su dueño) · anon puede ejecutarla: SÍ · authenticated: sí
CREATE OR REPLACE FUNCTION public.mi_servicio()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT servicio FROM workers WHERE id = auth.uid() AND aprobado
$function$;

-- puede_editar_servicio: SECURITY DEFINER (corre con los permisos de su dueño) · anon puede ejecutarla: SÍ · authenticated: sí
CREATE OR REPLACE FUNCTION public.puede_editar_servicio(s text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_admin() OR (s = public.mi_servicio() AND NOT public.es_jefe_info())
$function$;

-- puede_ver_servicio: SECURITY DEFINER (corre con los permisos de su dueño) · anon puede ejecutarla: SÍ · authenticated: sí
CREATE OR REPLACE FUNCTION public.puede_ver_servicio(s text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_admin() OR public.es_jefe_info() OR s = public.mi_servicio()
$function$;

-- recetas_plantillas_historial_anotar: SECURITY DEFINER (corre con los permisos de su dueño) · anon puede ejecutarla: SÍ · authenticated: sí
CREATE OR REPLACE FUNCTION public.recetas_plantillas_historial_anotar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

-- recetas_plantillas_sellar: SECURITY INVOKER · anon puede ejecutarla: SÍ · authenticated: sí
CREATE OR REPLACE FUNCTION public.recetas_plantillas_sellar()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
END $function$;

-- set_updated_at: SECURITY INVOKER · anon puede ejecutarla: SÍ · authenticated: sí
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;


-- ======================================================================
-- DISPARADORES
-- ======================================================================

CREATE TRIGGER trg_pacientes_updated_at BEFORE UPDATE ON public.pacientes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recetas_plantillas_historial AFTER INSERT OR UPDATE ON public.recetas_plantillas FOR EACH ROW EXECUTE FUNCTION recetas_plantillas_historial_anotar();
CREATE TRIGGER trg_recetas_plantillas_sellar BEFORE INSERT OR UPDATE ON public.recetas_plantillas FOR EACH ROW EXECUTE FUNCTION recetas_plantillas_sellar();

-- ======================================================================
-- STORAGE: BUCKETS (solo la configuración, sin archivos)
-- ======================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('documentos', 'documentos', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;

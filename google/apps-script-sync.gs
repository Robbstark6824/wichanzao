/**
* ============================================================
* Sincronización programación quirúrgica → Google Sheets (GERESA)
* Proyecto: Servicio de Ginecología - Hospital de Laredo
* ============================================================
*
* Escribe el MISMO paciente a DOS hojas a la vez:
*   1) La hoja ANTIGUA (formato "FILA AZUL" que ya tenías).
*   2) La hoja OFICIAL GERESA ("MATRIZ NOMINAL REGIONAL DE LISTA DE
*      ESPERA QUIRÚRGICA") con los valores exactos de sus catálogos
*      (INSTRUCTIVO / DICCIONARIO_DATOS / CATALOGOS).
*
* DÓNDE VIVE ESTE CÓDIGO:
*   En un proyecto INDEPENDIENTE de Apps Script, propiedad del hospital, NO
*   dentro de las hojas. Las hojas son de la GERESA y no se pueden modificar,
*   así que "Extensiones → Apps Script" no es una opción: no habría permiso.
*   Por eso el código abre las hojas por su ID (SpreadsheetApp.openById) y se
*   ejecuta con la cuenta del proyecto, que sí tiene acceso de edición a ellas.
*
* CÓMO ACTUALIZARLO:
*   1. script.google.com → Mis proyectos → abre el proyecto que ya tiene la
*      implementación en uso (su URL /exec termina en qj-ygD8rYPoCZy4qiAxEhw).
*   2. Selecciona todo el código viejo y pega TODO este archivo encima.
*   3. Comprueba las constantes de abajo (SS_ID, SS_ID_2, SHEET_NAME,
*      SHEET_NAME_2 y TOKEN deben coincidir con los de la app).
*   4. Guarda (Ctrl+S).
*   5. Implementar → Administrar implementaciones → ✏️ Editar →
*      Versión: "Nueva versión" → Implementar.
*      ⚠️ NUNCA "Nueva implementación": crea una URL distinta que pide iniciar
*         sesión, y la app deja de poder escribir en las hojas.
*   6. La URL "/exec" es la que usa la app (QX_SHEET_URL de index.html).
*
*   El disparador de sincronización (sincronizarTodo) NO depende de la
*   implementación: corre con el código guardado. Pero debe existir en UN SOLO
*   proyecto, o las hojas se escribirían dos veces.
*
* IMPORTANTE: los valores de CONSTANTES y CAT son los que GERESA exige.
* ============================================================
*/

/* ---- Hoja ANTIGUA (formato "FILA AZUL") ---- */
var SS_ID = '1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU';
var SHEET_NAME = 'HOSPITAL LAREDO';

/* ---- Hoja OFICIAL GERESA (MATRIZ NOMINAL REGIONAL) ---- */
var SS_ID_2 = '1IoT5KGuTcT83ZLyHh4SrLR4yhbFjIKkI';
var SHEET_NAME_2 = 'LISTA_ESPERA_QX';

/* ---- Hoja de CIRUGÍA GENERAL (mismo formato de 47 columnas) ---- */
var SS_ID_CG = '1XsoXl-4mv0CY1sSYi7MrLmf671rvoWC6Uf9xfXLngkc';
var SHEET_NAME_CG = 'HOSPITAL LAREDO';

/* ---- A qué hojas va cada servicio ----
   La app tiene varios servicios (pacientes.servicio). Cada uno escribe SOLO
   en sus hojas y el reconciliador solo cruza cada hoja con los pacientes de
   su servicio: un paciente de Cirugía General nunca toca las hojas de gineco
   ni al revés.

     especialidad  "Especialidad quirúrgica" por defecto
     generoLargo   el formato de 47 columnas lleva el género como "F"/"M" en
                   gineco (así está toda su hoja); Cirugía General siempre usó
                   "Femenino"/"Masculino", que es además el catálogo oficial
     origenPropioVacio  paciente propio: provincia/distrito de origen en
                   blanco (así lo lleva su hoja y la práctica regional). Gineco
                   los llena con TRUJILLO/LAREDO por decisión del hospital
     preopVacioSinEvaluacion  "Resultado evaluación preoperatoria" en
                   blanco si no hubo evaluación (riesgo quirúrgico NA, o
                   paciente cerrado sin riesgos evaluados), en vez de
                   "Pendiente". El "NA" de exámenes y riesgo (sql/034) solo lo
                   marca la app en los servicios que lo usan
     importarTalCual  al traer una fila NUEVA de la hoja: entra con su estado
                   real (Operado → operada, Suspendido → suspendida…) y con su
                   tipo de anestesia. En gineco rige la regla general (un
                   cierre entra en trámite y la anestesia no se importa); en
                   Cirugía General casi todo lo de su hoja ya está operado, y
                   con esa regla la app escribiría "En lista de espera" encima
                   de "Operado" y borraría la anestesia al devolverlo a la hoja
     hojas         formato 'antigua' (47 col.) u 'oficial' (56 col.);
                   filtrarEspecialidad: la hoja la comparten varios servicios
                   y solo se leen las filas de esta especialidad

   Un paciente sin servicio (filas viejas, una app sin actualizar) es de
   ginecología: exactamente lo que pasaba antes de que hubiera servicios. */
var SERVICIOS_HOJAS = {
  ginecologia: {
    especialidad: 'GINECOLOGIA', generoLargo: false,
    hojas: [
      { ssId: SS_ID,   name: SHEET_NAME,   formato: 'antigua', etiqueta: 'hoja antigua' },
      { ssId: SS_ID_2, name: SHEET_NAME_2, formato: 'oficial', etiqueta: 'hoja oficial', filtrarEspecialidad: true }
    ]
  },
  cirugia_general: {
    especialidad: 'CIRUGIA GENERAL', generoLargo: true,
    origenPropioVacio: true, preopVacioSinEvaluacion: true, importarTalCual: true,
    hojas: [
      { ssId: SS_ID_CG, name: SHEET_NAME_CG, formato: 'antigua', etiqueta: 'hoja de cirugía general' }
    ]
  }
};

function servicioDe_(p) { return (p && p.servicio) || 'ginecologia'; }

/** Configuración del servicio del paciente. Un servicio que este código no
 *  conoce NO se escribe en ninguna hoja: mejor un error visible que una fila
 *  en la hoja de otro servicio. */
function configDe_(p) {
  var s = servicioDe_(p);
  var cfg = SERVICIOS_HOJAS[s];
  if (!cfg) throw new Error('servicio desconocido "' + s + '": no se escribió en ninguna hoja');
  return cfg;
}

/** Una bandera de SERVICIOS_HOJAS para el servicio del paciente (false si no la tiene). */
function opcionDe_(p, nombre) {
  var cfg = SERVICIOS_HOJAS[servicioDe_(p)];
  return !!(cfg && cfg[nombre]);
}

function especialidadDe_(p) {
  var cfg = SERVICIOS_HOJAS[servicioDe_(p)];
  return cfg ? cfg.especialidad : CONSTANTES.especialidad;
}

/* Sello del código desplegado. Viaja en TODA respuesta, incluso en la de token
   inválido (que no toca las hojas), así que un ping basta para saber qué
   versión está viva y si el "Nueva versión" del despliegue realmente tomó.
   Subir esta fecha cada vez que se cambie este archivo. */
var VERSION = '2026-09-29-exportar-2';

/* Debe ser IGUAL al token que pongas en la app (index.html → QX_SHEET_TOKEN). */
var TOKEN = 'WZ-GERESA-2026-Kx7mQ2p9';

/* Valores fijos que GERESA pide para este hospital (ginecología, Laredo). */
var CONSTANTES = {
  establecimientoDestino: 'HOSPITAL DISTRITAL LAREDO',   // tal cual CAT_DESTINO
  codigoDestino:          '00005231',                    // código del HD Laredo (CAT_ORIGEN)
  red:                    'TRUJILLO',
  establecimientoOrigen:  'N.A. - Paciente propio / no referido',
  codigoOrigen:           '',
  provincia:              'TRUJILLO',
  distrito:               'LAREDO',
  especialidad:           'GINECOLOGIA',
  lugarCirugia:           'HOSPITAL DISTRITAL LAREDO'
};

/* Catálogos EXACTOS de la hoja OFICIAL (pestaña CATALOGOS). Las tildes importan:
   la validación de datos compara el texto exacto. */
var CAT = {
  genero:      ['Masculino','Femenino'],
  seguro:      ['SIS','FISSAL','ESSALUD','Particular','Otro'],
  nivel:       ['Mayor','Menor'],
  anestesia:   ['Regional/General','Local'],
  imagenes:    ['Sí','No'],
  resultadoPreop: ['Pendiente','Apto','No apto'],
  estadoProgramacion: ['Pendiente de fecha','Programado'],
  estadoActual: ['En lista de espera','Operado','Suspendido','Cerrado sin cirugía'],
  motivoEspera: [
    'Falta de insumos quirúrgicos',
    'Falta de medicamentos',
    'Inoperatividad de sala de operaciones',
    'Central de esterilización en mantenimiento',
    'Falta de recurso humano',
    'Equipo biomédico inoperativo y/o en mantenimiento',
    'Otros'
  ],
  motivoSuspension: [
    'Paciente no acudió el día de la cirugía',
    'Incumplimiento de preparación preoperatoria / ayuno',
    'Condición clínica no favorable del paciente',
    'Evaluación anestésica no favorable',
    'Falta de insumos quirúrgicos',
    'Falta de medicamentos',
    'Inoperatividad de sala de operaciones',
    'Central de esterilización en mantenimiento',
    'Falta de recurso humano',
    'Equipo biomédico inoperativo y/o en mantenimiento',
    'Emergencia quirúrgica desplazó la programación',
    'Error administrativo o de programación',
    'Otro motivo'
  ],
  tipoCierre: ['Cirugía realizada','Salida de lista sin cirugía'],
  motivoCierre: [
    'Cirugía realizada en la IPRESS',
    'Cirugía realizada en otra IPRESS pública',
    'Cirugía realizada en IPRESS privada',
    'Cirugía realizada en otra institución',
    'Renuncia voluntaria del paciente',
    'Fallecimiento antes de la intervención quirúrgica',
    'Contraindicación médica definitiva',
    'Paciente no ubicable / pérdida de contacto',
    'Paciente referido o transferido a otra institución',
    'Duplicidad de registro',
    'Paciente registrado por error',
    'Otro motivo'
  ]
};

/** Normaliza texto para comparar encabezados (quita tildes y mayúsculas). */
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Formatea una fecha (YYYY-MM-DD o ISO) como dd/mm/aa para GERESA. */
function fmtFecha(v) {
  if (v === null || v === undefined || v === '') return '';
  var s = String(v);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '/' + m[2] + '/' + m[1].slice(2);
  return s;
}

/** ¿Es una columna de fecha? (para escribirla como texto, no como fecha). */
function esColumnaFecha(key) {
  var n = norm(key);
  return n.indexOf('fecha') === 0 || n.indexOf('f.') === 0;
}

/* ============================================================
 * EDAD GESTACIONAL EN LAS HOJAS
 * ============================================================
 * El servicio capta gestantes hacia la semana 36 y las opera hacia la 38. Las
 * semanas avanzan cada día, así que un diagnóstico escrito una vez ("GU 36ss
 * 2/7") miente al día siguiente, también en el Excel.
 *
 * Aquí se recalcula al escribir: el diagnóstico que va a las hojas lleva la
 * edad gestacional del día, y el disparador refresca a las gestantes activas
 * una vez al día aunque nadie toque su ficha.
 *
 * Lo que se guarda en la base sigue siendo el texto que escribió una persona.
 * El sufijo se añade solo al salir hacia la hoja, y se quita al leerla de
 * vuelta, para que la app no acabe importando su propio cálculo como si fuera
 * parte del diagnóstico.
 * ============================================================ */

function esTerminal_(e) { return e === 'operada' || e === 'suspendida' || e === 'referida'; }

function hoyStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function sumarDias_(f, n) {
  if (!f) return null;
  var p = String(f).slice(0, 10).split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
}

function diasEntre_(a, b) {
  if (!a || !b) return null;
  var pa = String(a).slice(0, 10).split('-'), pb = String(b).slice(0, 10).split('-');
  var ua = Date.UTC(+pa[0], +pa[1] - 1, +pa[2]), ub = Date.UTC(+pb[0], +pb[1] - 1, +pb[2]);
  if (isNaN(ua) || isNaN(ub)) return null;
  return Math.round((ub - ua) / 86400000);
}

function ecoUsable_(p) {
  return !!(p.eco_fecha && p.eco_semanas !== null && p.eco_semanas !== undefined && p.eco_semanas !== '');
}

/** El trimestre lo determinan las semanas que marcaba la propia ecografía, así
 *  que no hace falta preguntarlo: 1.º hasta 13+6, 2.º hasta 27+6, 3.º desde 28. */
function trimestreEco_(p) {
  if (!ecoUsable_(p)) return null;
  var s = parseInt(p.eco_semanas, 10) || 0;
  return s <= 13 ? 1 : (s <= 27 ? 2 : 3);
}

function furDeEco_(p) {
  if (!ecoUsable_(p)) return null;
  var d = (parseInt(p.eco_semanas, 10) || 0) * 7 + (parseInt(p.eco_dias, 10) || 0);
  return sumarDias_(p.eco_fecha, -d);
}

/** Cuál manda. Gemela de qxUsaEco en index.html: solo la eco del PRIMER
 *  trimestre desplaza a la FUR. Una del segundo o del tercero tiene un margen
 *  de una a tres semanas y movería la fecha de una cesárea por un dato menos
 *  preciso del que ya se tenía. */
function usaEco_(p) {
  if (!ecoUsable_(p)) return false;
  if (!p.fur) return true;
  return trimestreEco_(p) === 1;
}

/** Desde dónde se cuenta. */
function furEfectiva_(p) {
  if (usaEco_(p)) return furDeEco_(p);
  return p.fur ? String(p.fur).slice(0, 10) : null;
}

/** '38ss 2/7' en la fecha pedida, o null si no hay de dónde contar. */
function egEn_(p, fecha) {
  var fur = furEfectiva_(p);
  if (!fur || !fecha) return null;
  var d = diasEntre_(fur, fecha);
  if (d === null || d < 0 || d > 315) return null;
  return Math.floor(d / 7) + 'ss ' + (d % 7) + '/7';
}

/** La fecha en la que se cuenta. Gemela de qxFechaCorte en index.html: mientras
 *  el caso sigue abierto, hoy; en cuanto se cierra, PARA en el día en que se
 *  cerró. Así la hoja de GERESA deja de moverse a la vez que la app. */
function fechaCorte_(p) {
  if (p.estado === 'operada')    return p.fecha_real_operacion || p.fecha_cirugia || p.fecha_cierre || null;
  if (p.estado === 'suspendida') return p.fecha_suspension || p.fecha_cierre || p.fecha_cirugia || null;
  if (p.estado === 'referida')   return p.fecha_cierre || p.fecha_suspension || null;
  return hoyStr_();
}

/** Con qué precisión se dató. Va en el diagnóstico porque quien lea la hoja
 *  necesita saberlo: no es lo mismo una eco de 12 semanas que una de 34. */
function fuenteEG_(p) {
  if (!usaEco_(p)) return 'x FUR';
  var t = trimestreEco_(p);
  return 'x eco ' + (t === 1 ? '1TRI' : t + 'T');
}

/** El diagnóstico 1 tal como va a la hoja.
 *  Si la paciente tiene FUR o eco, lo escribe el sistema entero y se actualiza
 *  solo. Si no, es el texto que escribió una persona y no se toca jamás: así,
 *  una edad gestacional escrita a mano sin FUR se queda quieta, que es lo
 *  honesto — el sistema no sabe desde cuándo contarla. */
function dxPrincipal_(p) {
  var eg = egEn_(p, fechaCorte_(p));
  if (eg) return 'EU ' + eg + ' ' + fuenteEG_(p);
  return p.diagnostico ? String(p.diagnostico) : '';
}

/** Devuelve el valor EXACTO del catálogo si coincide (ignora tildes/mayúsculas),
    o null si no coincide. El llamador decide el fallback. */
function catalogMatch(val, lista) {
  if (val === null || val === undefined) return null;
  var n = norm(String(val).trim());
  if (!n) return null;
  for (var i = 0; i < lista.length; i++) {
    if (norm(lista[i]) === n) return lista[i];
  }
  return null;
}

/* ============================================================
 * MAPEO para la hoja OFICIAL (valores de los catálogos)
 * ============================================================ */

/* La hoja ANTIGUA tiene su propia validación de datos y solo acepta "F"/"M";
   el catálogo GERESA ("Femenino"/"Masculino") es exclusivo de la hoja oficial.
   Escribir el valor largo ahí reventaba la escritura ENTERA de ambas hojas. */
function mapGeneroCorto(s) {
  var g = mapGenero(s);
  return g ? g.charAt(0).toUpperCase() : '';
}

function mapGenero(s) {
  var n = norm(s);
  if (n === 'femenino' || n === 'f' || n === 'mujer') return 'Femenino';
  if (n === 'masculino' || n === 'm' || n === 'hombre') return 'Masculino';
  return s || '';
}

function mapSeguro(s) {
  var exact = catalogMatch(s, CAT.seguro);
  if (exact) return exact;
  return norm(s) ? 'Otro' : '';   // SOAT u otros no catalogados → Otro
}

function mapNivel(s) {
  var n = norm(s);
  if (n === 'menor') return 'Menor';
  if (n === 'mayor') return 'Mayor';
  if (n === 'alta complejidad' || n === 'altacomplejidad') return 'Mayor';
  return '';
}

function mapAnestesia(s) {
  var n = norm(s);
  if (!n) return '';
  if (n === 'local') return 'Local';
  return 'Regional/General';   // regional, general, combinada, raquídea
}

function mapImagenes(s) {
  var n = norm(s);
  if (n === 'si') return 'Sí';
  if (n === 'no') return 'No';
  return '';
}

function mapResultadoPreop(p) {
  // Lo elegido explícitamente en la app manda: es el único camino por el que
  // puede llegar "No apto", que no se deduce de los dos booleanos.
  var elegido = catalogMatch(p.resultado_preop, CAT.resultadoPreop);
  if (elegido) return elegido;
  if (p.riesgo_qx === true && p.riesgo_anestesiologico === true) return 'Apto';
  // Cirugía General: sin evaluación no se afirma "Pendiente" (una cirugía
  // menor con riesgo NA, o un caso ya cerrado que nunca se evaluó).
  if (opcionDe_(p, 'preopVacioSinEvaluacion')) {
    if (p.riesgo_qx_na === true && p.riesgo_qx !== true) return '';
    if (esTerminal_(p.estado) && p.riesgo_qx !== true && p.riesgo_anestesiologico !== true) return '';
  }
  return 'Pendiente';   // aún sin ambas evaluaciones completas
}

function mapEstadoProgramacion(p) {
  if (p.fecha_cirugia) return 'Programado';
  var e = p.estado;
  // "referida" sale de la lista sin cirugía: si nunca tuvo fecha, no estuvo
  // programada. Poner "Programado" con la fecha vacía rompe la fila.
  var programados = ['programada','hospitalizada','operada','suspendida'];
  for (var i = 0; i < programados.length; i++) if (e === programados[i]) return 'Programado';
  return 'Pendiente de fecha';
}

function mapEstadoActual(e) {
  if (e === 'operada') return 'Operado';
  if (e === 'suspendida') return 'Suspendido';
  if (e === 'referida') return 'Cerrado sin cirugía';
  return 'En lista de espera';
}

/** Resuelve origen (propio vs referido) y sus campos asociados.
 *
 * Provincia y distrito salen, en este orden:
 *   1. De lo que la app capturó explícitamente (campos editables).
 *   2. Del sufijo del catálogo CAT_ORIGEN: "NOMBRE - PROVINCIA - DISTRITO".
 *   3. Si la paciente es propia, de las constantes del propio hospital.
 *
 * GERESA no exige estas dos columnas para paciente propia —de hecho los demás
 * hospitales de la hoja regional las dejan vacías— pero el servicio pidió
 * verlas siempre llenas, así que para propia van TRUJILLO / LAREDO.
 */
function resolverOrigen(p) {
  var nombre = String(p.establecimiento_origen || '');
  var o = norm(nombre);
  var propio = !o || o === 'n.a.' || o.indexOf('paciente propio') >= 0
    || /hospital distrital (de )?laredo/.test(o);

  var provincia = String(p.provincia_origen || '').trim();
  var distrito  = String(p.distrito_origen  || '').trim();

  if (!provincia || !distrito) {
    var partes = nombre.split(' - ');
    if (partes.length >= 3) {
      if (!provincia) provincia = partes[partes.length - 2].trim();
      if (!distrito)  distrito  = partes[partes.length - 1].trim();
    }
  }

  if (propio) {
    return {
      origen: CONSTANTES.establecimientoOrigen,
      codigo: '',
      provincia: provincia || (opcionDe_(p, 'origenPropioVacio') ? '' : CONSTANTES.provincia),
      distrito:  distrito  || (opcionDe_(p, 'origenPropioVacio') ? '' : CONSTANTES.distrito),
      fechaRef: ''
    };
  }
  return {
    origen: nombre,
    codigo: p.codigo_origen || '',
    provincia: provincia,
    distrito: distrito,
    fechaRef: fmtFecha(p.fecha_captacion)
  };
}

function mapMotivoEspera(p) {
  var exact = catalogMatch(p.motivo_espera, CAT.motivoEspera);
  if (exact) return exact;
  // Texto heredado ("SUSPENDIDO", "REFERIDO", "En lista de espera") no es un
  // "motivo de espera" del catálogo → se deja en blanco.
  return '';
}

function mapMotivoSuspension(p) {
  if (p.estado !== 'suspendida') return '';
  var exact = catalogMatch(p.motivo_suspension, CAT.motivoSuspension);
  if (exact) return exact;
  var n = norm(p.motivo_suspension || '');
  if (!n) return '';
  if (n.indexOf('no acudio') >= 0 || n.indexOf('no se presento') >= 0) return CAT.motivoSuspension[0];
  if (n.indexOf('ayuno') >= 0 || n.indexOf('preparacion') >= 0 || n.indexOf('incumplimiento') >= 0) return CAT.motivoSuspension[1];
  if (n.indexOf('clinica') >= 0 || n.indexOf('condicion') >= 0) return CAT.motivoSuspension[2];
  if (n.indexOf('anestes') >= 0) return CAT.motivoSuspension[3];
  if (n.indexOf('insumo') >= 0) return CAT.motivoSuspension[4];
  if (n.indexOf('medicamento') >= 0) return CAT.motivoSuspension[5];
  if (n.indexOf('sala') >= 0 || n.indexOf('inoperatividad') >= 0) return CAT.motivoSuspension[6];
  if (n.indexOf('esterilizacion') >= 0) return CAT.motivoSuspension[7];
  if (n.indexOf('recurso') >= 0) return CAT.motivoSuspension[8];
  if (n.indexOf('biomedic') >= 0 || n.indexOf('equipo') >= 0) return CAT.motivoSuspension[9];
  if (n.indexOf('emergencia') >= 0) return CAT.motivoSuspension[10];
  if (n.indexOf('error') >= 0 || n.indexOf('administrativo') >= 0) return CAT.motivoSuspension[11];
  return CAT.motivoSuspension[12];
}

/** Mapa: encabezado (normalizado) → valor, para la hoja OFICIAL (56 columnas). */
function buildValuesNew(p) {
  var o = resolverOrigen(p);
  var esOperada = (p.estado === 'operada');
  var esReferida = (p.estado === 'referida');
  var esSuspendida = (p.estado === 'suspendida');
  var v = {};

  // OJO: el "ID registro" de la hoja OFICIAL NO se manda desde acá.
  // Esa hoja la comparten varios servicios del hospital y cada uno numeraba por
  // su cuenta, así que mandar el id_registro interno de la app duplicaba los
  // IDs 1..6 contra los de Cirugía General. Lo asigna upsert() como correlativo
  // de la propia hoja (su posición entre las filas de datos). Si se vuelve a
  // poner esta línea, el bucle de escritura pisa ese correlativo y vuelven los
  // duplicados.
  v['establecimiento quirurgico destino'] = p.establecimiento_destino || CONSTANTES.establecimientoDestino;
  v['codigo unico destino']              = p.codigo_destino || CONSTANTES.codigoDestino;
  v['red/ris destino']                   = p.red_destino || CONSTANTES.red;
  v['establecimiento origen que refiere'] = o.origen;
  v['codigo unico origen']               = o.codigo;
  v['provincia origen']                  = o.provincia;
  v['distrito origen']                   = o.distrito;
  v['fecha referencia aceptada']         = o.fechaRef;
  v['dni']                               = p.dni;
  v['apellidos y nombres completos']     = p.nombre;
  v['edad']                              = p.edad;
  v['genero']                            = mapGenero(p.sexo);
  v['celular']                           = String(p.telefono || '');
  v['tipo de seguro']                    = mapSeguro(p.tipo_seguro);
  v['n° historia clinica']               = p.hcl;
  v['especialidad quirurgica']           = p.especialidad || especialidadDe_(p);
  v['cirujano responsable']              = p.doctor;
  v['cie-10 principal']                  = p.cie10;
  v['diagnostico principal']             = dxPrincipal_(p);
  v['cie-10 secundario']                 = p.cie10_secundario || '';
  v['diagnostico secundario']            = p.diagnostico_secundario || '';
  v['cie-10 tercero']                    = p.cie10_tercero || '';
  v['diagnostico tercero']               = p.diagnostico_tercero || '';
  v['codigo procedimiento']              = p.codigo_procedimiento || '';
  v['procedimiento quirurgico propuesto'] = p.procedimiento;
  v['nivel de cirugia']                  = mapNivel(p.nivel_cirugia);
  v['tipo de anestesia']                 = mapAnestesia(p.tipo_anestesia);
  v['f. primera evaluacion por cirugia'] = fmtFecha(p.fecha_primera_evaluacion);

  // Exámenes prequirúrgicos (derivados de Fase 2 / Fase 3)
  var t1 = '', f1 = '', t2 = '', f2 = '';
  if (p.laboratorio_completo === true) { t1 = 'Laboratorio'; f1 = fmtFecha(p.fecha_examen1 || p.fecha_fase2); }
  if (p.ekg === true) { t2 = 'EKG'; f2 = fmtFecha(p.fecha_examen2 || p.fecha_fase2); }
  v['tipo examen prequirurgico 1']  = t1;
  v['fecha examen prequirurgico 1'] = f1;
  v['tipo examen prequirurgico 2']  = t2;
  v['fecha examen prequirurgico 2'] = f2;
  v['tipo examen prequirurgico 3']  = p.tipo_examen3 || '';
  v['fecha examen prequirurgico 3'] = fmtFecha(p.fecha_examen3);

  v['¿aplica diagnostico por imagenes?'] = mapImagenes(p.aplica_imagenes);
  v['f. diagnostico por imagenes']       = fmtFecha(p.fecha_imagenes);
  v['f. riesgo quirurgico']              = fmtFecha(p.fecha_cita_cardiologia);
  v['f. evaluacion anestesica']          = fmtFecha(p.fecha_cita_anestesiologia);
  v['f. evaluacion preoperatoria por cirugia'] = fmtFecha(p.fecha_evaluacion_preoperatoria);
  v['resultado evaluacion preoperatoria'] = mapResultadoPreop(p);
  v['n° orden de intervencion']          = p.orden_intervencion || '';
  v['estado de programacion']            = mapEstadoProgramacion(p);
  v['fecha programacion quirurgica']     = fmtFecha(p.fecha_cirugia);
  v['motivo de espera']                  = mapMotivoEspera(p);
  v['detalle motivo de espera']          = p.detalle_motivo_espera || '';
  v['estado actual del paciente']        = mapEstadoActual(p.estado);

  // Suspensión (solo si la cirugía programada no se realizó)
  v['fecha suspension']      = esSuspendida ? fmtFecha(p.fecha_suspension || p.fecha_resolucion) : '';
  v['motivo suspension']     = mapMotivoSuspension(p);
  v['detalle motivo suspension'] = p.detalle_suspension || '';

  // Cierre (salida definitiva de lista, con o sin cirugía).
  // Lo que la persona eligió en la app manda; los valores fijos quedan como
  // respaldo para las filas viejas que se cerraron antes de que la app
  // pudiera capturarlos.
  var tipoCierre   = catalogMatch(p.tipo_cierre,   CAT.tipoCierre);
  var motivoCierre = catalogMatch(p.motivo_cierre, CAT.motivoCierre);
  if (esOperada) {
    v['tipo cierre']   = tipoCierre || CAT.tipoCierre[0];         // Cirugía realizada
    v['motivo cierre'] = motivoCierre || CAT.motivoCierre[0];     // …en la IPRESS
    v['fecha cierre']  = fmtFecha(p.fecha_cierre || p.fecha_real_operacion || p.fecha_resolucion);
    v['fecha real de operacion'] = fmtFecha(p.fecha_real_operacion || p.fecha_cirugia || p.fecha_resolucion);
    v['lugar/ipress donde se realizo la cirugia'] = p.lugar_cirugia || CONSTANTES.lugarCirugia;
  } else if (esReferida) {
    v['tipo cierre']   = tipoCierre || CAT.tipoCierre[1];         // Salida de lista sin cirugía
    v['motivo cierre'] = motivoCierre || 'Paciente referido o transferido a otra institución';
    v['fecha cierre']  = fmtFecha(p.fecha_cierre || p.fecha_resolucion);
  } else {
    v['tipo cierre']   = '';
    v['motivo cierre'] = '';
    v['fecha cierre']  = '';
    v['fecha real de operacion'] = '';
    v['lugar/ipress donde se realizo la cirugia'] = '';
  }

  // "Observación" es el único destino que el formato deja para datos que la
  // app captura y que no tienen columna propia (hospital al que se refirió a
  // la paciente y el motivo del cierre escrito a mano).
  var obs = [];
  if (p.observacion) obs.push(String(p.observacion));
  if (esReferida && p.referencia_hospital) obs.push('Referida a ' + p.referencia_hospital);
  if (esReferida && p.motivo_suspension) obs.push(String(p.motivo_suspension));
  v['observacion'] = obs.join(' · ');
  return v;
}

/* ============================================================
 * MAPEO para la hoja ANTIGUA (formato "FILA AZUL").
 * Los VALORES ahora siguen el catálogo oficial GERESA (igual que la
 * hoja oficial): una sola fuente de instrucciones para ambas hojas.
 * La hoja antigua solo recibe el subconjunto de columnas que tiene,
 * pero con los mismos valores que la hoja oficial.
 * ============================================================ */

function buildValuesOld(p) {
  var o = resolverOrigen(p);
  var v = {};
  if (p.id_registro != null && p.id_registro !== '') v['id registro'] = p.id_registro;
  v['establecimiento quirurgico destino'] = p.establecimiento_destino || CONSTANTES.establecimientoDestino;
  v['codigo unico destino']              = p.codigo_destino || CONSTANTES.codigoDestino;
  v['red/ris destino']                   = p.red_destino || CONSTANTES.red;
  v['establecimiento origen que refiere'] = o.origen;
  v['codigo unico origen']               = o.codigo;
  v['provincia origen']                  = o.provincia;
  v['distrito origen']                   = o.distrito;
  v['fecha referencia aceptada']         = o.fechaRef;
  v['dni']                               = p.dni;
  v['apellidos y nombres completos']     = p.nombre;
  v['edad']                              = p.edad;
  v['genero']                            = (SERVICIOS_HOJAS[servicioDe_(p)] || {}).generoLargo ? mapGenero(p.sexo) : mapGeneroCorto(p.sexo);
  v['celular']                           = String(p.telefono || '');
  v['tipo de seguro']                    = mapSeguro(p.tipo_seguro);
  v['n° historia clinica']               = p.hcl;
  v['especialidad quirurgica']           = p.especialidad || especialidadDe_(p);
  v['cirujano responsable']              = p.doctor;
  v['cie-10 principal']                  = p.cie10;
  v['diagnostico principal']             = dxPrincipal_(p);
  v['procedimiento quirurgico propuesto'] = p.procedimiento;
  v['nivel de cirugia']                  = mapNivel(p.nivel_cirugia);
  v['tipo de anestesia']                 = mapAnestesia(p.tipo_anestesia);
  v['f. riesgo quirurgico']              = (p.riesgo_qx_na === true && p.riesgo_qx !== true) ? 'NA' : fmtFecha(p.fecha_cita_cardiologia);
  v['f. evaluacion anestesica']          = fmtFecha(p.fecha_cita_anestesiologia);
  v['resultado evaluacion preoperatoria'] = mapResultadoPreop(p);
  v['estado de programacion']            = mapEstadoProgramacion(p);
  v['fecha programacion quirurgica']     = fmtFecha(p.fecha_cirugia);
  v['motivo de espera']                  = mapMotivoEspera(p);
  v['detalle motivo de espera']          = p.detalle_motivo_espera || '';
  v['estado actual del paciente']        = mapEstadoActual(p.estado);
  v['cie-10 secundario']                 = p.cie10_secundario || '';
  v['diagnostico secundario']            = p.diagnostico_secundario || '';
  v['cie-10 tercero']                    = p.cie10_tercero || '';
  v['diagnostico tercero']               = p.diagnostico_tercero || '';
  v['codigo procedimiento']              = p.codigo_procedimiento || '';
  v['f. primera evaluacion por cirugia'] = fmtFecha(p.fecha_primera_evaluacion);
  v['f. evaluacion preoperatoria por cirugia'] = fmtFecha(p.fecha_evaluacion_preoperatoria);
  v['n° orden de intervencion']          = p.orden_intervencion || '';
  v['¿aplica diagnostico por imagenes?'] = mapImagenes(p.aplica_imagenes);
  v['f. diagnostico por imagenes']       = fmtFecha(p.fecha_imagenes);
  var t1 = '', f1 = '', t2 = '', f2 = '';
  if (p.laboratorio_completo === true) { t1 = 'Laboratorio'; f1 = fmtFecha(p.fecha_examen1 || p.fecha_fase2); }
  if (p.ekg === true) { t2 = 'EKG'; f2 = fmtFecha(p.fecha_examen2 || p.fecha_fase2); }
  // "NA" (no aplica, sql/034): cirugías menores de Cirugía General. En gineco
  // estas marcas están siempre en false.
  if (p.laboratorio_na === true && p.laboratorio_completo !== true) { t1 = 'NA'; f1 = ''; }
  if (p.ekg_na === true && p.ekg !== true) { t2 = 'NA'; f2 = ''; }
  v['tipo examen prequirurgico 1']  = t1;
  v['fecha examen prequirurgico 1'] = f1;
  v['tipo examen prequirurgico 2']  = t2;
  v['fecha examen prequirurgico 2'] = f2;
  v['tipo examen prequirurgico 3']  = p.tipo_examen3 || '';
  v['fecha examen prequirurgico 3'] = fmtFecha(p.fecha_examen3);
  return v;
}

/* ============================================================
 * Escritura genérica (sirve para ambas hojas)
 * ============================================================ */

function findHeaderRow(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow === 0) return 0;
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < values[r].length; c++) {
      if (norm(values[r][c]) === 'id registro') return r + 1;
    }
  }
  return 0;
}

function buildColumnMap(sheet, headerRow) {
  var lastCol = sheet.getLastColumn();
  var row = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var map = {};
  for (var c = 0; c < row.length; c++) {
    var key = norm(row[c]);
    if (key && !(key in map)) map[key] = c + 1;
  }
  return map;
}

function upsert(ssId, sheetName, values, p) {
  var ss = SpreadsheetApp.openById(ssId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('No se encontró la pestaña "' + sheetName + '" (ID ' + ssId + ').');
  var headerRow = findHeaderRow(sheet);
  if (!headerRow) throw new Error('No se encontró el encabezado "ID registro" en "' + sheetName + '".');

  var colMap = buildColumnMap(sheet, headerRow);
  var dniCol = colMap['dni'];
  var nombreCol = colMap['apellidos y nombres completos'];
  var idCol = colMap['id registro'];
  var estCol = colMap['establecimiento quirurgico destino'];
  var lastRow = sheet.getLastRow();

  var dniData = sheet.getRange(headerRow + 1, dniCol, lastRow - headerRow, 1).getValues();
  var nombreData = sheet.getRange(headerRow + 1, nombreCol, lastRow - headerRow, 1).getValues();
  var estData = estCol ? sheet.getRange(headerRow + 1, estCol, lastRow - headerRow, 1).getValues() : null;

  var targetRow = 0;
  var esNuevo = true;

  // 1) Por DNI.
  var dniBuscado = String(p.dni || '').trim();
  if (dniBuscado) {
    for (var i = 0; i < dniData.length; i++) {
      if (String(dniData[i][0]).trim() === dniBuscado) { targetRow = headerRow + 1 + i; esNuevo = false; break; }
    }
  }
  // 2) Por nombre (solo filas a las que aún NO se les llenó el DNI en la hoja,
  //    para no pisar a un paciente de otra especialidad que comparta nombre).
  if (!targetRow && norm(p.nombre)) {
    var nomBuscado = norm(p.nombre);
    for (var j = 0; j < nombreData.length; j++) {
      if (norm(nombreData[j][0]) === nomBuscado && String(dniData[j][0]).trim() === '') {
        targetRow = headerRow + 1 + j; esNuevo = false; break;
      }
    }
  }
  // 3) Primera fila vacía (sin nombre, sin DNI y sin establecimiento-destino).
  if (!targetRow) {
    for (var k = 0; k < nombreData.length; k++) {
      var esFilaResumen = estData && String(estData[k][0]).trim() !== '';
      if (String(nombreData[k][0]).trim() === '' && String(dniData[k][0]).trim() === '' && !esFilaResumen) {
        targetRow = headerRow + 1 + k; break;
      }
    }
    if (!targetRow) targetRow = lastRow + 1;
  }

  // 4) "ID registro".
  //
  //    En la hoja OFICIAL es el correlativo de la propia hoja: su posición
  //    entre las filas de datos. Esa hoja la comparten varios servicios y cada
  //    uno traía su propia numeración, así que los IDs se pisaban (1..6 salían
  //    duplicados). Por posición quedan únicos y ordenados solos, y las filas
  //    de los otros servicios conservan el valor que ya tienen porque están
  //    arriba: su posición coincide con su ID actual.
  //
  //    En la hoja ANTIGUA, que es solo de este servicio, manda el id_registro
  //    de la app y solo se autonumera al insertar una fila nueva.
  if (idCol) {
    if (ssId === SS_ID_2) {
      sheet.getRange(targetRow, idCol).setValue(targetRow - headerRow);
    } else if (esNuevo) {
      var nextId = 1;
      var idData = sheet.getRange(headerRow + 1, idCol, lastRow - headerRow, 1).getValues();
      for (var m = 0; m < idData.length; m++) {
        var tieneDato = String(nombreData[m][0]).trim() !== '' || String(dniData[m][0]).trim() !== '';
        if (!tieneDato) continue;
        var num = parseInt(String(idData[m][0]), 10);
        if (!isNaN(num) && num >= nextId) nextId = num + 1;
      }
      sheet.getRange(targetRow, idCol).setValue(nextId);
    }
  }

  // 5) Escribe cada valor en su columna.
  //
  //    Cada hoja tiene su propia validación de datos. Un setValue que la
  //    infringe NO lanza en el momento: revienta al hacer flush, o sea DESPUÉS
  //    de que doPost devolvió su JSON. Google entonces reemplaza la respuesta
  //    por una página HTML de error y se pierde la escritura completa — la de
  //    esta hoja Y la de la otra. Una sola celda mal validada tumbaba todo.
  //
  //    Por eso el flush se fuerza acá adentro: si el lote falla, se reintenta
  //    celda por celda y se saltan las rechazadas, que se devuelven al llamador
  //    para que queden registradas en vez de desaparecer.
  var pendientes = [];
  for (var key in values) {
    var col = colMap[key];
    if (!col) continue;
    pendientes.push({ key: key, col: col, val: values[key] });
  }

  function escribirCelda(x) {
    var rng = sheet.getRange(targetRow, x.col);
    if (esColumnaFecha(x.key)) rng.setNumberFormat('@');
    if (x.key === 'celular') rng.setNumberFormat('@').setHorizontalAlignment('center');
    rng.setValue(x.val);
  }

  var rechazadas = [];
  try {
    for (var w = 0; w < pendientes.length; w++) escribirCelda(pendientes[w]);
    SpreadsheetApp.flush();
  } catch (errLote) {
    for (var z = 0; z < pendientes.length; z++) {
      try {
        escribirCelda(pendientes[z]);
        SpreadsheetApp.flush();
      } catch (errCelda) {
        rechazadas.push(pendientes[z].key + ' = "' + pendientes[z].val + '"');
      }
    }
  }
  return { row: targetRow, rechazadas: rechazadas };
}

/* Borra TODAS las filas de una hoja cuyo DNI coincide (normalmente 1).
 * Solo se dispara cuando eliminan una paciente en la app, así que es
 * una acción deliberada del usuario, no una limpieza automática. */
function borrarDeHoja(ssId, sheetName, dni) {
  var ss = SpreadsheetApp.openById(ssId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('No se encontró la pestaña "' + sheetName + '" (ID ' + ssId + ').');
  var headerRow = findHeaderRow(sheet);
  if (!headerRow) throw new Error('No se encontró el encabezado "ID registro" en "' + sheetName + '".');

  var colMap = buildColumnMap(sheet, headerRow);
  var dniCol = colMap['dni'];
  if (!dniCol) return { ok: true, filasBorradas: 0 };

  var lastRow = sheet.getLastRow();
  var dniData = sheet.getRange(headerRow + 1, dniCol, lastRow - headerRow, 1).getValues();

  // Recorrer de abajo hacia arriba para no desfasar los índices al borrar.
  var filasBorradas = 0;
  var dniBuscado = String(dni || '').trim();
  for (var i = dniData.length - 1; i >= 0; i--) {
    if (String(dniData[i][0]).trim() === dniBuscado) {
      sheet.deleteRow(headerRow + 1 + i);
      filasBorradas++;
    }
  }
  return { ok: true, filasBorradas: filasBorradas };
}

/* ============================================================
 * Endpoint
 * ============================================================ */

/** Aplica fn a cada hoja del servicio de p y junta los resultados como la
 *  app los espera: { ok, antiguo, oficial } (antiguo = la hoja de 47 columnas
 *  del servicio, oficial = la de 56 si el servicio la tiene). Un error en una
 *  hoja no impide intentar la otra. */
function enHojasDe_(p, fn) {
  var cfg;
  try { cfg = configDe_(p); }
  catch (err) { return { ok: false, error: err.message }; }
  var out = { ok: true };
  cfg.hojas.forEach(function (h) {
    var clave = h.formato === 'oficial' ? 'oficial' : 'antiguo';
    try { out[clave] = fn(h); }
    catch (err) { out[clave] = { ok: false, error: String(err) }; }
    if (!out[clave].ok) out.ok = false;
  });
  return out;
}

/** Escribe (o actualiza) al paciente en las hojas de su servicio. */
function escribirPaciente_(p) {
  return enHojasDe_(p, function (h) {
    var u = upsert(h.ssId, h.name, h.formato === 'oficial' ? buildValuesNew(p) : buildValuesOld(p), p);
    return { ok: true, row: u.row, rechazadas: u.rechazadas };
  });
}

function json(obj) {
  obj.version = VERSION;
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.token !== TOKEN) return json({ ok: false, error: 'token no válido' });

    // Sincronizar ahora, a petición de la app.
    //
    // Existe para que la hoja NO tenga que estar publicada en la web. Antes la
    // app leía el CSV público desde el móvil —sin poder autenticarse en Google—
    // y eso obligaba a dejar la hoja abierta a cualquiera con el enlace, con
    // nombres, DNI y teléfonos dentro. Ahora la lectura ocurre aquí, con la
    // cuenta autorizada, y la app solo pide el resultado.
    if (body.accion === 'sincronizar') {
      var res = sincronizarTodo();
      if (!res) return json({ ok: false, error: 'otra sincronización estaba en marcha; inténtalo en un minuto' });
      return json({
        ok: res.errores.length === 0,
        altas: res.altas.length,
        rellenos: res.rellenos.length,
        discrepancias: res.discrepancias,
        empujadas: res.empujadas,
        errores: res.errores
      });
    }

    // Exportación del jefe de información (ver EXPORTACIÓN más abajo). Exige
    // además la sesión de la app: el TOKEN solo no alcanza.
    if (body.accion === 'exportar') {
      try { return json(exportar_(body)); }
      catch (err) { return json({ ok: false, error: err.message || String(err) }); }
    }

    // Borrado explícito (eliminar paciente en la app): borra por DNI en las
    // hojas de SU servicio. Una app sin actualizar no manda servicio: gineco.
    if (body.accion === 'borrar') {
      if (!body.dni) return json({ ok: false, error: 'falta dni' });
      return json(enHojasDe_({ servicio: body.servicio }, function (h) {
        return borrarDeHoja(h.ssId, h.name, body.dni);
      }));
    }

    var p = body.paciente || {};
    if (!p.dni) return json({ ok: false, error: 'falta dni' });
    return json(escribirPaciente_(p));
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/* ============================================================
 * Utilidades manuales (opcionales)
 * ============================================================ */

function doGet(e) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return json({ ok: false, error: 'pestaña no encontrada' });
  var headerRow = findHeaderRow(sheet);
  if (!headerRow) return json({ ok: false, error: 'encabezado no encontrado' });
  var colMap = buildColumnMap(sheet, headerRow);
  var idCol = colMap['id registro'];
  var dniCol = colMap['dni'];
  var nombreCol = colMap['apellidos y nombres completos'];
  var lastRow = sheet.getLastRow();
  var nextId = 1;
  if (idCol && dniCol && nombreCol && lastRow > headerRow) {
    var n = lastRow - headerRow;
    var idData = sheet.getRange(headerRow + 1, idCol, n, 1).getValues();
    var dniData = sheet.getRange(headerRow + 1, dniCol, n, 1).getValues();
    var nombreData = sheet.getRange(headerRow + 1, nombreCol, n, 1).getValues();
    for (var i = 0; i < idData.length; i++) {
      var tieneDato = String(nombreData[i][0]).trim() !== '' || String(dniData[i][0]).trim() !== '';
      if (!tieneDato) continue;
      var idn = parseInt(String(idData[i][0]), 10);
      if (!isNaN(idn) && idn >= nextId) nextId = idn + 1;
    }
  }
  return json({ ok: true, nextId: nextId, total: nextId - 1 });
}

function formatearCelular() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No se encontró la pestaña "' + SHEET_NAME + '".');
  var headerRow = findHeaderRow(sheet);
  if (!headerRow) throw new Error('No se encontró la fila de encabezado.');
  var colMap = buildColumnMap(sheet, headerRow);
  var col = colMap['celular'];
  if (!col) throw new Error('No se encontró la columna "celular".');
  var lastRow = sheet.getLastRow();
  var n = Math.max(1, lastRow - headerRow);
  sheet.getRange(headerRow + 1, col, n, 1).setNumberFormat('@').setHorizontalAlignment('center');
}

/* ============================================================
 * DESPLEGABLES de la hoja de CIRUGÍA GENERAL
 * ============================================================
 * La hoja de gineco tiene listas desplegables y la de Cirugía General no tenía
 * ninguna. Estas son las columnas con catálogo en el formato de 47 columnas,
 * con los valores EXACTOS que escribe la app (los del catálogo oficial). No se
 * ponen en columnas de texto libre (distrito, cirujano…): con una lista
 * cerrada la hoja rechazaría un distrito que no esté en ella.
 *
 *   probarDesplegablesCirugia()  NO escribe: dice qué pondría y qué celdas ya
 *                                escritas quedarían fuera de la lista.
 *   ponerDesplegablesCirugia()   los pone, desde la fila siguiente al
 *                                encabezado "ID registro" hasta 500 filas más
 *                                abajo. Se puede repetir: reemplaza la regla.
 *
 * Una celda ya escrita que no esté en la lista NO se borra ni se cambia: queda
 * marcada en rojo para que alguien la corrija a mano.
 * ============================================================ */
var DESPLEGABLES_47 = {
  'genero':                             CAT.genero,
  'tipo de seguro':                     CAT.seguro,
  'nivel de cirugia':                   CAT.nivel,
  'tipo de anestesia':                  CAT.anestesia,
  '¿aplica diagnostico por imagenes?':  CAT.imagenes,
  'resultado evaluacion preoperatoria': CAT.resultadoPreop,
  'estado de programacion':             CAT.estadoProgramacion,
  'motivo de espera':                   CAT.motivoEspera,
  'estado actual del paciente':         CAT.estadoActual
};

/* ============================================================
 * EXPORTACIÓN PARA EL JEFE DE INFORMACIÓN
 * ============================================================
 * La app (módulo 📤 Exportar) pide un Excel en línea con los pacientes de uno
 * o varios servicios en un rango de fechas, en el formato de las hojas. Este
 * código:
 *   1. Comprueba QUIÉN lo pide con su sesión de la app (el TOKEN de arriba
 *      está en el código de la app, que es público: no basta). Solo el jefe
 *      de información o un admin, con cuenta aprobada.
 *   2. Lee los pacientes de la base, filtra, y arma cada fila con las MISMAS
 *      funciones que escriben las hojas (buildValuesOld / buildValuesNew).
 *   3. Hace una COPIA FIEL del archivo oficial de la GERESA
 *      (FORMATO_LISTA_ESPERA_QUIRURGICA_LAREDO.xlsx, pestaña LISTA_ESPERA_QX),
 *      vacía sus filas de datos y escribe solo los pacientes elegidos.
 *   4. Según pida el jefe: la comparte SOLO con su correo (link; nunca
 *      "cualquiera con el enlace", lleva DNI y teléfonos) o la devuelve como
 *      archivo .xlsx y manda la copia a la papelera.
 *
 * Después de pegar este código hay que ejecutar UNA vez autorizarExportacion()
 * para darle permiso de crear y compartir archivos en Drive.
 * ============================================================ */
var CARPETA_EXPORTES = 'Exportaciones GERESA - Hospital Laredo';

function autorizarExportacion() {
  var c = carpetaExportes_();
  Logger.log('Listo. Las exportaciones se guardan en la carpeta "' + c.getName() + '" de tu Drive.');
}

function carpetaExportes_() {
  var it = DriveApp.getFoldersByName(CARPETA_EXPORTES);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA_EXPORTES);
}

/** Quién pide la exportación, a partir de su sesión de la app. */
function usuarioDeSesion_(jwt) {
  if (!jwt) throw new Error('falta la sesión: vuelve a iniciar sesión en la app');
  var k = sbKey_();
  var r = UrlFetchApp.fetch(SB_URL + '/auth/v1/user', {
    headers: { apikey: k, Authorization: 'Bearer ' + jwt }, muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) throw new Error('la sesión venció: vuelve a iniciar sesión en la app');
  var u = JSON.parse(r.getContentText());
  var w = sbFetch_('get', 'workers?select=name,rol,is_admin,aprobado&id=eq.' + encodeURIComponent(u.id));
  if (!w || !w.length) throw new Error('tu cuenta no tiene perfil en la app');
  w = w[0];
  if (!w.is_admin && !w.aprobado) throw new Error('tu cuenta todavía no está aprobada');
  if (!w.is_admin && w.rol !== 'jefe_info') throw new Error('solo el jefe de información puede exportar');
  return w;
}

/** Fecha con la que se filtra "por registro": la de captación/referencia y,
 *  si no hay, la primera evaluación por cirugía. Igual que en la app. */
function fechaRegistro_(p) {
  return String(p.fecha_captacion || p.fecha_primera_evaluacion || '').slice(0, 10) || null;
}

function exportar_(body) {
  var quien = usuarioDeSesion_(body.jwt);
  var servicios = (body.servicios || []).filter(function (s) { return !!SERVICIOS_HOJAS[s]; });
  if (!servicios.length) throw new Error('elige al menos un servicio');
  var fechaPor = body.fechaPor === 'cirugia' ? 'cirugia' : 'registro';
  var re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(body.desde || '') || !re.test(body.hasta || '')) throw new Error('faltan las fechas desde / hasta');
  if (body.desde > body.hasta) throw new Error('la fecha "desde" es posterior a "hasta"');
  var salida = body.salida === 'archivo' ? 'archivo' : 'link';
  var correo = String(body.correo || '').trim();
  if (salida === 'link' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw new Error('falta un correo de Google válido para compartir el Excel');

  // Pacientes
  var todos = sbFetch_('get', 'pacientes?select=*&servicio=in.(' + servicios.join(',') + ')');
  var sinFecha = 0;
  var lista = todos.filter(function (p) {
    var f = fechaPor === 'cirugia' ? String(p.fecha_cirugia || '').slice(0, 10) : fechaRegistro_(p);
    if (!f) { sinFecha++; return !!body.incluirSinFecha; }
    return f >= body.desde && f <= body.hasta;
  });
  lista.sort(function (a, b) {
    if (servicioDe_(a) !== servicioDe_(b)) return servicios.indexOf(servicioDe_(a)) - servicios.indexOf(servicioDe_(b));
    return (a.id_registro || 1e9) - (b.id_registro || 1e9);
  });

  // COPIA FIEL del archivo oficial de la GERESA: todas sus pestañas
  // (INSTRUCTIVO, CATALOGOS, DICCIONARIO_DATOS, VALIDACION_CALIDAD, CAT_…),
  // formatos, desplegables y fórmulas. Solo se vacían los valores de las
  // filas de datos —las de otros servicios— sin borrar filas: la pestaña
  // VALIDACION_CALIDAD cuenta sobre ese rango y tiene que seguir funcionando.
  var nombres = servicios.map(function (s) { return s === 'ginecologia' ? 'Ginecología' : 'Cirugía General'; });
  var titulo = 'LISTA_ESPERA_QX · ' + nombres.join(' + ') + ' · ' + body.desde + ' a ' + body.hasta
    + ' · por fecha de ' + (fechaPor === 'cirugia' ? 'cirugía' : 'registro');
  var copia = DriveApp.getFileById(SS_ID_2).makeCopy(titulo, carpetaExportes_());
  try {
    var ss = SpreadsheetApp.openById(copia.getId());
    var hoja = ss.getSheetByName(SHEET_NAME_2);
    if (!hoja) throw new Error('la copia no tiene la pestaña "' + SHEET_NAME_2 + '"');
    var filaCab = findHeaderRow(hoja);
    if (!filaCab) throw new Error('la copia no tiene el encabezado "ID registro"');
    var colMap = buildColumnMap(hoja, filaCab);
    var nCol = hoja.getLastColumn();
    var nDatos = hoja.getMaxRows() - filaCab;
    if (lista.length > nDatos) {
      hoja.insertRowsAfter(hoja.getMaxRows(), lista.length - nDatos);
      nDatos = lista.length;
    }
    var rango = hoja.getRange(filaCab + 1, 1, nDatos, nCol);
    var formulas = rango.getFormulas();
    var hayFormulas = formulas.some(function (r) { return r.some(function (f) { return !!f; }); });
    rango.clearContent();
    if (hayFormulas) rango.setFormulas(formulas);

    // Filas: las MISMAS funciones que escriben la hoja oficial. El ID registro
    // es el correlativo del archivo, como en la hoja oficial.
    var valores = lista.map(function (p, i) {
      var v = buildValuesNew(p);
      v['id registro'] = i + 1;
      return v;
    });
    // Columna por columna, y solo las que la app llena: una columna con
    // fórmulas no se pisa.
    //
    // LISTA_ESPERA_QX es una TABLA con columnas tipadas: Google no deja
    // cambiarles el formato ("No puedes establecer el formato de los números
    // de las celdas en una columna escrita") y puede rechazar un valor que no
    // cuadre con el tipo. Por eso: formato de texto solo donde la
    // sincronización ya lo pone (fechas y celular) y sin insistir si la
    // columna no lo admite; y si el bloque falla, celda por celda, como hace
    // upsert(), anotando las que la hoja no acepte en vez de tirar todo.
    var rechazadas = [];
    if (valores.length) {
      for (var key in colMap) {
        if (!(key in valores[0])) continue;
        var col = colMap[key];
        var celdas = hoja.getRange(filaCab + 1, col, valores.length, 1);
        if (esColumnaFecha(key) || key === 'celular') { try { celdas.setNumberFormat('@'); } catch (e) {} }
        var columna = valores.map(function (v) { return [v[key] == null ? '' : v[key]]; });
        try { celdas.setValues(columna); SpreadsheetApp.flush(); }
        catch (errCol) {
          for (var i = 0; i < columna.length; i++) {
            try { hoja.getRange(filaCab + 1 + i, col).setValue(columna[i][0]); SpreadsheetApp.flush(); }
            catch (errCelda) { rechazadas.push(key + ' (fila ' + (filaCab + 1 + i) + ') = "' + columna[i][0] + '"'); }
          }
        }
      }
    }
    SpreadsheetApp.flush();

    copia.setDescription('Exportado desde la app por ' + quien.name + ' el '
      + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
      + '. ' + lista.length + ' pacientes; ' + sinFecha + ' sin esa fecha'
      + (body.incluirSinFecha ? ' (incluidos).' : ' (no incluidos).'));

    if (salida === 'archivo') {
      // Se descarga y la copia se va a la papelera: no queda otro archivo con
      // datos de pacientes dando vueltas en Drive.
      var blob = copia.getBlob();
      var b64 = Utilities.base64Encode(blob.getBytes());
      copia.setTrashed(true);
      return { ok: true, salida: 'archivo', nombre: titulo + '.xlsx', base64: b64, pacientes: lista.length, sinFecha: sinFecha, rechazadas: rechazadas };
    }

    try { copia.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) {}
    try { copia.addEditor(correo); }
    catch (e) { throw new Error('no se pudo compartir con "' + correo + '": ¿es una cuenta de Google (Gmail)?'); }
    return { ok: true, salida: 'link', url: ss.getUrl(), nombre: titulo, pacientes: lista.length, sinFecha: sinFecha, rechazadas: rechazadas };
  } catch (err) {
    // Una copia con datos de pacientes no se deja a medias.
    try { copia.setTrashed(true); } catch (e) {}
    throw err;
  }
}

function probarDesplegablesCirugia() { return desplegables_(SS_ID_CG, SHEET_NAME_CG, true); }
function ponerDesplegablesCirugia()  { return desplegables_(SS_ID_CG, SHEET_NAME_CG, false); }

function desplegables_(ssId, sheetName, simular) {
  var sheet = SpreadsheetApp.openById(ssId).getSheetByName(sheetName);
  if (!sheet) throw new Error('No se encontró la pestaña "' + sheetName + '".');
  var headerRow = findHeaderRow(sheet);
  if (!headerRow) throw new Error('No se encontró el encabezado "ID registro" en "' + sheetName + '".');
  var colMap = buildColumnMap(sheet, headerRow);
  var filas = Math.max(sheet.getLastRow() - headerRow, 0) + 500;
  var L = [simular ? '=== SIMULACIÓN (no se escribió nada) ===' : '=== DESPLEGABLES PUESTOS ==='];
  L.push('Hoja "' + sheetName + '", encabezado en la fila ' + headerRow + ', filas ' + (headerRow + 1) + '–' + (headerRow + filas));

  for (var key in DESPLEGABLES_47) {
    var col = colMap[key];
    if (!col) { L.push('  ✗ no está la columna "' + key + '"'); continue; }
    var lista = DESPLEGABLES_47[key];
    var fuera = [];
    var n = sheet.getLastRow() - headerRow;
    if (n > 0) {
      var vals = sheet.getRange(headerRow + 1, col, n, 1).getValues();
      for (var i = 0; i < vals.length; i++) {
        var v = String(vals[i][0]).trim();
        if (v && lista.indexOf(v) < 0) fuera.push('fila ' + (headerRow + 1 + i) + ' «' + v + '»');
      }
    }
    L.push('  ✓ ' + key + ' (col ' + col + '): ' + lista.join(' | ')
      + (fuera.length ? '\n      fuera de la lista (quedan marcadas, no se tocan): ' + fuera.join(', ') : ''));
    if (!simular) {
      var regla = SpreadsheetApp.newDataValidation()
        .requireValueInList(lista, true)
        .setAllowInvalid(false)
        .build();
      sheet.getRange(headerRow + 1, col, filas, 1).setDataValidation(regla);
    }
  }
  Logger.log(L.join('\n'));
  return L.join('\n');
}

function listarDesplegables() {
  var ss = SpreadsheetApp.openById(SS_ID_2);
  var sheet = ss.getSheetByName(SHEET_NAME_2);
  if (!sheet) throw new Error('No se encontró la pestaña "' + SHEET_NAME_2 + '".');
  var headerRow = findHeaderRow(sheet);
  if (!headerRow) throw new Error('No se encontró el encabezado "ID registro".');
  var lastCol = sheet.getLastColumn();
  var header = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var out = [];
  for (var c = 0; c < header.length; c++) {
    if (!norm(header[c])) continue;
    var dv = sheet.getRange(headerRow + 1, c + 1).getDataValidation();
    if (!dv) continue;
    var valores = [];
    try {
      var tipo = dv.getCriteriaType();
      if (tipo === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
        var cv = dv.getCriteriaValues();
        var lista = cv && cv[0];
        if (!Array.isArray(lista)) lista = [lista];
        valores = lista.map(function (v) { return String(v); });
      } else if (tipo === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) {
        valores = ['RANGO:' + dv.getCriteriaValues()[0].getA1Notation()];
      } else {
        valores = ['(tipo ' + tipo + ')'];
      }
    } catch (e) {
      valores = ['(no legible)'];
    }
    out.push('COL ' + (c + 1) + ' · ' + header[c] + '  =>  ' + valores.join(' | '));
  }
  Logger.log('\n=== DESPLEGABLES DE LA HOJA OFICIAL ===\n' + out.join('\n'));
  return out.join('\n');
}

/* Comprobación manual del mapeo de columnas. SIMULA: no escribe nada.
 *
 * Antes escribía en las DOS hojas de producción, y eso no se queda ahí: en
 * cuanto alguien pulsa "Sincronizar", la app importa esa fila como paciente
 * real. Pasó de verdad — "CALDERON OTINIANO, ELIZABETH" entró así el 26/08/2026
 * con fechas de cirugía inventadas, y nadie en el servicio sabía quién era.
 *
 * Si alguna vez hace falta escribir de verdad para probar, hágase con un DNI
 * que no exista y bórrese después desde la app (que limpia las dos hojas). */
function test() {
  var p = {
    dni: '70515665', nombre: 'CALDERON OTINIANO, ELIZABETH', edad: 30, sexo: 'Femenino',
    telefono: '968202346', hcl: '12345', diagnostico: 'Endometrioma', cie10: 'N80',
    procedimiento: 'Quistectomía', tipo_seguro: 'SIS', tipo_anestesia: 'RAQUIDEA',
    nivel_cirugia: 'Mayor', doctor: 'DR. SHIMIZU', fecha_captacion: '2026-08-20',
    establecimiento_destino: 'HOSPITAL DISTRITAL LAREDO', codigo_destino: '00005231',
    establecimiento_origen: 'N.A. - Paciente propio / no referido', codigo_origen: '',
    fecha_cita_cardiologia: '2026-08-15', fecha_cita_anestesiologia: '2026-08-16',
    riesgo_qx: true, riesgo_anestesiologico: true, fecha_cirugia: '2026-08-25',
    estado: 'programada', motivo_suspension: null, referencia_hospital: null,
    cie10_secundario: 'D25', diagnostico_secundario: 'Miomatosis uterina',
    codigo_procedimiento: '5A-123', fecha_primera_evaluacion: '2026-08-12',
    aplica_imagenes: 'Sí', fecha_imagenes: '2026-08-13',
    fecha_evaluacion_preoperatoria: '2026-08-18', orden_intervencion: '01',
    laboratorio_completo: true, ekg: true, fecha_examen1: '2026-08-14', fecha_examen2: '2026-08-14'
  };
  Logger.log('SIMULACIÓN — no se ha escrito nada en ninguna hoja.');
  Logger.log('\n=== HOJA ANTIGUA ===\n' + describirValores(buildValuesOld(p)));
  Logger.log('\n=== HOJA OFICIAL ===\n' + describirValores(buildValuesNew(p)));
}

/* Muestra el mapeo columna → valor que se habría escrito. */
function describirValores(v) {
  var out = [];
  for (var k in v) out.push('  ' + k + ' = ' + (v[k] === '' || v[k] == null ? '(vacío)' : v[k]));
  return out.join('\n');
}

/* ============================================================
 * SINCRONIZACIÓN COMPLETA — hojas ⇄ app
 * ============================================================
 * Hasta ahora la app escribía a las hojas, pero lo que se escribía A MANO en
 * las hojas no llegaba a ninguna parte: no existía para el servicio ni para el
 * otro formato. Esto lo cierra en las dos direcciones, sin que nadie tenga que
 * abrir la app.
 *
 * PUESTA EN MARCHA (una sola vez):
 *   1. Configuración del proyecto (⚙) → Propiedades del script → Añadir:
 *        SUPABASE_KEY = <la clave service_role del proyecto>
 *      Va ahí y NO en el código: el código se guarda en el repositorio.
 *   2. Ejecutar `probarSincronizacion` y leer el registro. NO ESCRIBE NADA:
 *      solo dice qué haría. Compruébalo antes de seguir.
 *   3. Cuando el informe cuadre, ejecutar `instalarDisparador` una vez.
 *      A partir de ahí corre solo cada 15 minutos.
 *
 * REGLAS (deliberadas, para no repetir errores que ya costaron caro):
 *
 *   · La hoja NUNCA pisa un dato que la app ya tiene. Solo rellena huecos.
 *     Si los dos tienen valor y no coinciden, no se toca nada: se anota como
 *     discrepancia para que una persona decida.
 *   · La hoja NUNCA cambia el estado de una paciente que ya existe. La
 *     resolución (operada / suspendida / cerrada sin cirugía) la decide una
 *     persona en la app, que es donde queda el historial de quién y cuándo.
 *   · Un cierre no se importa a ciegas: exige datos que la hoja no trae. Una
 *     paciente nueva que en la hoja figura cerrada entra EN TRÁMITE y alguien
 *     la cierra a mano.
 *   · De la hoja OFICIAL solo se importan las filas de GINECOLOGÍA. Esa hoja
 *     la comparten varios servicios del hospital; sin este filtro nos
 *     llevaríamos a las pacientes de Cirugía General.
 *   · El tipo de anestesia no se importa: el catálogo de la hoja agrupa
 *     "Regional/General" en un solo valor y no se puede deshacer sin inventar.
 * ============================================================ */

var SB_URL = 'https://xqphjvppfgwabfruyjae.supabase.co';

function sbKey_() {
  var k = PropertiesService.getScriptProperties().getProperty('SUPABASE_KEY');
  if (!k) throw new Error('Falta SUPABASE_KEY. Ejecuta guardarClaveSupabase una vez (ver arriba del todo).');
  return k;
}

/* ------------------------------------------------------------
 * PUESTA EN MARCHA: guardar la clave sin pelearse con el menú
 * ------------------------------------------------------------
 * En español, "Propiedades del script" se llama "Propiedades de la secuencia
 * de comandos", y en algunas cuentas esa sección ni siquiera aparece. Esta
 * función hace lo mismo desde el código.
 *
 *   1. Pega la clave service_role entre las comillas de abajo.
 *   2. Ejecuta `guardarClaveSupabase` una sola vez.
 *   3. BORRA la clave de esta línea y guarda con Ctrl+S.
 *
 * El paso 3 importa: la clave queda guardada en el proyecto, no hace falta
 * que siga escrita aquí, y aquí es donde cualquiera que abra el editor la ve.
 * ------------------------------------------------------------ */
function guardarClaveSupabase() {
  var CLAVE = '';   // <-- pega la clave aquí, entre las comillas

  if (!CLAVE) {
    Logger.log('Pega la clave en la variable CLAVE (línea de arriba) y vuelve a ejecutar.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('SUPABASE_KEY', CLAVE.trim());
  Logger.log('Clave guardada. ' + comprobarClave());
  Logger.log('AHORA borra la clave de la línea de CLAVE y guarda con Ctrl+S.');
}

/** Dice si la clave está guardada, sin enseñarla entera. */
function comprobarClave() {
  var k = PropertiesService.getScriptProperties().getProperty('SUPABASE_KEY');
  if (!k) return 'NO hay clave guardada todavía.';
  return 'Clave guardada: ' + k.length + ' caracteres, de "' + k.slice(0, 6) + '..." a "...' + k.slice(-4) + '".';
}

function sbFetch_(metodo, path, cuerpo, prefer) {
  var k = sbKey_();
  var opts = {
    method: metodo,
    contentType: 'application/json',
    headers: { apikey: k, Authorization: 'Bearer ' + k },
    muteHttpExceptions: true
  };
  if (prefer) opts.headers['Prefer'] = prefer;
  if (cuerpo) opts.payload = JSON.stringify(cuerpo);
  var r = UrlFetchApp.fetch(SB_URL + '/rest/v1/' + path, opts);
  var code = r.getResponseCode(), txt = r.getContentText();
  if (code < 200 || code >= 300) throw new Error('Supabase ' + code + ': ' + txt);
  return txt ? JSON.parse(txt) : null;
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** Fecha de una celda → 'AAAA-MM-DD'. Acepta lo que escriba una persona a mano:
 *  una fecha de verdad, 25/8/26, 25-08-2026 o 2026-08-25. Si no se entiende,
 *  devuelve null en vez de adivinar. */
function fechaISO_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return null;
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(+m[2]) + '-' + pad2_(+m[3]);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    var d = +m[1], mo = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return y + '-' + pad2_(mo) + '-' + pad2_(d);
  }
  return null;
}

/** Traduce una fila de la hoja a los campos de la app (el inverso de
 *  buildValuesNew/buildValuesOld). Solo campos que se pueden traducir sin
 *  perder ni inventar información. */
function filaAPaciente_(v) {
  var txt = function (k) { var s = String(v[k] === null || v[k] === undefined ? '' : v[k]).trim(); return s || null; };
  var p = {};

  p.dni        = txt('dni');
  p.nombre     = txt('apellidos y nombres completos');
  var edad     = parseInt(String(v['edad'] || '').replace(/\D/g, ''), 10);
  p.edad       = isNaN(edad) ? null : edad;
  p.sexo       = catalogMatch(mapGenero(v['genero']), CAT.genero);
  p.telefono   = txt('celular') ? String(txt('celular')).replace(/\s+/g, '') : null;
  p.tipo_seguro = catalogMatch(v['tipo de seguro'], CAT.seguro);
  p.hcl        = txt('n° historia clinica');
  p.doctor     = txt('cirujano responsable');
  p.especialidad = txt('especialidad quirurgica');

  p.cie10                  = txt('cie-10 principal');
  // El diagnostico 1 de una gestante lo escribe el sistema. Se importa solo
  // cuando la fila NO trae FUR ni eco... pero la hoja no tiene esas columnas,
  // asi que la decision se toma arriba, en compararConApp_: si la paciente ya
  // existe en la app con FUR/eco, su diagnostico no se importa de vuelta.
  p.diagnostico            = txt('diagnostico principal');
  p.cie10_secundario       = txt('cie-10 secundario');
  p.diagnostico_secundario = txt('diagnostico secundario');
  p.cie10_tercero          = txt('cie-10 tercero');
  p.diagnostico_tercero    = txt('diagnostico tercero');

  p.codigo_procedimiento = txt('codigo procedimiento');
  p.procedimiento        = txt('procedimiento quirurgico propuesto');
  p.nivel_cirugia        = mapNivel(v['nivel de cirugia']) || null;
  // tipo_anestesia: a propósito NO se importa (ver cabecera del bloque).

  p.establecimiento_destino = txt('establecimiento quirurgico destino');
  p.codigo_destino          = txt('codigo unico destino');
  p.red_destino             = txt('red/ris destino');
  p.establecimiento_origen  = txt('establecimiento origen que refiere');
  p.codigo_origen           = txt('codigo unico origen');
  p.provincia_origen        = txt('provincia origen');
  p.distrito_origen         = txt('distrito origen');

  p.fecha_primera_evaluacion       = fechaISO_(v['f. primera evaluacion por cirugia']);
  p.aplica_imagenes                = mapImagenes(v['¿aplica diagnostico por imagenes?']) || null;
  p.fecha_imagenes                 = fechaISO_(v['f. diagnostico por imagenes']);
  p.fecha_cita_cardiologia         = fechaISO_(v['f. riesgo quirurgico']);
  p.fecha_cita_anestesiologia      = fechaISO_(v['f. evaluacion anestesica']);
  p.fecha_evaluacion_preoperatoria = fechaISO_(v['f. evaluacion preoperatoria por cirugia']);
  // Solo se importa "No apto". Es el único de los tres que una persona tiene
  // que decidir: "Apto" y "Pendiente" los deduce la app de los dos riesgos.
  // Guardar "Pendiente" como si lo hubiera elegido alguien apaga esa deducción
  // y la paciente se queda en Pendiente aunque luego se completen los riesgos.
  var preop = catalogMatch(v['resultado evaluacion preoperatoria'], CAT.resultadoPreop);
  p.resultado_preop = (preop === 'No apto') ? preop : null;
  p.orden_intervencion             = txt('n° orden de intervencion');
  p.fecha_cirugia                  = fechaISO_(v['fecha programacion quirurgica']);
  p.motivo_espera                  = catalogMatch(v['motivo de espera'], CAT.motivoEspera);
  p.detalle_motivo_espera          = txt('detalle motivo de espera');
  p.observacion                    = txt('observacion');

  // Exámenes prequirúrgicos: la hoja los guarda como "tipo + fecha".
  var t1 = norm(v['tipo examen prequirurgico 1']), t2 = norm(v['tipo examen prequirurgico 2']);
  if (t1.indexOf('laboratorio') >= 0 || t2.indexOf('laboratorio') >= 0) {
    p.laboratorio_completo = true;
    p.fecha_examen1 = fechaISO_(v[t1.indexOf('laboratorio') >= 0 ? 'fecha examen prequirurgico 1' : 'fecha examen prequirurgico 2']);
  }
  if (t1.indexOf('ekg') >= 0 || t2.indexOf('ekg') >= 0) {
    p.ekg = true;
    p.fecha_examen2 = fechaISO_(v[t1.indexOf('ekg') >= 0 ? 'fecha examen prequirurgico 1' : 'fecha examen prequirurgico 2']);
  }
  // "NA" (no aplica): el examen 1 es el laboratorio y el 2 el EKG, que es como
  // los escribe la app. Solo aparece en las hojas de Cirugía General.
  if (t1 === 'na') p.laboratorio_na = true;
  if (t2 === 'na') p.ekg_na = true;
  if (norm(v['f. riesgo quirurgico']) === 'na') p.riesgo_qx_na = true;
  p.tipo_examen3  = txt('tipo examen prequirurgico 3');
  p.fecha_examen3 = fechaISO_(v['fecha examen prequirurgico 3']);

  // "Apto" en la hoja significa que los dos riesgos están evaluados: eso sí se
  // trae, porque son datos y no una deducción.
  if (preop === 'Apto') {
    p.riesgo_qx = true;
    p.riesgo_anestesiologico = true;
  }
  return p;
}

/** Estado con el que entra una paciente NUEVA vista en la hoja. */
function estadoDeFila_(v, campos) {
  var actual = norm(v['estado actual del paciente']);
  // Un cierre no se importa a ciegas: entra en trámite y alguien lo confirma.
  if (actual.indexOf('operad') >= 0 || actual.indexOf('suspendid') >= 0 || actual.indexOf('cerrado sin') >= 0) return 'en_tramite';
  if (norm(v['estado de programacion']) === 'programado' && campos.fecha_cirugia) return 'programada';
  if (catalogMatch(v['resultado evaluacion preoperatoria'], CAT.resultadoPreop) === 'Apto') return 'apta_para_sala';
  return 'en_tramite';
}

/** Estado (y lo que la base exige con él) de una fila NUEVA de un servicio con
 *  importarTalCual. La base pide un motivo para suspendida y para cerrada sin
 *  cirugía, y el formato de 47 columnas no lo trae: va "Otro motivo" y una
 *  persona lo precisa en la app. */
function estadoTalCual_(v, campos) {
  var a = norm(v['estado actual del paciente']);
  if (a.indexOf('operad') >= 0) return { estado: 'operada' };
  if (a.indexOf('suspendid') >= 0) return { estado: 'suspendida', motivo_suspension: 'Otro motivo' };
  if (a.indexOf('cerrado sin') >= 0) return { estado: 'referida', motivo_cierre: 'Otro motivo' };
  return { estado: estadoDeFila_(v, campos) };
}

/** Tipo de anestesia tal como está en la hoja: "Local" es el LOCAL de la app;
 *  "Regional/General" queda así hasta que alguien elija la exacta en la app. */
function anestesiaDeHoja_(v) {
  var t = String(v['tipo de anestesia'] || '').trim();
  if (!t) return null;
  return norm(t) === 'local' ? 'LOCAL' : t;
}

/* Sello de versión del bloque de sincronización, para saber qué hay desplegado. */
function versionSync() {
  return VERSION;
}

/** Lee el bloque GERESA de una hoja. Devuelve una entrada por paciente. */
function leerHoja_(ssId, sheetName, especialidadFiltro) {
  var sheet = SpreadsheetApp.openById(ssId).getSheetByName(sheetName);
  if (!sheet) throw new Error('No existe la pestaña "' + sheetName + '".');
  var headerRow = findHeaderRow(sheet);
  if (!headerRow) throw new Error('No se encontró el encabezado "ID registro" en "' + sheetName + '".');
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow <= headerRow) return [];

  var colMap = buildColumnMap(sheet, headerRow);
  var datos = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, lastCol).getValues();
  var out = [];
  for (var i = 0; i < datos.length; i++) {
    var v = {};
    for (var key in colMap) v[key] = datos[i][colMap[key] - 1];
    var dni = String(v['dni'] || '').trim();
    if (!dni || !String(v['apellidos y nombres completos'] || '').trim()) continue;
    if (especialidadFiltro && norm(v['especialidad quirurgica']) !== norm(especialidadFiltro)) continue;
    var idReg = parseInt(String(v['id registro'] || '').trim(), 10);
    out.push({
      dni: dni,
      fila: headerRow + 1 + i,
      crudo: v,
      campos: filaAPaciente_(v),
      idRegistro: isNaN(idReg) ? null : idReg
    });
  }
  return out;
}

/** Servicios cuyas hojas se leen hacia la app: los activos de la tabla
 *  `servicios`. Si no se puede leer, solo ginecología — lo de siempre. */
function serviciosActivos_() {
  try {
    var filas = sbFetch_('get', 'servicios?select=clave&activo=eq.true&order=orden');
    var claves = (filas || []).map(function (x) { return x.clave; })
      .filter(function (k) { return !!SERVICIOS_HOJAS[k]; });
    if (claves.length) return claves;
  } catch (e) {}
  return ['ginecologia'];
}

/** Campos que la hoja llenaría y en la app están vacíos, y los que chocan. */
function compararConApp_(app, campos) {
  var patch = {}, choques = [];
  // Si la paciente es gestante, su diagnóstico 1 lo escribe el sistema: lo que
  // hay en la hoja es ese cálculo, y volver a importarlo lo congelaría dentro
  // de la app. Se ignora, sin marcarlo siquiera como discrepancia.
  var esGestante = !!furEfectiva_(app);
  for (var k in campos) {
    var nuevo = campos[k];
    if (nuevo === null || nuevo === undefined || nuevo === '') continue;
    if (k === 'dni') continue;                       // es la clave, no se toca
    if (k === 'diagnostico' && esGestante) continue;
    var actual = app[k];
    if (actual === null || actual === undefined || actual === '' || actual === false) { patch[k] = nuevo; continue; }
    if (String(actual) !== String(nuevo)) choques.push(k + ': app «' + actual + '» != hoja «' + nuevo + '»');
  }
  return { patch: patch, choques: choques };
}

/** El trabajo de verdad. simular=true no escribe nada. */
function reconciliar_(simular) {
  var props = PropertiesService.getScriptProperties();
  var t0 = new Date();
  var r = { altas: [], rellenos: [], discrepancias: [], empujadas: 0, errores: [], simulado: !!simular };

  var pacientes = sbFetch_('get', 'pacientes?select=*');

  // ---- HOJAS -> APP, servicio por servicio -------------------------------
  // Cada hoja se cruza SOLO con los pacientes de su servicio (el DNI se repite
  // entre servicios si una persona espera dos cirugías distintas) y lo que se
  // importa entra con ese servicio. Solo servicios activos en la tabla
  // `servicios`: encender uno (Fase 5) es lo que trae sus filas a la app.
  serviciosActivos_().forEach(function (serv) {
    var cfg = SERVICIOS_HOJAS[serv];
    if (!cfg) return;
    var porDni = {}, idsUsados = {};
    pacientes.forEach(function (p) {
      if (servicioDe_(p) !== serv) return;
      porDni[String(p.dni || '').trim()] = p;
      if (p.id_registro !== null && p.id_registro !== undefined) idsUsados[p.id_registro] = true;
    });

    var vistos = {};
    cfg.hojas.forEach(function (h) {
      var filas;
      try { filas = leerHoja_(h.ssId, h.name, h.filtrarEspecialidad ? cfg.especialidad : null); }
      catch (e) { r.errores.push(h.etiqueta + ': ' + e.message); return; }

      filas.forEach(function (f) {
        if (vistos[f.dni]) return;         // ya tratada desde la otra hoja
        vistos[f.dni] = true;
        var app = porDni[f.dni];

        if (!app) {
          var fila = {};
          for (var k in f.campos) if (f.campos[k] !== null && f.campos[k] !== undefined) fila[k] = f.campos[k];
          if (cfg.importarTalCual) {
            var et = estadoTalCual_(f.crudo, f.campos);
            for (var ek in et) fila[ek] = et[ek];
            var an = anestesiaDeHoja_(f.crudo);
            if (an) fila.tipo_anestesia = an;
          } else {
            fila.estado = estadoDeFila_(f.crudo, f.campos);
          }
          fila.turno  = (fila.estado === 'programada') ? 'manana' : null;
          fila.origen = 'hoja';
          fila.servicio = serv;
          if (f.idRegistro && !idsUsados[f.idRegistro]) { fila.id_registro = f.idRegistro; idsUsados[f.idRegistro] = true; }
          r.altas.push((fila.nombre || f.dni) + ' · ' + h.etiqueta + ' fila ' + f.fila + ' -> ' + fila.estado);
          if (!simular) {
            try { sbFetch_('post', 'pacientes', fila, 'return=minimal'); }
            catch (e) { r.errores.push('alta ' + (fila.nombre || f.dni) + ': ' + e.message); }
          }
          return;
        }

        var cmp = compararConApp_(app, f.campos);
        // El estado y el turno los manda la app: la hoja no los toca nunca.
        delete cmp.patch.estado; delete cmp.patch.turno;
        var claves = [];
        for (var c in cmp.patch) claves.push(c);
        if (claves.length) {
          r.rellenos.push((app.nombre || f.dni) + ' · ' + h.etiqueta + ' -> ' + claves.join(', '));
          if (!simular) {
            try { sbFetch_('patch', 'pacientes?id=eq.' + app.id, cmp.patch, 'return=minimal'); }
            catch (e) { r.errores.push('relleno ' + (app.nombre || f.dni) + ': ' + e.message); }
          }
        }
        if (cmp.choques.length) r.discrepancias.push((app.nombre || f.dni) + ' · ' + h.etiqueta + ' -> ' + cmp.choques.join(' | '));
      });
    });
  });

  // ---- APP -> LAS HOJAS DE CADA SERVICIO --------------------------------
  // Solo lo que cambió desde la última pasada, incluido lo que se acaba de
  // importar arriba. Así lo escrito a mano en una hoja acaba en la otra.
  var desde = props.getProperty('ULTIMA_SYNC') || '1970-01-01T00:00:00Z';
  var cambiadas = sbFetch_('get', 'pacientes?select=*&updated_at=gt.' + encodeURIComponent(desde));

  // La edad gestacional avanza aunque la ficha no se toque, así que empujar
  // "solo lo que cambió" dejaría el Excel congelado en las semanas del día que
  // se registró. Una vez al día se refrescan las gestantes que siguen en lista.
  var hoyEG = hoyStr_();
  if (props.getProperty('ULTIMO_DIA_EG') !== hoyEG) {
    var yaVan = {};
    cambiadas.forEach(function (p) { yaVan[p.id] = true; });
    var gestantes = 0;
    pacientes.forEach(function (p) {
      if (yaVan[p.id] || esTerminal_(p.estado) || !furEfectiva_(p)) return;
      cambiadas.push(p);
      gestantes++;
    });
    if (gestantes) r.rellenos.push(gestantes + ' gestante(s): edad gestacional del día al Excel');
    if (!simular) props.setProperty('ULTIMO_DIA_EG', hoyEG);
  }
  cambiadas.forEach(function (p) {
    if (simular) { r.empujadas++; return; }
    // Cada paciente, a las hojas de SU servicio (mismo camino que usa la app).
    var res = escribirPaciente_(p);
    if (res.ok) { r.empujadas++; return; }
    var err = res.error
      || (res.antiguo && !res.antiguo.ok && res.antiguo.error)
      || (res.oficial && !res.oficial.ok && res.oficial.error) || 'error';
    r.errores.push('empujar ' + p.nombre + ': ' + err);
  });

  if (!simular) props.setProperty('ULTIMA_SYNC', t0.toISOString());
  Logger.log(informe_(r));
  return r;
}

function informe_(r) {
  var L = [];
  L.push(r.simulado ? '=== SIMULACIÓN (no se escribió nada) ===' : '=== SINCRONIZACIÓN ===');
  L.push('Altas nuevas desde las hojas: ' + r.altas.length);
  r.altas.forEach(function (x) { L.push('   + ' + x); });
  L.push('Huecos rellenados en la app: ' + r.rellenos.length);
  r.rellenos.forEach(function (x) { L.push('   ~ ' + x); });
  L.push('Fichas empujadas a las dos hojas: ' + r.empujadas);
  L.push('Discrepancias (NO se tocó nada, decide una persona): ' + r.discrepancias.length);
  r.discrepancias.forEach(function (x) { L.push('   ! ' + x); });
  if (r.errores.length) {
    L.push('ERRORES: ' + r.errores.length);
    r.errores.forEach(function (x) { L.push('   x ' + x); });
  }
  return L.join('\n');
}

/** Dice qué haría, sin escribir NADA. Ejecútala antes de instalar nada. */
function probarSincronizacion() { return reconciliar_(true); }

/** La que corre sola cada 15 minutos. */
function sincronizarTodo() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { Logger.log('Otra pasada sigue en marcha; esta se salta.'); return; }
  try { return reconciliar_(false); }
  finally { lock.releaseLock(); }
}

/** Ejecutar UNA vez para dejarlo automático. Vuelve a ejecutarse sin problema:
 *  borra el disparador anterior antes de crear el nuevo. */
function instalarDisparador() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizarTodo') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sincronizarTodo').timeBased().everyMinutes(15).create();
  Logger.log('Listo: sincronizarTodo corre cada 15 minutos.');
}

/** Para apagarlo sin borrar el código. */
function quitarDisparador() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizarTodo') { ScriptApp.deleteTrigger(t); n++; }
  });
  Logger.log('Disparadores retirados: ' + n);
}

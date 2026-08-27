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
* CÓMO INSTALAR:
*   1. Abre la hoja ANTIGUA de Google (la del reporte GERESA que ya usas).
*   2. Extensiones → Apps Script.
*   3. Borra el contenido y pega TODO este archivo.
*   4. Arriba edita las constantes (SS_ID, SS_ID_2, SHEET_NAME,
*      SHEET_NAME_2 y TOKEN deben coincidir con los de la app).
*   5. Guarda (Ctrl+S).
*   6. Desplegar → Nueva implementación → tipo "Aplicación web".
*        - Ejecutar como: Yo
*        - Quién tiene acceso: Cualquier persona
*      ⚠️ Si el proyecto ya está desplegado, usa "Administrar implementaciones"
*         → ✏️ Editar → "Nueva versión" (NO crees un proyecto nuevo, así la
*         URL /exec de la app NO cambia).
*   7. La URL "/exec" es la que usa la app (QX_SHEET_URL de index.html).
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

/* Sello del código desplegado. Viaja en TODA respuesta, incluso en la de token
   inválido (que no toca las hojas), así que un ping basta para saber qué
   versión está viva y si el "Nueva versión" del despliegue realmente tomó.
   Subir esta fecha cada vez que se cambie este archivo. */
var VERSION = '2026-08-27-todo-capturado';

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
      provincia: provincia || CONSTANTES.provincia,
      distrito:  distrito  || CONSTANTES.distrito,
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
  v['genero']                            = mapGenero(p.sexo);
  v['celular']                           = String(p.telefono || '');
  v['tipo de seguro']                    = mapSeguro(p.tipo_seguro);
  v['n° historia clinica']               = p.hcl;
  v['especialidad quirurgica']           = p.especialidad || CONSTANTES.especialidad;
  v['cirujano responsable']              = p.doctor;
  v['cie-10 principal']                  = p.cie10;
  v['diagnostico principal']             = p.diagnostico;
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
  v['genero']                            = mapGeneroCorto(p.sexo);
  v['celular']                           = String(p.telefono || '');
  v['tipo de seguro']                    = mapSeguro(p.tipo_seguro);
  v['n° historia clinica']               = p.hcl;
  v['especialidad quirurgica']           = p.especialidad || CONSTANTES.especialidad;
  v['cirujano responsable']              = p.doctor;
  v['cie-10 principal']                  = p.cie10;
  v['diagnostico principal']             = p.diagnostico;
  v['procedimiento quirurgico propuesto'] = p.procedimiento;
  v['nivel de cirugia']                  = mapNivel(p.nivel_cirugia);
  v['tipo de anestesia']                 = mapAnestesia(p.tipo_anestesia);
  v['f. riesgo quirurgico']              = fmtFecha(p.fecha_cita_cardiologia);
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

  // 4) "ID registro" solo para filas nuevas.
  if (esNuevo) {
    var nextId = 1;
    if (idCol) {
      var idData = sheet.getRange(headerRow + 1, idCol, lastRow - headerRow, 1).getValues();
      for (var m = 0; m < idData.length; m++) {
        var tieneDato = String(nombreData[m][0]).trim() !== '' || String(dniData[m][0]).trim() !== '';
        if (!tieneDato) continue;
        var n = parseInt(String(idData[m][0]), 10);
        if (!isNaN(n) && n >= nextId) nextId = n + 1;
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

    // Borrado explícito (eliminar paciente en la app): borra por DNI en ambas hojas.
    if (body.accion === 'borrar') {
      if (!body.dni) return json({ ok: false, error: 'falta dni' });
      var d1 = { ok: false, error: '' }, d2 = { ok: false, error: '' };
      try { d1 = borrarDeHoja(SS_ID, SHEET_NAME, body.dni); }
      catch (err) { d1 = { ok: false, error: String(err) }; }
      try { d2 = borrarDeHoja(SS_ID_2, SHEET_NAME_2, body.dni); }
      catch (err) { d2 = { ok: false, error: String(err) }; }
      return json({ ok: (d1.ok && d2.ok), antiguo: d1, oficial: d2 });
    }

    var p = body.paciente || {};
    if (!p.dni) return json({ ok: false, error: 'falta dni' });

    var r1 = { ok: false, error: '' }, r2 = { ok: false, error: '' };
    try {
      var u1 = upsert(SS_ID, SHEET_NAME, buildValuesOld(p), p);
      r1 = { ok: true, row: u1.row, rechazadas: u1.rechazadas };
    } catch (err) { r1 = { ok: false, error: String(err) }; }
    try {
      var u2 = upsert(SS_ID_2, SHEET_NAME_2, buildValuesNew(p), p);
      r2 = { ok: true, row: u2.row, rechazadas: u2.rechazadas };
    } catch (err) { r2 = { ok: false, error: String(err) }; }

    return json({ ok: (r1.ok && r2.ok), antiguo: r1, oficial: r2 });
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

// Para probar manualmente: test() escribe en AMBAS hojas.
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
  var r1 = upsert(SS_ID, SHEET_NAME, buildValuesOld(p), p);
  var r2 = upsert(SS_ID_2, SHEET_NAME_2, buildValuesNew(p), p);
  Logger.log('Antigua: fila ' + r1 + ' · Oficial: fila ' + r2);
}

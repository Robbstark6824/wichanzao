/**
 * ============================================================
 * SINCronización programación quirúrgica → Google Sheet (GERESA)
 * Proyecto: Servicio de Ginecología - Hospital de Laredo
 * ============================================================
 *
 * CÓMO INSTALAR:
 *   1. Abre tu hoja de Google (la del reporte GERESA).
 *   2. Extensiones → Apps Script.
 *   3. Borra el contenido y pega TODO este archivo.
 *   4. Arriba edita las constantes (SS_ID ya está, TOKEN debe coincidir
 *      con el de la app, SHEET_NAME es la pestaña exacta y revisa los
 *      datos del hospital).
 *   5. Guarda (Ctrl+S).
 *   6. Desplegar → Nueva implementación → tipo "Aplicación web".
 *        - Ejecutar como: Yo
 *        - Quién tiene acceso: Cualquier persona
 *   7. Copia la URL que te da (".../exec") y pégala en la app
 *      (variable QX_SHEET_URL de index.html).
 *
 * IMPORTANTE: los valores de CONSTANTES son los que GERESA te pide fijos;
 * ajústalos aquí una sola vez si cambian.
 * ============================================================
 */

var SS_ID = '1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU';

// Nombre EXACTO de la pestaña donde se escribe el reporte GERESA.
// (blindado: si reordenas pestañas, esto no se rompe).
var SHEET_NAME = 'HOSPITAL LAREDO';

// Debe ser IGUAL al token que pongas en la app (index.html → QX_SHEET_TOKEN).
var TOKEN = 'WZ-GERESA-2026-Kx7mQ2p9';

var CONSTANTES = {
  establecimientoDestino: 'HOSPITAL DISTRITAL DE LAREDO',
  codigoDestino:          '5231',
  red:                    'TRUJILLO',
  establecimientoOrigen:  'HOSPITAL DISTRITAL DE LAREDO',
  codigoOrigen:           '5231',
  provincia:              'TRUJILLO',
  distrito:               'LAREDO',
  especialidad:           'GINECOLOGIA'
};

var ESTADO_MAP = {
  en_tramite:      'EN TRÁMITE',
  apta_para_sala:  'APTA PARA SALA',
  programada:      'PROGRAMADO',
  hospitalizada:   'HOSPITALIZADA',
  operada:         'OPERADO',
  suspendida:      'SUSPENDIDO',
  referida:        'REFERIDO'
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
  return s; // ya está en otro formato, se deja igual
}

function mapSexo(s) {
  var n = norm(s);
  if (n === 'femenino' || n === 'f' || n === 'mujer') return 'F';
  if (n === 'masculino' || n === 'm' || n === 'hombre') return 'M';
  return s || '';
}

function resultadoPreop(p) {
  if (p.riesgo_qx === true && p.riesgo_anestesiologico === true) return 'APTO';
  if (p.riesgo_qx === false || p.riesgo_anestesiologico === false) return 'NO APTO';
  return '';
}

function motivoEspera(p) {
  if (p.estado === 'suspendida') return { motivo: 'SUSPENDIDO', detalle: p.motivo_suspension || '' };
  if (p.estado === 'referida')   return { motivo: 'REFERIDO',   detalle: p.referencia_hospital || '' };
  if (p.estado === 'operada')    return { motivo: '',           detalle: '' };
  return { motivo: 'En lista de espera', detalle: '' };
}

/** Mapa: encabezado (normalizado) → valor para este paciente. */
function buildValues(p) {
  var mo = motivoEspera(p);
  var v = {};
  v['id registro']                       = ''; // se calcula al insertar
  v['establecimiento quirurgico destino'] = CONSTANTES.establecimientoDestino;
  v['codigo unico destino']              = CONSTANTES.codigoDestino;
  v['red/ris destino']                   = CONSTANTES.red;
  v['establecimiento origen que refiere'] = CONSTANTES.establecimientoOrigen;
  v['codigo unico origen']               = CONSTANTES.codigoOrigen;
  v['provincia origen']                  = CONSTANTES.provincia;
  v['distrito origen']                   = CONSTANTES.distrito;
  v['fecha referencia aceptada']         = fmtFecha(p.fecha_captacion);
  v['dni']                               = p.dni;
  v['apellidos y nombres completos']     = p.nombre;
  v['edad']                              = p.edad;
  v['genero']                            = mapSexo(p.sexo);
  v['celular']                           = p.telefono;
  v['tipo de seguro']                    = p.tipo_seguro || '';
  v['n° historia clinica']               = p.hcl;
  v['especialidad quirurgica']           = CONSTANTES.especialidad;
  v['cirujano responsable']              = p.doctor;
  v['cie-10 principal']                  = p.cie10;
  v['diagnostico principal']             = p.diagnostico;
  v['procedimiento quirurgico propuesto'] = p.procedimiento;
  v['nivel de cirugia']                  = p.nivel_cirugia;
  v['tipo de anestesia']                 = p.tipo_anestesia;
  v['f. riesgo quirurgico']              = fmtFecha(p.fecha_cita_cardiologia);
  v['f. evaluacion anestesica']          = fmtFecha(p.fecha_cita_anestesiologia);
  v['resultado evaluacion preoperatoria'] = resultadoPreop(p);
  v['estado de programacion']            = ESTADO_MAP[p.estado] || '';
  v['fecha programacion quirurgica']     = fmtFecha(p.fecha_cirugia);
  v['motivo de espera']                  = mo.motivo;
  v['detalle motivo de espera']          = mo.detalle;
  v['estado actual del paciente']        = ESTADO_MAP[p.estado] || '';

  // --- Campos GERESA adicionales (v7) ---
  v['cie-10 secundario']                 = p.cie10_secundario || '';
  v['diagnostico secundario']            = p.diagnostico_secundario || '';
  v['cie-10 tercero']                    = p.cie10_tercero || '';
  v['diagnostico tercero']               = p.diagnostico_tercero || '';
  v['codigo procedimiento']              = p.codigo_procedimiento || '';
  v['f. primera evaluacion por cirugia'] = fmtFecha(p.fecha_primera_evaluacion);
  v['f. evaluacion preoperatoria por cirugia'] = fmtFecha(p.fecha_evaluacion_preoperatoria);
  v['n° orden de intervencion']          = p.orden_intervencion || '';

  // Diagnóstico por imágenes (Sí/No → SÍ/NO)
  var ai = norm(p.aplica_imagenes);
  v['¿aplica diagnostico por imagenes?'] = (ai === 'si' ? 'SÍ' : ai === 'no' ? 'NO' : '');
  v['f. diagnostico por imagenes']       = fmtFecha(p.fecha_imagenes);

  // Exámenes prequirúrgicos (derivados de Fase 2)
  var t1 = '', f1 = '', t2 = '', f2 = '';
  if (p.laboratorio_completo === true) { t1 = 'LABORATORIO'; f1 = fmtFecha(p.fecha_fase2); }
  if (p.ekg === true) { t2 = 'EKG'; f2 = fmtFecha(p.fecha_fase2); }
  v['tipo examen prequirurgico 1']  = t1;
  v['fecha examen prequirurgico 1'] = f1;
  v['tipo examen prequirurgico 2']  = t2;
  v['fecha examen prequirurgico 2'] = f2;
  v['tipo examen prequirurgico 3']  = '';
  v['fecha examen prequirurgico 3'] = '';

  return v;
}

/** Localiza la fila (1-based) del encabezado "FILA AZUL" (contiene "ID registro"). */
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

/** Construye { encabezadoNormalizado: numeroColumna } a partir de la fila de encabezado. */
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

function upsert(p) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No se encontró la pestaña "' + SHEET_NAME + '". Verifica el nombre en la hoja.');
  var headerRow = findHeaderRow(sheet);
  if (!headerRow) throw new Error('No se encontró el bloque "FILA AZUL" (encabezado "ID registro").');

  var colMap = buildColumnMap(sheet, headerRow);
  var values = buildValues(p);

  var dniCol = colMap['dni'];
  var nombreCol = colMap['apellidos y nombres completos'];
  var idCol = colMap['id registro'];
  var lastRow = sheet.getLastRow();

  // Lee DNI y nombre del bloque completo de una vez.
  var dniData = sheet.getRange(headerRow + 1, dniCol, lastRow - headerRow, 1).getValues();
  var nombreData = sheet.getRange(headerRow + 1, nombreCol, lastRow - headerRow, 1).getValues();

  var targetRow = 0;
  var esNuevo = true;

  // 1) Busca la fila existente por DNI (upsert).
  var dniBuscado = String(p.dni || '').trim();
  if (dniBuscado) {
    for (var i = 0; i < dniData.length; i++) {
      if (String(dniData[i][0]).trim() === dniBuscado) { targetRow = headerRow + 1 + i; esNuevo = false; break; }
    }
  }

  // 2) Si no la encontró por DNI, busca por nombre (filas a las que aún no se
  //    les llenó el DNI en la hoja). Así "modificar" no crea una fila duplicada.
  if (!targetRow && norm(p.nombre)) {
    var nomBuscado = norm(p.nombre);
    for (var j = 0; j < nombreData.length; j++) {
      if (norm(nombreData[j][0]) === nomBuscado) { targetRow = headerRow + 1 + j; esNuevo = false; break; }
    }
  }

  // 3) Si sigue sin encontrar, usa la PRIMERA fila vacía del bloque (sin nombre
  //    y sin DNI), en vez de pegar al final absoluto de la hoja (la plantilla
  //    tiene filas pre-numeradas vacías más abajo).
  if (!targetRow) {
    for (var k = 0; k < nombreData.length; k++) {
      if (String(nombreData[k][0]).trim() === '' && String(dniData[k][0]).trim() === '') {
        targetRow = headerRow + 1 + k; break;
      }
    }
    if (!targetRow) targetRow = lastRow + 1; // fallback: no hay fila vacía
  }

  // 4) "ID registro" solo para filas nuevas: siguiente (máx. ID con datos + 1),
  //    ignorando las filas vacías pre-numeradas de la plantilla.
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
    }
    values['id registro'] = nextId;
  }

  // 5) Escribe cada valor en su columna (respeta el orden real del encabezado).
  for (var key in values) {
    var col = colMap[key];
    if (col) sheet.getRange(targetRow, col).setValue(values[key]);
  }
  return targetRow;
}

function json(obj, code) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.token !== TOKEN) return json({ ok: false, error: 'token no válido' });
    var p = body.paciente || {};
    if (!p.dni) return json({ ok: false, error: 'falta dni' });
    var row = upsert(p);
    return json({ ok: true, row: row });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// Para probar el script manualmente desde el editor (Ejecutar → test).
function test() {
  var p = {
    dni: '70515665', nombre: 'CALDERON OTINIANO, ELIZABETH', edad: 30, sexo: 'Femenino',
    telefono: '968202346', hcl: '12345', diagnostico: 'Endometrioma', cie10: 'N80',
    procedimiento: 'Quistectomía', tipo_seguro: 'SIS', tipo_anestesia: 'Regional',
    nivel_cirugia: 'Mayor', doctor: 'DR. SHIMIZU', fecha_captacion: '2026-08-20',
    fecha_cita_cardiologia: '2026-08-15', fecha_cita_anestesiologia: '2026-08-16',
    riesgo_qx: true, riesgo_anestesiologico: true, fecha_cirugia: '2026-08-25',
    estado: 'programada', motivo_suspension: null, referencia_hospital: null,
    cie10_secundario: 'D25', diagnostico_secundario: 'Miomatosis uterina',
    cie10_tercero: null, diagnostico_tercero: null, codigo_procedimiento: '5A-123',
    fecha_primera_evaluacion: '2026-08-12', aplica_imagenes: 'Sí',
    fecha_imagenes: '2026-08-13', fecha_evaluacion_preoperatoria: '2026-08-18',
    orden_intervencion: '01', laboratorio_completo: true, ekg: true, fecha_fase2: '2026-08-14'
  };
  var row = upsert(p);
  Logger.log('Fila escrita: ' + row);
}

// ============================================================
// pull-geresa.mjs
// "JALADO": trae los cambios manuales de la hoja GERESA (bloque AZUL)
// hacia la app (Supabase). NO borra nada.
//   - Suma pacientes nuevos que aparezcan en la hoja.
//   - Actualiza los existentes por DNI.
//   - El estado SOLO AVANZA (nunca retrocede), para no pisar
//     cirugías ya hechas o suspensiones en la app.
//   - Las filas SIN DNI se omiten (se avisan), porque no se pueden
//     emparejar de forma segura.
// Uso:  node tools/pull-geresa.mjs         (jalado real)
//       node tools/pull-geresa.mjs --dry   (solo muestra qué haría)
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry');

// --- credenciales desde .env ---
const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const URL_BASE = env.SUPABASE_URL || 'https://xqphjvppfgwabfruyjae.supabase.co';
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const SS_CSV = 'https://docs.google.com/spreadsheets/d/1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU/export?format=csv&gid=0';

// Turno por defecto cuando la hoja manda a "programada" y la app aún no tiene turno.
const TURNO_DEFAULT = 'manana';

// Índices de columna (0-based) del formato GERESA "FILA AZUL" (47 columnas).
const IDX = {
  fecha_captacion: 8,
  dni: 9,
  nombre: 10,
  edad: 11,
  sexo: 12,
  telefono: 13,
  tipo_seguro: 14,
  hcl: 15,
  doctor: 17,
  cie10: 18,
  diagnostico: 19,
  cie10_secundario: 20,
  diagnostico_secundario: 21,
  cie10_tercero: 22,
  diagnostico_tercero: 23,
  codigo_procedimiento: 24,
  procedimiento: 25,
  nivel_cirugia: 26,
  tipo_anestesia: 27,
  fecha_primera_evaluacion: 28,
  texam1: 29,
  fexam1: 30,
  texam2: 31,
  fexam2: 32,
  aplica_imagenes: 35,
  fecha_imagenes: 36,
  fecha_cita_cardiologia: 37,
  fecha_cita_anestesiologia: 38,
  fecha_evaluacion_preoperatoria: 39,
  resultado_preop: 40,
  orden_intervencion: 41,
  estado: 42,          // Estado de programación
  fecha_cirugia: 43,
  estado_actual: 46,   // Estado actual del paciente (prioridad para Operado/Hospitalizada)
};

// ---------- helpers ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseDate(s) {
  if (!s) return null;
  s = String(s).trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  let d = +m[1], mo = +m[2], y = +m[3];
  if (y < 100) y += 2000;
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function normalizeCie10(code) {
  if (!code) return null;
  let c = String(code).trim().toUpperCase();
  c = c.replace(/^DO/, 'D0');
  if (/^[A-Z]\d{3}$/.test(c)) c = c[0] + c[1] + c[2] + '.' + c[3];
  return c;
}

function cleanPhone(s) {
  if (!s) return null;
  return s.split('//')[0].trim().replace(/\s+/g, '') || null;
}

function mapSexo(s) {
  const v = String(s || '').trim().toUpperCase();
  if (v === 'F' || v === 'FEMENINO' || v === 'MUJER') return 'Femenino';
  if (v === 'M' || v === 'MASCULINO' || v === 'HOMBRE') return 'Masculino';
  return null;
}

// Estado según la hoja: prioriza "Estado actual" (Operado/Hospitalizada) y
// luego "Estado de programación".
function sheetEstado(row) {
  const actual = String(row[IDX.estado_actual] || '').trim().toUpperCase();
  if (actual.includes('OPERAD')) return 'operada';
  if (actual.includes('HOSPITALIZAD')) return 'hospitalizada';
  const prog = String(row[IDX.estado] || '').trim().toUpperCase();
  if (prog === 'PROGRAMADO' || prog === 'PROGRAMADA') return 'programada';
  if (prog === 'PENDIENTE DE FECHA') return 'apta_para_sala';
  return 'en_tramite';
}

function mapImagenes(s) {
  const v = String(s || '').trim().toLowerCase();
  if (v.startsWith('s')) return 'Sí';
  if (v.startsWith('n')) return 'No';
  return null;
}

// Orden de avance del pipeline. El jalado nunca retrocede el estado.
function estadoRank(e) {
  if (e === 'en_tramite') return 0;
  if (e === 'apta_para_sala') return 1;
  if (e === 'programada') return 2;
  if (e === 'hospitalizada') return 3;
  if (e === 'operada') return 4;
  if (e === 'suspendida' || e === 'referida') return 5;
  return -1;
}

// ---------- leer hoja ----------
const csvText = await (await fetch(SS_CSV)).text();
const rows = parseCSV(csvText);
const headerIdx = rows.findIndex(r => String(r[0] || '').trim().toLowerCase() === 'id registro');
if (headerIdx < 0) { console.error('No se encontró el encabezado "ID registro".'); process.exit(1); }
const header = rows[headerIdx].map(c => String(c || '').trim());
const expect = { 9: 'DNI', 10: 'Apellidos y nombres completos', 42: 'Estado de programación', 46: 'Estado actual del paciente' };
for (const [i, name] of Object.entries(expect)) {
  if (header[+i] !== name) {
    console.error(`⚠️  Columna ${i} esperada "${name}" pero es "${header[+i]}". Verificá el formato.`);
    process.exit(1);
  }
}

// ---------- construir pacientes desde la hoja ----------
const sheetPacientes = [];
const omitidos = [];
for (let r = headerIdx + 1; r < rows.length; r++) {
  const row = rows[r];
  const nombre = String(row[IDX.nombre] || '').trim();
  if (!nombre) continue; // fila vacía
  const dni = String(row[IDX.dni] || '').trim();
  if (!dni) { omitidos.push(nombre); continue; } // sin DNI → no se puede emparejar

  const t1 = String(row[IDX.texam1] || '').toLowerCase();
  const t2 = String(row[IDX.texam2] || '').toLowerCase();
  const laboratorio = t1.includes('laboratorio') || t2.includes('laboratorio');
  const ekg = t1.includes('ekg') || t2.includes('ekg');
  const resultado = String(row[IDX.resultado_preop] || '').trim().toUpperCase();
  let riesgo_qx = false, riesgo_anestesiologico = false;
  if (resultado === 'APTO') { riesgo_qx = true; riesgo_anestesiologico = true; }

  sheetPacientes.push({
    dni,
    nombre,
    edad: (row[IDX.edad] && String(row[IDX.edad]).trim()) ? parseInt(String(row[IDX.edad]).trim(), 10) : null,
    sexo: mapSexo(row[IDX.sexo]),
    telefono: cleanPhone(row[IDX.telefono]),
    tipo_seguro: String(row[IDX.tipo_seguro] || '').trim() || null,
    hcl: String(row[IDX.hcl] || '').trim() || null,
    doctor: String(row[IDX.doctor] || '').trim() || null,
    cie10: normalizeCie10(row[IDX.cie10]),
    diagnostico: String(row[IDX.diagnostico] || '').trim() || null,
    cie10_secundario: normalizeCie10(row[IDX.cie10_secundario]),
    diagnostico_secundario: String(row[IDX.diagnostico_secundario] || '').trim() || null,
    cie10_tercero: normalizeCie10(row[IDX.cie10_tercero]),
    diagnostico_tercero: String(row[IDX.diagnostico_tercero] || '').trim() || null,
    codigo_procedimiento: String(row[IDX.codigo_procedimiento] || '').trim() || null,
    procedimiento: String(row[IDX.procedimiento] || '').trim() || null,
    nivel_cirugia: String(row[IDX.nivel_cirugia] || '').trim() || null,
    tipo_anestesia: String(row[IDX.tipo_anestesia] || '').trim() || null,
    fecha_primera_evaluacion: parseDate(row[IDX.fecha_primera_evaluacion]),
    aplica_imagenes: mapImagenes(row[IDX.aplica_imagenes]),
    fecha_imagenes: parseDate(row[IDX.fecha_imagenes]),
    fecha_cita_cardiologia: parseDate(row[IDX.fecha_cita_cardiologia]),
    fecha_cita_anestesiologia: parseDate(row[IDX.fecha_cita_anestesiologia]),
    fecha_evaluacion_preoperatoria: parseDate(row[IDX.fecha_evaluacion_preoperatoria]),
    orden_intervencion: String(row[IDX.orden_intervencion] || '').trim() || null,
    _estado_sheet: sheetEstado(row),
    fecha_cirugia: parseDate(row[IDX.fecha_cirugia]),
    fecha_captacion: parseDate(row[IDX.fecha_captacion]),
    laboratorio_completo: laboratorio,
    ekg,
    riesgo_qx,
    riesgo_anestesiologico,
    fecha_fase2: (laboratorio || ekg) ? (parseDate(row[IDX.fexam1]) || parseDate(row[IDX.fexam2])) : null,
  });
}

// ---------- estado actual en la app (para no retroceder) ----------
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const cur = await (await fetch(`${URL_BASE}/rest/v1/pacientes?select=dni,estado,turno`, { headers })).json();
const curMap = {};
for (const p of cur) curMap[p.dni] = p;

// ---------- armar payload final (upsert, estado monotónico) ----------
const nuevos = [], actualizados = [], cambiosEstado = [];
const payload = sheetPacientes.map(sp => {
  const app = curMap[sp.dni];
  const estadoFinal = app ? (estadoRank(sp._estado_sheet) > estadoRank(app.estado) ? sp._estado_sheet : app.estado) : sp._estado_sheet;
  const turnoFinal = (app && app.turno) ? app.turno : (estadoFinal === 'programada' ? TURNO_DEFAULT : null);

  if (!app) nuevos.push(`${sp.dni} ${sp.nombre} [${estadoFinal}]`);
  else {
    actualizados.push(`${sp.dni} ${sp.nombre}`);
    if (app.estado !== estadoFinal) cambiosEstado.push(`${sp.nombre}: ${app.estado} → ${estadoFinal}`);
  }

  const { _estado_sheet, ...rest } = sp;
  return { ...rest, estado: estadoFinal, turno: turnoFinal };
});

// ---------- mostrar ----------
console.log('\n=== JALADO hoja → app ===');
console.log(`Nuevos: ${nuevos.length}   Actualizados: ${actualizados.length}   Omitidos sin DNI: ${omitidos.length}\n`);
if (nuevos.length) { console.log('➕ NUEVOS:'); nuevos.forEach(x => console.log('   ' + x)); }
if (cambiosEstado.length) { console.log('\n🔀 AVANCE DE ESTADO:'); cambiosEstado.forEach(x => console.log('   ' + x)); }
if (omitidos.length) { console.log('\n⚠️  OMITIDOS (sin DNI en la hoja):'); omitidos.forEach(x => console.log('   ' + x)); }
console.log('');

if (DRY) { console.log('(MODO --dry: no se escribió nada.)\n'); process.exit(0); }

// ---------- ejecutar ----------
const res = await fetch(`${URL_BASE}/rest/v1/pacientes?on_conflict=dni`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify(payload),
});
const resText = await res.text();
if (res.ok) {
  console.log(`✅ Jalado completado: ${payload.length} pacientes sincronizados de la hoja a la app.\n`);
} else {
  console.error(`Error (${res.status}):`, resText, '\n');
}

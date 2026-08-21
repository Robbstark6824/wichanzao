// ============================================================
// import-geresa.mjs
// Importa pacientes desde la hoja GERESA ("FILA AZUL") a Supabase.
// Borra los pacientes actuales y sube los de la hoja (10 pacientes).
// Uso:  node tools/import-geresa.mjs         (importa de verdad)
//       node tools/import-geresa.mjs --dry   (solo muestra qué haría)
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

// DNI falsos temporales para los 3 pacientes sin DNI (en orden de aparición en la hoja).
const FAKE_DNIS = ['11111111', '22222222', '33333333'];

// La hoja no registra turno (mañana/tarde); se usa 'manana' por defecto para poder
// dejar el estado 'programada'. El usuario lo corrige en la app.
const TURNO_DEFAULT = 'manana';

// Índices de columna (0-based) del formato GERESA "FILA AZUL" (47 columnas).
const IDX = {
  fecha_captacion: 8,  // Fecha referencia aceptada
  dni: 9,
  nombre: 10,
  edad: 11,
  sexo: 12,            // Género
  telefono: 13,        // Celular
  tipo_seguro: 14,
  hcl: 15,             // N° historia clínica
  doctor: 17,          // Cirujano responsable
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
  texam1: 29,          // Tipo examen prequirúrgico 1
  fexam1: 30,          // Fecha examen prequirúrgico 1
  texam2: 31,          // Tipo examen prequirúrgico 2
  fexam2: 32,          // Fecha examen prequirúrgico 2
  aplica_imagenes: 35,
  fecha_imagenes: 36,
  fecha_cita_cardiologia: 37,   // F. riesgo quirúrgico
  fecha_cita_anestesiologia: 38, // F. evaluación anestésica
  fecha_evaluacion_preoperatoria: 39,
  resultado_preop: 40,
  orden_intervencion: 41,
  estado: 42,          // Estado de programación
  fecha_cirugia: 43,
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
  c = c.replace(/^DO/, 'D0');                       // "DO6.9" → "D06.9"
  if (/^[A-Z]\d{3}$/.test(c)) c = c[0] + c[1] + c[2] + '.' + c[3]; // "Z359" → "Z35.9"
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

function mapEstado(s) {
  const v = String(s || '').trim().toUpperCase();
  if (v === 'PROGRAMADO' || v === 'PROGRAMADA') return 'programada';
  if (v === 'PENDIENTE DE FECHA') return 'apta_para_sala';
  if (v === 'OPERADO') return 'operada';
  return 'en_tramite';
}

function mapImagenes(s) {
  const v = String(s || '').trim().toLowerCase();
  if (v.startsWith('s')) return 'Sí';
  if (v.startsWith('n')) return 'No';
  return null;
}

// ---------- leer hoja ----------
const csvText = await (await fetch(SS_CSV)).text();
const rows = parseCSV(csvText);
const headerIdx = rows.findIndex(r => String(r[0] || '').trim().toLowerCase() === 'id registro');
if (headerIdx < 0) { console.error('No se encontró el encabezado "ID registro".'); process.exit(1); }
const header = rows[headerIdx].map(c => String(c || '').trim());

// sanity check de columnas clave
const expect = { 9: 'DNI', 10: 'Apellidos y nombres completos', 19: 'Diagnóstico principal', 42: 'Estado de programación' };
for (const [i, name] of Object.entries(expect)) {
  if (header[+i] !== name) {
    console.error(`⚠️  Columna ${i} esperada "${name}" pero es "${header[+i]}". Verificá el formato.`);
    process.exit(1);
  }
}

// ---------- construir pacientes ----------
const pacientes = [];
let fakeIdx = 0;
for (let r = headerIdx + 1; r < rows.length; r++) {
  const row = rows[r];
  const nombre = String(row[IDX.nombre] || '').trim();
  if (!nombre) continue; // fila vacía o fila suelta (ej. "JERUSALEN")
  let dni = String(row[IDX.dni] || '').trim();
  const esFake = !dni;
  if (esFake) { dni = FAKE_DNIS[fakeIdx++] || ('TMP' + r); }

  const t1 = String(row[IDX.texam1] || '').toLowerCase();
  const t2 = String(row[IDX.texam2] || '').toLowerCase();
  const laboratorio = t1.includes('laboratorio') || t2.includes('laboratorio');
  const ekg = t1.includes('ekg') || t2.includes('ekg');
  const resultado = String(row[IDX.resultado_preop] || '').trim().toUpperCase();
  let riesgo_qx = false, riesgo_anestesiologico = false;
  if (resultado === 'APTO') { riesgo_qx = true; riesgo_anestesiologico = true; }
  // "NO APTO" / vacío → false (las columnas son NOT NULL DEFAULT FALSE)

  const estado = mapEstado(row[IDX.estado]);

  const p = {
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
    estado,
    turno: estado === 'programada' ? TURNO_DEFAULT : null,
    fecha_cirugia: parseDate(row[IDX.fecha_cirugia]),
    fecha_captacion: parseDate(row[IDX.fecha_captacion]),
    laboratorio_completo: laboratorio,
    ekg,
    riesgo_qx,
    riesgo_anestesiologico,
    fecha_fase2: (laboratorio || ekg) ? (parseDate(row[IDX.fexam1]) || parseDate(row[IDX.fexam2])) : null,
    _esFake: esFake,
  };
  pacientes.push(p);
}

// ---------- mostrar ----------
console.log('\n=== PACIENTES A IMPORTAR (' + pacientes.length + ') ===');
for (const p of pacientes) {
  console.log(`  ${p.dni}  ${p.nombre}  [${p.estado}]${p._esFake ? '  ⚠️ DNI FALSO temporal' : ''}`);
}

if (DRY) {
  console.log('\n(MODO --dry: no se borró ni importó nada.)\n');
  process.exit(0);
}

// ---------- ejecutar ----------
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// 1) borrar pacientes actuales
const existRes = await fetch(`${URL_BASE}/rest/v1/pacientes?select=dni`, { headers });
const exist = existRes.ok ? await existRes.json() : [];
const delRes = await fetch(`${URL_BASE}/rest/v1/pacientes?dni=not.is.null`, { method: 'DELETE', headers });
console.log(`\nBorrados: ${exist.length} pacientes existentes (status ${delRes.status}).`);

// 2) insertar los de la hoja (upsert por DNI)
const body = pacientes.map(({ _esFake, ...rest }) => rest);
const insRes = await fetch(`${URL_BASE}/rest/v1/pacientes?on_conflict=dni`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify(body),
});
const insText = await insRes.text();
if (insRes.ok) {
  console.log(`Importados: ${pacientes.length} pacientes.\n`);
} else {
  console.error(`Error al importar (${insRes.status}):`, insText, '\n');
}

// Ensayo de la sincronización de Google SIN Google.
//
// Carga apps-script-sync.gs tal cual en Node (las funciones que hablan con
// SpreadsheetApp no se llaman) y ejecuta la traducción hoja→app y las
// decisiones de reconciliación contra la hoja real y la base real.
//
// Es lo mismo que informará `probarSincronizacion` dentro de Apps Script, pero
// se puede correr desde aquí. No escribe nada, en ningún sitio.
import fs from 'fs';

const gs = fs.readFileSync('google/apps-script-sync.gs', 'utf8').replace(/\r\n/g, '\n');
const G = new Function(gs + `
  return { norm, catalogMatch, fechaISO_, filaAPaciente_, estadoDeFila_, compararConApp_,
           CONSTANTES, SS_ID, SHEET_NAME };`)();

// --- La hoja antigua, por CSV (la oficial no es pública: esa solo la lee Google)
const CSV = 'https://docs.google.com/spreadsheets/d/' + G.SS_ID + '/export?format=csv';

function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCSV(await (await fetch(CSV)).text());

// Mismo criterio que findHeaderRow: la fila que contiene "ID registro".
let hi = -1;
for (let i = 0; i < rows.length && hi < 0; i++)
  for (let c = 0; c < rows[i].length; c++)
    if (G.norm(rows[i][c]) === 'id registro') { hi = i; break; }
if (hi < 0) throw new Error('No se encontró el encabezado "ID registro"');

const colMap = {};
rows[hi].forEach((h, c) => { const k = G.norm(h); if (k && !(k in colMap)) colMap[k] = c; });

const filas = [];
for (let i = hi + 1; i < rows.length; i++) {
  const v = {};
  for (const k in colMap) v[k] = rows[i][colMap[k]];
  const dni = String(v['dni'] || '').trim();
  if (!dni || !String(v['apellidos y nombres completos'] || '').trim()) continue;
  filas.push({ dni, fila: i + 1, crudo: v, campos: G.filaAPaciente_(v) });
}

// --- La base ---------------------------------------------------------------
const SB = 'https://xqphjvppfgwabfruyjae.supabase.co';
const KEY = fs.readFileSync('.env', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/)[1];
const pacientes = await (await fetch(SB + '/rest/v1/pacientes?select=*', {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
})).json();
const porDni = {}; pacientes.forEach(p => { porDni[String(p.dni || '').trim()] = p; });

// --- El informe ------------------------------------------------------------
console.log('Filas de ginecología en la hoja antigua: ' + filas.length);
console.log('Pacientes en la app: ' + pacientes.length + '\n');

const altas = [], rellenos = [], discrepancias = [];
for (const f of filas) {
  const app = porDni[f.dni];
  if (!app) { altas.push(f.campos.nombre + ' (fila ' + f.fila + ') → ' + G.estadoDeFila_(f.crudo, f.campos)); continue; }
  const cmp = G.compararConApp_(app, f.campos);
  delete cmp.patch.estado; delete cmp.patch.turno;
  const claves = Object.keys(cmp.patch);
  if (claves.length) rellenos.push(app.nombre + ' → ' + claves.join(', '));
  if (cmp.choques.length) discrepancias.push(app.nombre + ' → ' + cmp.choques.join(' | '));
}

const bloque = (t, l) => { console.log(t + ': ' + l.length); l.forEach(x => console.log('   ' + x)); console.log(''); };
bloque('ALTAS nuevas que traería de la hoja', altas);
bloque('HUECOS que rellenaría en la app', rellenos);
bloque('DISCREPANCIAS (no toca nada, decide una persona)', discrepancias);

// --- Simulacro: ¿qué traería de una fila escrita a mano? -------------------
// Se toma una fila real y se finge que la app no la tiene.
const muestra = filas[filas.length - 1];
console.log('Si "' + muestra.campos.nombre + '" (fila ' + muestra.fila + ') no estuviera en la app,');
console.log('entraría con estado "' + G.estadoDeFila_(muestra.crudo, muestra.campos) + '" y estos datos:');
Object.keys(muestra.campos).sort().forEach(k => {
  const v = muestra.campos[k];
  if (v !== null && v !== undefined && v !== '') console.log('   ' + k.padEnd(32) + v);
});
console.log('');

// La regla que más cara costó: la hoja no puede deshacer una resolución.
// compararConApp_ SÍ propone el estado (no sabe de esa regla); quien lo impide
// es reconciliar_, que lo descarta antes de escribir. Se comprueban las dos
// mitades, porque si desaparece el descarte la protección se pierde en silencio.
const operada = pacientes.find(p => p.estado === 'operada');
if (operada) {
  const prop = G.compararConApp_({ ...operada, estado: null }, { estado: 'en_tramite' });
  console.log('Protección de la resolución:');
  console.log('  ' + (prop.patch.estado === 'en_tramite' ? '✓' : '✗') +
    ' compararConApp_ propondría el estado de la hoja (por eso hay que descartarlo)');
  const hayGuardia = gs.includes('delete cmp.patch.estado');
  if (!hayGuardia) fallos++;
  console.log('  ' + (hayGuardia ? '✓' : '✗ FALTA') +
    ' reconciliar_ lo descarta antes de escribir (delete cmp.patch.estado)');
  console.log('');
}

// Y que un choque real se detecta en vez de pisarse:
const victima = pacientes.find(p => p.diagnostico);
const choque = G.compararConApp_(victima, { diagnostico: 'OTRA COSA DISTINTA', hcl: null });
console.log('Detección de choques: ' +
  (choque.choques.length === 1 && Object.keys(choque.patch).length === 0
    ? '✓ un diagnóstico distinto se anota y NO se pisa'
    : '✗ FALLA'));
console.log('   ' + (choque.choques[0] || '(nada)') + '\n');

// --- Comprobaciones de la traducción de fechas -----------------------------
console.log('Lectura de fechas escritas a mano:');
let fallos = 0;
[['25/08/26', '2026-08-25'], ['25/8/2026', '2026-08-25'], ['2026-08-25', '2026-08-25'],
 ['25-08-2026', '2026-08-25'], ['', null], ['no es fecha', null], ['32/13/26', null]
].forEach(([entrada, espera]) => {
  const got = G.fechaISO_(entrada);
  const ok = got === espera;
  if (!ok) fallos++;
  console.log('  ' + (ok ? '✓' : '✗') + ' "' + entrada + '" → ' + got + (ok ? '' : '  (esperaba ' + espera + ')'));
});

console.log('\n' + (fallos ? 'FALLA en la lectura de fechas' : 'OK'));
process.exit(fallos ? 1 : 0);

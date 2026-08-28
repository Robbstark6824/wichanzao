// Prueba: la app detecta a las pacientes que están escritas a mano en el Excel
// y no existen en la app.
//
// Extrae la función real de index.html y la corre contra la hoja de Google real
// y las pacientes reales de la base. No escribe nada.
import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const entre = (desde, hasta) => {
  const a = html.indexOf(desde), b = html.indexOf(hasta, a);
  if (a < 0 || b < 0) throw new Error('No se pudo recortar: ' + desde);
  return html.slice(a, b);
};
const fn = (firma) => {
  const a = html.indexOf(firma);
  if (a < 0) throw new Error('No se encontró: ' + firma);
  return html.slice(a, html.indexOf('\n}\n', a) + 3);
};

const CSV = html.match(/var QX_SHEET_CSV_URL = '([^']+)'/)[1];
const SB = 'https://xqphjvppfgwabfruyjae.supabase.co';
const KEY = fs.readFileSync('.env', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/)[1];

const api = new Function('QX_SHEET_CSV_URL', 'qxRender', 'fetch',
  entre('function qxNorm(s){', 'async function qxSyncFromSheet(btn){') + '\n' +
  'var QX_PACIENTES = [];\nvar QX_PENDIENTES = [];\nvar QX_PEND_ULT = 0;\n' +
  fn('async function qxDetectarPendientes(forzar){') + '\n' +
  'return { detectar: qxDetectarPendientes,\n' +
  '         set: function(l){ QX_PACIENTES = l; QX_PENDIENTES = []; QX_PEND_ULT = 0; },\n' +
  '         pendientes: function(){ return QX_PENDIENTES; } };'
)(CSV, () => {}, fetch);

const pacientes = await (await fetch(SB + '/rest/v1/pacientes?select=dni,nombre', {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
})).json();

let fallos = 0;
const check = (cond, txt) => { console.log((cond ? '  ✓ ' : '  ✗ ') + txt); if (!cond) fallos++; };

console.log('Pacientes en la app: ' + pacientes.length + '\n');

// --- Caso 1: todo sincronizado -------------------------------------------
console.log('Con la app al día, no debe avisar de nada:');
api.set(pacientes);
await api.detectar(true);
check(api.pendientes().length === 0,
      'ninguna pendiente (detectó ' + api.pendientes().length + ')');

// --- Caso 2: una paciente del Excel que "falta" en la app -----------------
const quitada = pacientes[Math.floor(pacientes.length / 2)];
console.log('\nSi a la app le falta ' + quitada.nombre + ', debe detectarla:');
api.set(pacientes.filter(p => p.dni !== quitada.dni));
await api.detectar(true);
const pend = api.pendientes();
check(pend.length === 1, 'detecta exactamente 1 (detectó ' + pend.length + ')');
check(pend[0] && pend[0].dni === quitada.dni, 'y es la correcta: ' + (pend[0] ? pend[0].nombre : '—'));
check(pend[0] && !!pend[0].nombre && !!pend[0].diagnostico, 'trae sus datos de la hoja, no solo el DNI');

// --- Caso 3: app vacía ----------------------------------------------------
console.log('\nCon la app vacía, debe ver a todas las de la hoja:');
api.set([]);
await api.detectar(true);
check(api.pendientes().length > 0, 'detecta ' + api.pendientes().length + ' del Excel');

console.log('\n' + (fallos ? 'FALLA: ' + fallos + ' comprobación(es)' : 'OK: el aviso detecta lo que se escribe a mano en el Excel.'));
process.exit(fallos ? 1 : 0);

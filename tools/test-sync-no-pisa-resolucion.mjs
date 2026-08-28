// Prueba de regresión: la sincronización con la hoja GERESA NO puede deshacer
// una resolución registrada en la app (operada / suspendida / referida).
//
// No reimplementa la lógica: extrae de index.html las funciones reales y el
// cuerpo real del merge, y los corre contra la hoja de Google real y las filas
// reales de la base.
import fs from 'fs';

// Acepta otra copia de index.html como argumento, para comparar versiones.
// Se normalizan los saltos de línea: en Windows el archivo puede quedar con CRLF
// y los recortes de abajo buscan \n.
const html = fs.readFileSync(process.argv[2] || 'index.html', 'utf8').replace(/\r\n/g, '\n');

const entre = (desde, hasta) => {
  const a = html.indexOf(desde);
  const b = html.indexOf(hasta, a);
  if (a < 0 || b < 0) throw new Error('No se pudo recortar: ' + desde);
  return html.slice(a, b);
};

const helpers = entre('function qxNorm(s){', 'async function qxSyncFromSheet(btn){');
const terminal = html.match(/function qxEstadoTerminal\(e\)\{[^\n]*\}/)[0];
const merge = entre('    hoja.forEach(function(sp){', '    });\n    var payload = [];');

const api = new Function(
  helpers + '\n' + terminal + '\n' +
  'function __merge(hoja, curMap){\n' +
  '  var byDni = {}; var estadoHoja = {};\n' +
  merge + '  });\n' +
  '  return { byDni: byDni, estadoHoja: estadoHoja };\n}\n' +
  'return { qxParseCSV: qxParseCSV, qxNorm: qxNorm, qxMapFilaAzul: qxMapFilaAzul, __merge: __merge };'
)();

// --- Datos reales ---------------------------------------------------------
const CSV = 'https://docs.google.com/spreadsheets/d/1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU/export?format=csv';
const SB = 'https://xqphjvppfgwabfruyjae.supabase.co';
const KEY = fs.readFileSync('.env', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/)[1];

const rows = api.qxParseCSV(await (await fetch(CSV)).text());
let hi = -1;
for (let i = 0; i < rows.length; i++) {
  if (api.qxNorm(rows[i][9]) === 'dni' && api.qxNorm(rows[i][10]) === 'apellidos y nombres completos') { hi = i; break; }
}
if (hi < 0) throw new Error('No se encontró el bloque GERESA en la hoja');

const hoja = [];
for (let r = hi + 1; r < rows.length; r++) {
  const row = rows[r];
  if (!String(row[10] || '').trim() || !String(row[9] || '').trim()) continue;
  hoja.push(api.qxMapFilaAzul(row));
}

const cur = await (await fetch(
  SB + '/rest/v1/pacientes?select=dni,nombre,estado,turno,referencia_hospital,motivo_suspension,motivo_cierre,cama_hospitalizacion,id_registro',
  { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } }
)).json();

const curMap = {};
cur.forEach(p => { curMap[p.dni] = p; });

// --- Ejecutar el merge real ----------------------------------------------
const { byDni, estadoHoja } = api.__merge(hoja, curMap);

const TERMINALES = ['operada', 'suspendida', 'referida'];
let fallos = 0, protegidas = 0, devueltas = 0;

console.log('Filas en la hoja: ' + hoja.length + ' · pacientes en la base: ' + cur.length + '\n');
for (const p of cur) {
  const res = byDni[p.dni];
  if (!res) continue;
  const esTerminal = TERMINALES.includes(p.estado);
  if (esTerminal) {
    protegidas++;
    if (res.estado !== p.estado) {
      fallos++;
      console.log('  ✗ ' + p.nombre + ': ' + p.estado + ' → ' + res.estado + ' (la hoja decía "' + estadoHoja[p.dni] + '")');
    } else {
      console.log('  ✓ ' + p.nombre + ': se mantiene ' + p.estado + ' (la hoja decía "' + estadoHoja[p.dni] + '")');
    }
  }
  if (res.estado !== estadoHoja[p.dni]) devueltas++;
}

console.log('\nResoluciones en la base: ' + protegidas + ' · revertidas por la hoja: ' + fallos);
console.log('Filas que la app devolvería a las dos hojas: ' + devueltas);
if (fallos) { console.log('\nFALLA: la sincronización todavía pisa resoluciones.'); process.exit(1); }
console.log('OK: ninguna resolución se pierde al sincronizar.');

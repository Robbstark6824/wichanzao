// El diagnóstico 1 de una gestante se calcula en DOS sitios: la app
// (index.html) y el Apps Script que escribe las hojas. Si un día divergen, la
// ficha y el Excel dirán cosas distintas de la misma paciente y nadie sabrá
// cuál creer.
//
// Esto exige que den exactamente el mismo texto, y comprueba las tres reglas
// que decidió el servicio: se escribe solo si hay FUR o eco, se detiene cuando
// el caso se cierra, y lo escrito a mano no se toca jamás.
import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const gs = fs.readFileSync('google/apps-script-sync.gs', 'utf8').replace(/\r\n/g, '\n');
const HOY = '2026-09-08';

const uno = (s, re) => { const m = s.match(re); if (!m) throw new Error('No encontré: ' + re); return m[0]; };
const bloque = (s, firma) => {
  const a = s.indexOf(firma);
  if (a < 0) throw new Error('No encontré: ' + firma);
  return s.slice(a, s.indexOf('\n}\n', a) + 3);
};

// --- La app. qxHoyStr se fija para que ambos lados miren el mismo día. ----
const APP = new Function('HOY',
  'function qxHoyStr(){ return HOY; }\n' +
  uno(html, /function qxPad\(n\)\{[^\n]*\}/) + '\n' +
  bloque(html, 'function qxSumarDias(f, n){') + '\n' +
  bloque(html, 'function qxDiasEntreFechas(a, b){') + '\n' +
  bloque(html, 'function qxFurEfectiva(p){') + '\n' +
  bloque(html, 'function qxEG(p, fecha){') + '\n' +
  bloque(html, 'function qxFechaCorte(p){') + '\n' +
  bloque(html, 'function qxFuenteEG(p){') + '\n' +
  bloque(html, 'function qxDxGestacion(p){') + '\n' +
  uno(html, /function qxDxPrincipal\(p\)\{[^\n]*\}/) + '\n' +
  'return { eg:function(p,f){var r=qxEG(p,f);return r?r.texto:null;}, dx:qxDxPrincipal, corte:qxFechaCorte };'
)(HOY);

// --- El Apps Script, con los servicios de Google simulados ---------------
const GOOGLE = new Function('Utilities', 'Session', gs +
  '; return { eg: egEn_, dx: dxPrincipal_, corte: fechaCorte_ };'
)({ formatDate: () => HOY }, { getScriptTimeZone: () => 'America/Lima' });

let fallos = 0;
const eq = (got, esperado, txt) => {
  const ok = got === esperado;
  if (!ok) fallos++;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + txt + (ok ? '' : '\n        dio      "' + got + '"\n        esperaba "' + esperado + '"'));
};

// =========================================================================
console.log('\nLAS DOS IMPLEMENTACIONES DEBEN DECIR LO MISMO\n');
const casos = [
  { fur: '2026-01-05', estado: 'programada' },
  { eco_fecha: '2026-03-10', eco_semanas: 12, eco_dias: 3, estado: 'en_tramite' },
  { eco_fecha: '2026-08-28', eco_semanas: 36, eco_dias: 2, estado: 'apta_para_sala' },
  { fur: '2026-01-01', eco_fecha: '2026-03-10', eco_semanas: 12, eco_dias: 3, estado: 'programada' },
  { fur: '2026-01-05', estado: 'operada', fecha_real_operacion: '2026-08-20' },
  { fur: '2026-01-05', estado: 'suspendida', fecha_suspension: '2026-08-18' },
  { fur: '2026-01-05', estado: 'referida', fecha_cierre: '2026-08-15' },
  { diagnostico: 'QUISTE DE BARTOLINO RECURRENTE', estado: 'programada' },
  { diagnostico: 'EU 36 SEMANAS 3 DÍAS X ECO I T', estado: 'programada' },
];
let n = 0;
for (const c of casos) {
  const a = APP.dx(c), g = GOOGLE.dx(c);
  n++;
  if (a !== g) { fallos++; console.log('  ✗ ' + JSON.stringify(c) + '\n      app="' + a + '"\n      google="' + g + '"'); }
}
console.log('  ' + (fallos ? '✗' : '✓') + ' ' + n + ' fichas comparadas, ' + (fallos ? fallos + ' discrepancias' : 'todas coinciden'));

// =========================================================================
console.log('\nLO ESCRIBE EL SISTEMA SI HAY FUR O ECO\n');
const gestante = { eco_fecha: '2026-08-28', eco_semanas: 36, eco_dias: 2, estado: 'programada' };
eq(APP.dx(gestante), 'EU 37ss 6/7 x eco 1TRI', 'con eco del 1.er trimestre');
eq(APP.dx({ fur: '2026-01-05', estado: 'programada' }), 'EU 35ss 1/7 x FUR', 'con FUR');
// La eco del 10/03 marcando 12ss 3/7 sitúa la FUR real en el 13/12/2025.
// De ahí al 08/09 van 269 días = 38ss 3/7. Por FUR referida (01/01) saldría
// 35ss 4/7: casi tres semanas de diferencia, y por eso manda la eco.
eq(APP.dx({ fur: '2026-01-01', eco_fecha: '2026-03-10', eco_semanas: 12, eco_dias: 3, estado: 'programada' }),
  'EU 38ss 3/7 x eco 1TRI', 'con las dos, manda la eco');

// =========================================================================
console.log('\nSE DETIENE AL CERRAR EL CASO — EN LA APP Y EN LAS HOJAS\n');
const base = { fur: '2026-01-05' };
eq(APP.dx({ ...base, estado: 'programada' }), 'EU 35ss 1/7 x FUR', 'abierta: cuenta hasta hoy');
eq(APP.dx({ ...base, estado: 'operada', fecha_real_operacion: '2026-08-20' }), 'EU 32ss 3/7 x FUR',
  'operada: se para el día de la operación');
eq(GOOGLE.dx({ ...base, estado: 'operada', fecha_real_operacion: '2026-08-20' }), 'EU 32ss 3/7 x FUR',
  '…y en la hoja de GERESA dice exactamente lo mismo');
eq(APP.dx({ ...base, estado: 'suspendida', fecha_suspension: '2026-08-18' }), 'EU 32ss 1/7 x FUR',
  'suspendida: se para el día de la suspensión');
eq(APP.dx({ ...base, estado: 'referida', fecha_cierre: '2026-08-15' }), 'EU 31ss 5/7 x FUR',
  'cerrada sin cirugía: se para el día del cierre');

// =========================================================================
console.log('\nSIN FUR NI ECO NO SE TOCA NADA\n');
eq(APP.dx({ diagnostico: 'QUISTE DE BARTOLINO RECURRENTE' }), 'QUISTE DE BARTOLINO RECURRENTE',
  'una paciente ginecológica sale igual que entró');
eq(APP.dx({ diagnostico: 'NEOPLASIA INTRAEPITELIAL GRADO III' }), 'NEOPLASIA INTRAEPITELIAL GRADO III',
  'y otra también');
eq(APP.dx({ diagnostico: 'EU 36 SEMANAS 3 DÍAS X ECO I T, CESAREADA ANTERIOR' }),
  'EU 36 SEMANAS 3 DÍAS X ECO I T, CESAREADA ANTERIOR',
  'unas semanas escritas a mano SIN FUR ni eco se quedan quietas, no se actualizan');
eq(APP.dx({}), '', 'sin nada, nada');

console.log('\n' + (fallos ? 'FALLA: ' + fallos + ' comprobación(es)' : 'OK: la app y las hojas dicen lo mismo, y paran a la vez.'));
process.exit(fallos ? 1 : 0);

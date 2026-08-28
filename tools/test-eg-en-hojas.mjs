// La edad gestacional se calcula en DOS sitios: la app (index.html) y el Apps
// Script que escribe las hojas. Si un día divergen, la ficha y el Excel dirán
// cosas distintas de la misma paciente y nadie sabrá cuál creer.
//
// Esto comprueba que dan exactamente el mismo resultado, y que el sufijo que se
// añade al salir a la hoja se quita limpio al leerla de vuelta.
import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const gs = fs.readFileSync('google/apps-script-sync.gs', 'utf8').replace(/\r\n/g, '\n');

const uno = (s, re) => { const m = s.match(re); if (!m) throw new Error('No encontré: ' + re); return m[0]; };
const bloque = (s, firma) => {
  const a = s.indexOf(firma);
  if (a < 0) throw new Error('No encontré: ' + firma);
  return s.slice(a, s.indexOf('\n}\n', a) + 3);
};

// --- La app ---------------------------------------------------------------
const APP = new Function(
  uno(html, /function qxPad\(n\)\{[^\n]*\}/) + '\n' +
  bloque(html, 'function qxSumarDias(f, n){') + '\n' +
  bloque(html, 'function qxDiasEntreFechas(a, b){') + '\n' +
  bloque(html, 'function qxFurEfectiva(p){') + '\n' +
  bloque(html, 'function qxEG(p, fecha){') + '\n' +
  'return { eg: function(p,f){ var r = qxEG(p,f); return r ? r.texto : null; } };'
)();

// --- El Apps Script (con los servicios de Google simulados) ---------------
const HOY = '2026-09-08';
const GOOGLE = new Function('Utilities', 'Session', gs +
  '; return { eg: egEn_, dx: dxConEG_, quitar: quitarEG_, fur: furEfectiva_, terminal: esTerminal_ };'
)(
  { formatDate: () => HOY },
  { getScriptTimeZone: () => 'America/Lima' }
);

let fallos = 0;
const eq = (a, b, txt) => {
  const ok = a === b;
  if (!ok) fallos++;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + txt + (ok ? '' : '   app="' + a + '"  google="' + b + '"'));
};

console.log('\nLAS DOS IMPLEMENTACIONES DEBEN COINCIDIR\n');
const casos = [
  { fur: '2026-01-05' },
  { fur: '2025-12-13' },
  { eco_fecha: '2026-03-10', eco_semanas: 12, eco_dias: 3 },
  { eco_fecha: '2026-08-28', eco_semanas: 36, eco_dias: 2 },
  { fur: '2026-01-01', eco_fecha: '2026-03-10', eco_semanas: 12, eco_dias: 3 },
  { eco_fecha: '2026-08-28', eco_semanas: 36, eco_dias: 0 },
  {},
];
const fechas = ['2026-09-08', '2026-09-09', '2026-09-15', '2026-03-10', '2026-12-31'];
let comparaciones = 0;
for (const c of casos) {
  for (const f of fechas) {
    const a = APP.eg(c, f), g = GOOGLE.eg(c, f);
    comparaciones++;
    if (a !== g) { fallos++; console.log('  ✗ ' + JSON.stringify(c) + ' en ' + f + ' → app="' + a + '" google="' + g + '"'); }
  }
}
console.log('  ' + (fallos ? '✗' : '✓') + ' ' + comparaciones + ' comparaciones, ' +
  (fallos ? fallos + ' discrepancias' : 'todas coinciden'));

console.log('\nEL SUFIJO QUE VA A LA HOJA\n');
const gestante = {
  diagnostico: 'GU 36ss 2/7 d x eco 1TRI FETO CRECIENDO EN P97',
  eco_fecha: '2026-08-28', eco_semanas: 36, eco_dias: 2, estado: 'programada'
};
const conEG = GOOGLE.dx(gestante);
console.log('  En la hoja se escribirá:\n     ' + conEG + '\n');
// 36ss 2/7 el 28/08 son 254 días; al 08/09 han pasado 11 más → 265 = 37ss 6/7.
// Cumple 38ss el 09/09, que es el día que el servicio busca para programar.
eq(conEG, gestante.diagnostico + ' · EG 37ss 6/7 (08/09/26)', 'lleva la edad gestacional de hoy');
eq(GOOGLE.quitar(conEG), gestante.diagnostico, 'y al leerla de vuelta queda el diagnóstico original');

console.log('\nUNA FICHA CERRADA NO SE MUEVE\n');
const operada = {
  diagnostico: 'Quiste de Bartholin', fur: '2026-01-05',
  estado: 'operada', fecha_real_operacion: '2026-08-20'
};
eq(GOOGLE.dx(operada), 'Quiste de Bartholin · EG 32ss 3/7 (20/08/26)',
  'se congela en la fecha de la operación, no avanza con los días');

console.log('\nLO QUE NO DEBE ROMPER\n');
eq(GOOGLE.dx({ diagnostico: 'Miomatosis uterina' }), 'Miomatosis uterina',
  'una paciente no gestante sale igual que entró');
eq(GOOGLE.quitar('Miomatosis uterina'), 'Miomatosis uterina',
  'y al leerla no se le quita nada');
eq(GOOGLE.quitar('GU 36ss 2/7 d x eco 1TRI'), 'GU 36ss 2/7 d x eco 1TRI',
  'un diagnóstico escrito a mano que menciona semanas se respeta entero');
eq(GOOGLE.quitar('Dx · EG 38ss 0/7 (08/09/26) y algo más'), 'Dx · EG 38ss 0/7 (08/09/26) y algo más',
  'solo se quita si está al final; si hay texto detrás, no se toca');
eq(GOOGLE.dx({ diagnostico: null, fur: '2026-01-05', estado: 'programada' }), 'EG 35ss 1/7 (08/09/26)',
  'sin diagnóstico escrito, al menos va la edad gestacional');

console.log('\n' + (fallos ? 'FALLA: ' + fallos + ' comprobación(es)' : 'OK: la app y las hojas dicen lo mismo.'));
process.exit(fallos ? 1 : 0);

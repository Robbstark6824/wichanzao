// La edad gestacional decide cuándo se programa una cesárea. Estas cuentas
// tienen que estar bien, así que se comprueban contra casos con respuesta
// conocida, extrayendo las funciones REALES de index.html.
import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const uno = (re) => { const m = html.match(re); if (!m) throw new Error('No encontré: ' + re); return m[0]; };
const bloque = (firma) => {
  const a = html.indexOf(firma);
  if (a < 0) throw new Error('No encontré: ' + firma);
  return html.slice(a, html.indexOf('\n}\n', a) + 3);
};

const G = new Function(
  uno(/function qxPad\(n\)\{[^\n]*\}/) + '\n' +
  bloque('function qxSumarDias(f, n){') + '\n' +
  bloque('function qxDiasEntreFechas(a, b){') + '\n' +
  bloque('function qxFurEfectiva(p){') + '\n' +
  bloque('function qxEG(p, fecha){') + '\n' +
  uno(/function qxFpp\(p\)\{[^\n]*\}/) + '\n' +
  'return { qxEG, qxFpp, qxFurEfectiva, qxSumarDias, qxDiasEntreFechas };'
)();

let fallos = 0;
const eq = (got, esperado, txt) => {
  const ok = got === esperado;
  if (!ok) fallos++;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + txt + (ok ? '' : '  → dio ' + got + ', esperaba ' + esperado));
};

console.log('\nPOR FUR\n');
const fur = { fur: '2026-01-05' };
eq(G.qxEG(fur, '2026-01-05').texto, '0ss 0/7', 'el día de la FUR son 0 semanas');
eq(G.qxEG(fur, '2026-01-12').texto, '1ss 0/7', 'a los 7 días, 1 semana justa');
eq(G.qxEG(fur, '2026-01-15').texto, '1ss 3/7', 'a los 10 días, 1ss 3/7');
eq(G.qxFpp(fur), '2026-10-12', 'la FPP son 280 días después de la FUR');
eq(G.qxEG(fur, G.qxFpp(fur)).texto, '40ss 0/7', 'y en la FPP la gestante tiene 40ss justas');

console.log('\nPOR ECOGRAFÍA DEL PRIMER TRIMESTRE\n');
const eco = { eco_fecha: '2026-03-10', eco_semanas: 12, eco_dias: 3 };
eq(G.qxEG(eco, '2026-03-10').texto, '12ss 3/7', 'el día de la eco marca lo que marcó la eco');
eq(G.qxEG(eco, '2026-03-17').texto, '13ss 3/7', 'una semana después, una semana más');
eq(G.qxFurEfectiva(eco), '2025-12-13', 'la FUR se deduce hacia atrás desde la eco');

console.log('\nCUANDO HAY LAS DOS COSAS\n');
const ambas = { fur: '2026-01-01', eco_fecha: '2026-03-10', eco_semanas: 12, eco_dias: 3 };
eq(G.qxEG(ambas, '2026-03-10').texto, '12ss 3/7', 'manda la eco, no la FUR (es más fiable)');

console.log('\nEL CASO DEL SERVICIO: captación a las 36ss, cesárea a las 38\n');
// Gestante captada el 28/08 con 36ss 2/7 por eco del primer trimestre.
const capt = '2026-08-28';
const paciente = { eco_fecha: capt, eco_semanas: 36, eco_dias: 2 };
eq(G.qxEG(paciente, capt).texto, '36ss 2/7', 'el día de la captación');
eq(G.qxEG(paciente, '2026-09-04').texto, '37ss 2/7', 'una semana después, sin tocar nada');
eq(G.qxEG(paciente, '2026-09-11').texto, '38ss 2/7', 'a las dos semanas ya está en 38ss');
const objetivo = G.qxSumarDias(G.qxFurEfectiva(paciente), 38 * 7);
eq(objetivo, '2026-09-09', 'cumple 38ss exactas el 09/09 — el día a programar');
eq(G.qxEG(paciente, objetivo).texto, '38ss 0/7', 'y ese día son 38ss 0/7');

console.log('\nLO QUE NO DEBE AFIRMAR\n');
eq(G.qxEG({}, '2026-09-08'), null, 'sin FUR ni eco no inventa nada');
eq(G.qxEG(fur, '2026-01-04'), null, 'una fecha anterior a la FUR no da negativo');
eq(G.qxEG(fur, '2027-06-01'), null, 'más allá de un embarazo posible, calla');
eq(G.qxEG({ eco_fecha: '2026-03-10' }, '2026-03-17'), null, 'eco sin semanas no sirve para contar');

console.log('\n' + (fallos ? 'FALLA: ' + fallos + ' comprobación(es)' : 'OK: las cuentas son correctas.'));
process.exit(fallos ? 1 : 0);

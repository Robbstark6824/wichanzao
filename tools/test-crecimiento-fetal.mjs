// El módulo Calculadora estima peso fetal y percentiles de crecimiento. Esas
// cuentas deciden si un feto es PEG/GEG, así que se comprueban contra las TABLAS
// OFICIALES de INTERGROWTH-21st (© University of Oxford) y contra fórmulas
// publicadas de Hadlock — extrayendo las funciones REALES de index.html.
//
// Anclas y ecuaciones documentadas en tools/intergrowth-21st.md
import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');

const bloque = (firma, cierre = '\n}\n') => {
  const a = html.indexOf(firma);
  if (a < 0) throw new Error('No encontré: ' + firma);
  const b = html.indexOf(cierre, a);
  if (b < 0) throw new Error('No encontré el cierre de: ' + firma);
  return html.slice(a, b + cierre.length);
};

const G = new Function(
  bloque('function calcNormCdf(z){') + '\n' +
  bloque('var CALC_IG = {', '\n};\n') + '\n' +
  bloque('function calcBiometriaPct(key, ga, valMm){') + '\n' +
  bloque('function calcHadlockEFW(bpdMm, hcMm, acMm, flMm){') + '\n' +
  bloque('function calcIntergrowthEFW(acMm, hcMm){') + '\n' +
  bloque('function calcEFWpct(ga, efwG){') + '\n' +
  bloque('function calcEgPorLcc(lcc, fx){') + '\n' +
  'return { calcNormCdf, CALC_IG, calcBiometriaPct, calcHadlockEFW, calcIntergrowthEFW, calcEFWpct, calcEgPorLcc };'
)();

let fallos = 0;
const cerca = (got, esperado, tol, txt) => {
  const ok = got != null && Math.abs(got - esperado) <= tol;
  if (!ok) fallos++;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + txt + (ok ? '' : '  → dio ' + (got == null ? 'null' : (+got).toFixed(2)) + ', esperaba ' + esperado + ' ±' + tol));
};
const esNull = (got, txt) => {
  const ok = got === null;
  if (!ok) fallos++;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + txt + (ok ? '' : '  → no devolvió null'));
};

console.log('\nPESO FETAL ESTIMADO · percentiles INTERGROWTH-21st (tabla oficial Stirnemann 2017)\n');
cerca(G.calcEFWpct(22, null).p50, 525, 3, '22 sem · p50 = 525 g');
cerca(G.calcEFWpct(30, null).p50, 1396, 3, '30 sem · p50 = 1396 g');
cerca(G.calcEFWpct(33, null).p50, 1954, 3, '33 sem · p50 = 1954 g');
cerca(G.calcEFWpct(40, null).p50, 3338, 3, '40 sem · p50 = 3338 g');
cerca(G.calcEFWpct(33, null).p3, 1495, 6, '33 sem · p3  = 1495 g');
cerca(G.calcEFWpct(33, null).p10, 1630, 6, '33 sem · p10 = 1630 g');
cerca(G.calcEFWpct(33, null).p97, 2529, 6, '33 sem · p97 = 2529 g');
cerca(G.calcEFWpct(40, null).p3, 2574, 6, '40 sem · p3  = 2574 g');
cerca(G.calcEFWpct(40, null).p97, 4101, 6, '40 sem · p97 = 4101 g');

console.log('\n  percentil y z-score de un PFE dado\n');
cerca(G.calcEFWpct(33, 1954).pct, 50, 1, 'PFE 1954 g a las 33 sem → p50');
cerca(G.calcEFWpct(33, 1954).z, 0, 0.03, 'PFE 1954 g a las 33 sem → z 0');
cerca(G.calcEFWpct(33, 1495).pct, 3, 0.6, 'PFE 1495 g a las 33 sem → p3');
cerca(G.calcEFWpct(33, 1495).z, -1.8808, 0.03, 'PFE 1495 g a las 33 sem → z −1.88');
cerca(G.calcEFWpct(40, 4101).pct, 97, 0.6, 'PFE 4101 g a las 40 sem → p97');

console.log('\n  fuera del rango 22–40 sem: no inventa nada\n');
esNull(G.calcEFWpct(21, 400), '21 sem → null');
esNull(G.calcEFWpct(41, 4000), '41 sem → null');

console.log('\nBIOMETRÍA · percentiles INTERGROWTH-21st (tablas oficiales Papageorghiou 2014)\n');
cerca(G.CALC_IG.bpd.m(20), 48.4, 0.3, 'DBP mediana 20 sem = 48.4 mm');
cerca(G.CALC_IG.hc.m(20), 172.5, 0.3, 'CC  mediana 20 sem = 172.5 mm');
cerca(G.CALC_IG.ac.m(20), 147.7, 0.3, 'CA  mediana 20 sem = 147.7 mm');
cerca(G.CALC_IG.fl.m(20), 31.3, 0.3, 'LF  mediana 20 sem = 31.3 mm');
cerca(G.CALC_IG.bpd.m(33), 85.9, 0.3, 'DBP mediana 33 sem = 85.9 mm');
cerca(G.CALC_IG.hc.m(33), 301.5, 0.3, 'CC  mediana 33 sem = 301.5 mm');
cerca(G.CALC_IG.ac.m(33), 283.8, 0.3, 'CA  mediana 33 sem = 283.8 mm');
cerca(G.CALC_IG.fl.m(33), 61.3, 0.3, 'LF  mediana 33 sem = 61.3 mm');

console.log('\n  el valor de la mediana cae en p50; p3/p97 de la tabla caen donde deben\n');
cerca(G.calcBiometriaPct('hc', 33, 301.5).pct, 50, 1, 'CC 301.5 mm / 33 sem → p50');
cerca(G.calcBiometriaPct('ac', 20, 147.7).pct, 50, 1, 'CA 147.7 mm / 20 sem → p50');
cerca(G.calcBiometriaPct('bpd', 33, 92.0).pct, 97, 1.5, 'DBP 92.0 mm / 33 sem → p97');
cerca(G.calcBiometriaPct('hc', 33, 320.0).pct, 97, 1.5, 'CC 320.0 mm / 33 sem → p97');
cerca(G.calcBiometriaPct('ac', 33, 310.7).pct, 97, 1.5, 'CA 310.7 mm / 33 sem → p97');
cerca(G.calcBiometriaPct('fl', 33, 56.7).pct, 3, 1.5, 'LF 56.7 mm / 33 sem → p3');

console.log('\n  fuera del rango 14–40 sem: null\n');
esNull(G.calcBiometriaPct('hc', 13, 100), 'CC a las 13 sem → null');
esNull(G.calcBiometriaPct('ac', 41, 350), 'CA a las 41 sem → null');
esNull(G.calcBiometriaPct('xx', 30, 200), 'medida inexistente → null');

console.log('\nPFE puntual · Hadlock 1985 e INTERGROWTH-21st (entradas en mm)\n');
// Feto de término: DBP 95, CC 334, CA 350, LF 72 mm
cerca(G.calcHadlockEFW(95, 334, 350, 72).g, 3470, 20, 'Hadlock 4 parámetros ≈ 3470 g');
cerca(G.calcIntergrowthEFW(350, 334), 3390, 20, 'INTERGROWTH (CA+CC) ≈ 3390 g');
// variantes por medidas faltantes
cerca(G.calcHadlockEFW(null, 334, 350, 72).g, 3400, 120, 'Hadlock CC+CA+LF (sin DBP) — plausible');
cerca(G.calcHadlockEFW(95, null, 350, 72).g, 3400, 120, 'Hadlock DBP+CA+LF (sin CC) — plausible');
esNull(G.calcHadlockEFW(95, 334, null, 72), 'sin CA no hay PFE de Hadlock');
esNull(G.calcIntergrowthEFW(350, null), 'sin CC no hay PFE INTERGROWTH');

console.log('\nEDAD GESTACIONAL POR LCC\n');
cerca(G.calcEgPorLcc(45, 'rf').dias, 79, 2, 'LCC 45 mm · Robinson–Fleming ≈ 79 días (11ss 2/7)');
cerca(G.calcEgPorLcc(45, 'ig').dias, 78, 2, 'LCC 45 mm · INTERGROWTH ≈ 78 días');
cerca(G.calcEgPorLcc(84, 'rf').dias, 98, 2, 'LCC 84 mm · Robinson–Fleming ≈ 14ss 0/7');
esNull(G.calcEgPorLcc(3, 'rf'), 'LCC 3 mm (< 5) → null');
esNull(G.calcEgPorLcc(90, 'rf'), 'LCC 90 mm (> 84) → null en Robinson–Fleming');
esNull(G.calcEgPorLcc(100, 'ig'), 'LCC 100 mm (> 95) → null en INTERGROWTH');

console.log('\n' + (fallos ? 'FALLA: ' + fallos + ' comprobación(es)' : 'OK: las cuentas coinciden con las tablas oficiales.'));
process.exit(fallos ? 1 : 0);

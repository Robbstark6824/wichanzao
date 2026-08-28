// El diagnóstico 1 de una gestante se calcula en DOS sitios: la app
// (index.html) y el Apps Script que escribe las hojas. Si un día divergen, la
// ficha y el Excel dirán cosas distintas de la misma paciente y nadie sabrá
// cuál creer.
//
// Casi todo se comprueba como PROPIEDAD ("añadir una eco de 2.º trimestre no
// cambia el resultado") en vez de comparar contra semanas calculadas a mano:
// así el test no depende de que quien lo escribe sepa contar días.
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
  bloque(html, 'function qxEcoUsable(p){') + '\n' +
  bloque(html, 'function qxTrimestreEco(p){') + '\n' +
  bloque(html, 'function qxFurDeEco(p){') + '\n' +
  bloque(html, 'function qxUsaEco(p){') + '\n' +
  bloque(html, 'function qxFurEfectiva(p){') + '\n' +
  bloque(html, 'function qxEG(p, fecha){') + '\n' +
  bloque(html, 'function qxFechaCorte(p){') + '\n' +
  bloque(html, 'function qxFuenteEG(p){') + '\n' +
  bloque(html, 'function qxDxGestacion(p){') + '\n' +
  uno(html, /function qxDxPrincipal\(p\)\{[^\n]*\}/) + '\n' +
  'return { dx:qxDxPrincipal, corte:qxFechaCorte, trim:qxTrimestreEco, usaEco:qxUsaEco };'
)(HOY);

// --- El Apps Script, con los servicios de Google simulados ---------------
const GOOGLE = new Function('Utilities', 'Session', gs +
  '; return { dx: dxPrincipal_, corte: fechaCorte_, trim: trimestreEco_, usaEco: usaEco_ };'
)({ formatDate: () => HOY }, { getScriptTimeZone: () => 'America/Lima' });

let fallos = 0;
const ok = (cond, txt, extra) => {
  if (!cond) fallos++;
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + txt + (cond || !extra ? '' : '\n        ' + extra));
};
const eq = (got, esp, txt) => ok(got === esp, txt, 'dio "' + got + '", esperaba "' + esp + '"');

const FUR = { fur: '2026-01-05', estado: 'programada' };
const ECO1 = { eco_fecha: '2026-03-10', eco_semanas: 12, eco_dias: 3 };   // 1.er trimestre
const ECO2 = { eco_fecha: '2026-05-20', eco_semanas: 20, eco_dias: 0 };   // 2.º
const ECO3 = { eco_fecha: '2026-08-20', eco_semanas: 34, eco_dias: 0 };   // 3.er

// =========================================================================
console.log('\nLA APP Y LAS HOJAS DEBEN DECIR LO MISMO\n');
const casos = [
  FUR,
  { ...ECO1, estado: 'en_tramite' },
  { ...ECO3, estado: 'apta_para_sala' },
  { ...FUR, ...ECO1 }, { ...FUR, ...ECO2 }, { ...FUR, ...ECO3 },
  { ...FUR, estado: 'operada', fecha_real_operacion: '2026-08-20' },
  { ...FUR, estado: 'suspendida', fecha_suspension: '2026-08-18' },
  { ...FUR, estado: 'referida', fecha_cierre: '2026-08-15' },
  { diagnostico: 'QUISTE DE BARTOLINO RECURRENTE', estado: 'programada' },
  { diagnostico: 'EU 36 SEMANAS 3 DÍAS X ECO I T', estado: 'programada' },
];
let dif = 0;
for (const c of casos) {
  if (APP.dx(c) !== GOOGLE.dx(c)) {
    dif++; fallos++;
    console.log('  ✗ ' + JSON.stringify(c) + '\n      app="' + APP.dx(c) + '"\n      hoja="' + GOOGLE.dx(c) + '"');
  }
}
ok(!dif, casos.length + ' fichas comparadas, todas coinciden');

// =========================================================================
console.log('\nEL TRIMESTRE SE DEDUCE DE LAS SEMANAS, NO SE PREGUNTA\n');
const trim = (sem) => APP.trim({ eco_fecha: '2026-03-10', eco_semanas: sem, eco_dias: 0 });
eq(trim(8), 1, '8 semanas → 1.er trimestre');
eq(trim(13), 1, '13 semanas todavía es 1.er trimestre');
eq(trim(14), 2, '14 semanas ya es 2.º');
eq(trim(27), 2, '27 semanas sigue siendo 2.º');
eq(trim(28), 3, '28 semanas → 3.er trimestre');
eq(trim(36), 3, '36 semanas → 3.er trimestre');
ok(GOOGLE.trim({ ...ECO2 }) === APP.trim({ ...ECO2 }), 'y Google deduce el mismo');

// =========================================================================
console.log('\nSOLO LA ECO DEL 1.er TRIMESTRE DESPLAZA A LA FUR\n');
const soloFur = APP.dx(FUR);
ok(APP.dx({ ...FUR, ...ECO1 }) !== soloFur, 'una eco de 1.er trimestre SÍ cambia el resultado');
ok(/x eco 1TRI$/.test(APP.dx({ ...FUR, ...ECO1 })), 'y lo dice: termina en "x eco 1TRI"');
eq(APP.dx({ ...FUR, ...ECO2 }), soloFur, 'una de 2.º trimestre NO cambia nada: sigue mandando la FUR');
eq(APP.dx({ ...FUR, ...ECO3 }), soloFur, 'una de 3.er trimestre tampoco');
ok(/x FUR$/.test(APP.dx({ ...FUR, ...ECO3 })), 'y el diagnóstico dice "x FUR", no la eco');
eq(APP.usaEco({ ...FUR, ...ECO2 }), false, 'la app lo sabe explícitamente');
ok(/x eco 3T$/.test(APP.dx({ ...ECO3, estado: 'programada' })),
  'sin FUR sí se usa la eco tardía, pero se advierte que es de 3.er trimestre');

// =========================================================================
console.log('\nLA CUENTA SE FRENA AL COMUNICAR EL DESENLACE\n');
const abierta = APP.dx(FUR);
for (const [estado, campo, fecha] of [
  ['operada', 'fecha_real_operacion', '2026-08-20'],
  ['suspendida', 'fecha_suspension', '2026-08-18'],
  ['referida', 'fecha_cierre', '2026-08-15'],
]) {
  const p = { ...FUR, estado, [campo]: fecha };
  ok(APP.dx(p) !== abierta, estado + ': deja de contar hasta hoy');
  eq(APP.corte(p), fecha, '   y se para exactamente el ' + fecha);
  eq(GOOGLE.dx(p), APP.dx(p), '   la hoja de GERESA dice lo mismo');
}
for (const estado of ['en_tramite', 'apta_para_sala', 'programada', 'hospitalizada']) {
  eq(APP.corte({ ...FUR, estado }), HOY, estado + ': sigue contando (no es un desenlace)');
}

// =========================================================================
console.log('\nSIN FUR NI ECO NO SE TOCA NADA\n');
eq(APP.dx({ diagnostico: 'QUISTE DE BARTOLINO RECURRENTE' }), 'QUISTE DE BARTOLINO RECURRENTE',
  'una paciente ginecológica sale igual que entró');
eq(APP.dx({ diagnostico: 'EU 36 SEMANAS 3 DÍAS X ECO I T, CESAREADA ANTERIOR' }),
  'EU 36 SEMANAS 3 DÍAS X ECO I T, CESAREADA ANTERIOR',
  'unas semanas escritas a mano SIN FUR ni eco se quedan quietas');
eq(APP.dx({}), '', 'sin nada, nada');

console.log('\n' + (fallos ? 'FALLA: ' + fallos + ' comprobación(es)' : 'OK: la app y las hojas dicen lo mismo, y paran a la vez.'));
process.exit(fallos ? 1 : 0);

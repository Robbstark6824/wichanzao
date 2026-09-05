// Prueba de regresión: cambiar la fecha de una cirugía (postergar) o volver a
// programar tras un "quitar fecha" no debe arrastrar datos de la
// programación ANTERIOR — ni el N° de orden del día viejo, ni el motivo de
// espera que ya no aplica ahora que sí hay fecha.
//
// Extrae las funciones reales de index.html y las corre contra un cliente y
// un DOM falsos que solo anotan lo escrito. No toca la base ni las hojas.
import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const fn = (firma) => {
  const a = html.indexOf(firma);
  if (a < 0) throw new Error('No se encontró: ' + firma);
  const b = html.indexOf('\n}\n', a);
  return html.slice(a, b + 3);
};

let calls = [];
const okSelect = (data) => ({ select: () => Promise.resolve({ data, error: null }) });
const sbFake = {
  from(tabla) {
    return {
      update(patch) { return { eq(_c, id) { calls.push({ tabla, tipo: 'update', patch }); return okSelect([{ id }]); } }; }
    };
  }
};

let QX_ACTUAL = null;
let campos = {};
const documentFake = {
  getElementById(id) { return { value: campos[id] !== undefined ? campos[id] : '' }; },
  querySelector() { return null; }
};

const api = new Function('sb', 'toast', 'qxSyncSheets', 'document', 'qxFmtFecha', 'qxSetEstado', 'qxRenderDetalle', 'qxLoad',
  'var QX_ACTUAL;\n' +
  'function qxSetQXActual(p){ QX_ACTUAL = p; }\n' +
  fn('async function qxProgramar(){') + '\n' +
  fn('async function qxRpPostergar(){') + '\n' +
  'return { qxSetQXActual: qxSetQXActual, qxProgramar: qxProgramar, qxRpPostergar: qxRpPostergar };'
)(sbFake, () => {}, () => {}, documentFake, (v) => v, async (p, nuevo) => { p.estado = nuevo; return true; }, () => {}, () => {});

let fallos = 0;
const check = (cond, txt) => { console.log((cond ? '  ✓ ' : '  ✗ ') + txt); if (!cond) fallos++; };

// --- Caso 1: postergar (cambiar de fecha) una ya programada ---------------
console.log('\nPostergar a otra fecha → no debe arrastrar el N° de orden ni el motivo viejo:');
calls = [];
const p1 = {
  id: 'p1', estado: 'programada', fecha_cirugia: '2026-09-10', turno: 'manana',
  orden_intervencion: '02', motivo_espera: 'Falta de insumos quirúrgicos', detalle_motivo_espera: 'sin sutura'
};
api.qxSetQXActual(p1);
campos = { qxRpFecha: '2026-09-20', qxRpTurno: 'tarde' };
await api.qxRpPostergar();
const upd1 = calls.find(c => c.tabla === 'pacientes');
check(!!upd1, 'escribe la fila');
check(upd1 && upd1.patch.fecha_cirugia === '2026-09-20' && upd1.patch.turno === 'tarde', 'guarda la fecha y turno nuevos');
check(upd1 && upd1.patch.orden_intervencion === null, 'suelta el N° de orden del día anterior');
check(upd1 && upd1.patch.motivo_espera === null && upd1.patch.detalle_motivo_espera === null, 'suelta el motivo de espera: ya no está esperando, tiene fecha');
check(p1.orden_intervencion === null && p1.motivo_espera === null, 'la pantalla queda coherente con la base');

// --- Caso 2: reprogramar (Fase 5) tras un "quitar fecha" con motivo -------
console.log('\nVolver a programar después de un "quitar fecha" con motivo → el motivo no debe seguir viajando:');
calls = [];
const p2 = {
  id: 'p2', estado: 'apta_para_sala', fecha_cirugia: null, turno: null,
  motivo_espera: 'Cama no disponible', detalle_motivo_espera: 'sala llena'
};
api.qxSetQXActual(p2);
campos = { qxFechaQx: '2026-09-25', qxTurno: 'manana' };
await api.qxProgramar();
const upd2 = calls.find(c => c.tabla === 'pacientes');
check(!!upd2, 'escribe la fila');
check(upd2 && upd2.patch.fecha_cirugia === '2026-09-25', 'guarda la fecha nueva');
check(upd2 && upd2.patch.motivo_espera === null && upd2.patch.detalle_motivo_espera === null, 'limpia el motivo de espera al fijar fecha');
check(p2.estado === 'programada', 'pasa a programada (estaba apta para sala)');
check(p2.motivo_espera === null, 'la pantalla queda coherente con la base');

console.log('\n' + (fallos ? 'FALLA: ' + fallos + ' comprobación(es)' : 'OK: cambiar o volver a programar nunca arrastra datos de la programación anterior.'));
process.exit(fallos ? 1 : 0);

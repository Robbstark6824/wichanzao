// Prueba de regresión: quitar la fecha de una cirugía programada NO puede dar
// "violates check constraint chk_programada_requiere_fecha_turno".
//
// La base rechaza la fila si el estado sigue siendo "programada" y la fecha
// queda vacía, así que el orden de escritura es lo único que importa: primero
// sacarla de la programación, después borrar la fecha.
//
// Extrae las funciones reales de index.html y las corre contra un cliente falso
// que solo anota las escrituras. No toca la base ni las hojas.
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
      update(patch) { return { eq(_c, id) { calls.push({ tabla, tipo: 'update', patch }); return okSelect([{ id }]); } }; },
      insert(row) { calls.push({ tabla, tipo: 'insert', row }); return Promise.resolve({ data: null, error: null }); }
    };
  }
};

const api = new Function('sb', 'toast', 'qxSyncSheets', 'qxAvisoCierreGeresa',
  html.match(/function qxEstadoTerminal\(e\)\{[^\n]*\}/)[0] + '\n' +
  html.match(/function qxFase4Completa\(p\)\{[^\n]*\}/)[0] + '\n' +
  fn('async function qxSetEstado(p, nuevo, motivo){') + '\n' +
  fn('async function qxQuitarFechaCirugia(p, motivo, detalle){') + '\n' +
  'return { qxQuitarFechaCirugia: qxQuitarFechaCirugia };'
)(sbFake, () => {}, () => {}, () => Promise.resolve(true));

let fallos = 0;
const check = (cond, txt) => { console.log((cond ? '  ✓ ' : '  ✗ ') + txt); if (!cond) fallos++; };

// --- Caso 1: paciente programada con fase 4 completa ----------------------
console.log('\nProgramada, fase 4 completa → debe volver a "apta para sala":');
calls = [];
const p1 = {
  id: 'p1', estado: 'programada', fecha_cirugia: '2026-09-10', turno: 'manana',
  hcl_hospitalizacion: true, consentimientos: true, solicitud_sala_dejada: true, recetas_entregadas: true
};
const ok1 = await api.qxQuitarFechaCirugia(p1, 'Falta de insumos quirúrgicos', 'sin sutura');
const upd1 = calls.filter(c => c.tabla === 'pacientes');

check(ok1 === true, 'la operación se completa');
check(upd1.length === 2, 'escribe la fila en dos pasos (fue ' + upd1.length + ')');
check(upd1[0] && upd1[0].patch.estado === 'apta_para_sala', 'PRIMERO cambia el estado a apta_para_sala');
check(upd1[0] && !('fecha_cirugia' in upd1[0].patch), 'ese primer paso NO toca la fecha (si lo hiciera, la base lo rechaza)');
check(upd1[1] && upd1[1].patch.fecha_cirugia === null && upd1[1].patch.turno === null, 'DESPUÉS borra fecha y turno');
check(upd1[1] && upd1[1].patch.motivo_espera === 'Falta de insumos quirúrgicos', 'guarda el motivo de espera que pide GERESA');
check(calls.some(c => c.tabla === 'historial_estados'), 'deja constancia en el historial');
check(p1.estado === 'apta_para_sala' && p1.fecha_cirugia === null, 'la pantalla queda coherente con la base');

// --- Caso 2: programada sin fase 4 completa -------------------------------
console.log('\nProgramada sin fase 4 completa → debe volver a "en trámite":');
calls = [];
const p2 = { id: 'p2', estado: 'programada', fecha_cirugia: '2026-09-10', turno: 'tarde', consentimientos: false };
await api.qxQuitarFechaCirugia(p2, '', '');
check(calls[0] && calls[0].patch.estado === 'en_tramite', 'vuelve a en_tramite');

// --- Caso 3: no estaba programada ----------------------------------------
console.log('\nNo estaba programada → no debe inventar un cambio de estado:');
calls = [];
const p3 = { id: 'p3', estado: 'apta_para_sala', fecha_cirugia: '2026-09-10', turno: 'manana' };
await api.qxQuitarFechaCirugia(p3, '', '');
check(!calls.some(c => c.tabla === 'historial_estados'), 'no escribe historial de más');
check(calls.length === 1 && calls[0].patch.fecha_cirugia === null, 'solo borra la fecha');

console.log('\n' + (fallos ? 'FALLA: ' + fallos + ' comprobación(es)' : 'OK: quitar la fecha nunca rompe la regla de la base.'));
process.exit(fallos ? 1 : 0);

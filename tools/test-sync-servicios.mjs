// Prueba de la sincronización multi-servicio SIN Google y SIN la base:
// un Google Sheets y un Supabase de mentira, en memoria.
//
//   node tools/test-sync-servicios.mjs
//
// 1) DIFERENCIAL — ginecología. Corre el Apps Script ANTERIOR (el de git, o el
//    que se pase con --viejo <archivo>) y el ACTUAL sobre el mismo estado
//    inicial —las hojas reales del respaldo y los pacientes reales— y compara
//    el resultado celda por celda: escribir a cada paciente, borrar uno y una
//    pasada completa del reconciliador. Tiene que dar idéntico.
// 2) CIRUGÍA GENERAL — que vaya SOLO a su hoja, que borrar no toque las de
//    gineco aunque el DNI se repita, que el reconciliador la ignore mientras
//    el servicio esté apagado y la separe bien cuando se encienda, y los
//    desplegables.
//
// Usa el respaldo de C:\Proyectos\respaldos-wichanzao (datos de pacientes:
// nunca dentro del repositorio).
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Hoja, cargar } from './emulador-apps-script.mjs';

const RESP = 'C:/Proyectos/respaldos-wichanzao';
const HOJAS = path.join(RESP, '2026-09-29_1509/hojas');
const args = process.argv.slice(2);
const iv = args.indexOf('--viejo');
const GS_VIEJO = iv >= 0 ? fs.readFileSync(args[iv + 1], 'utf8')
  : execSync('git show antes-multiservicio:google/apps-script-sync.gs', { encoding: 'utf8', maxBuffer: 1 << 26 });
const GS_NUEVO = fs.readFileSync('google/apps-script-sync.gs', 'utf8');

const ultimoRespaldo = fs.readdirSync(RESP).filter(d => /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(d)).sort().pop();
// Solo los de ginecología: el diferencial compara con el Apps Script de antes
// de que hubiera servicios, y el escenario "encender Cirugía General" parte
// de una base sin sus pacientes (desde el 29/09 los respaldos ya los traen).
const PACIENTES = JSON.parse(fs.readFileSync(path.join(RESP, ultimoRespaldo, 'datos/public.pacientes.json'), 'utf8'))
  .filter(p => (p.servicio || 'ginecologia') === 'ginecologia')
  .map(p => { const o = {}; for (const k in p) o[k] = p[k] instanceof Object && !(Array.isArray(p[k])) && p[k] !== null && p[k].constructor === Object ? p[k] : p[k]; return o; });
// Las fechas del respaldo vienen como ISO completas; la app manda 'YYYY-MM-DD'
// en columnas date. Se normalizan como las devolvería PostgREST.
const COLS_DATE = new Set();
const esquema = JSON.parse(fs.readFileSync(path.join(RESP, ultimoRespaldo, 'esquema.json'), 'utf8'));
esquema.columnas.filter(c => c.table_name === 'pacientes' && c.data_type === 'date').forEach(c => COLS_DATE.add(c.column_name));
PACIENTES.forEach(p => { for (const k of COLS_DATE) if (p[k]) p[k] = String(p[k]).slice(0, 10); });

const hojaDesdeJson = f => JSON.parse(fs.readFileSync(path.join(HOJAS, f), 'utf8'))
  .map(r => r.map(v => (v && v.__d) ? new Date(v.__d + 'T12:00:00Z') : v));

function oficialSintetica(G) {
  // La hoja oficial real no es pública; se arma con los encabezados que
  // escribe buildValuesNew, más filas de otros servicios/hospitales.
  const claves = Object.keys(G.buildValuesNew(PACIENTES[0]));
  const head = ['id registro'].concat(claves);
  const fila = (o) => head.map(k => o[k] ?? '');
  return [head,
    fila({ 'id registro': 1, dni: '11111111', 'apellidos y nombres completos': 'OTRO HOSPITAL UNO', 'especialidad quirurgica': 'CIRUGIA GENERAL', 'establecimiento quirurgico destino': 'HOSPITAL DISTRITAL EL PORVENIR' }),
    fila({ 'id registro': 2, dni: '22222222', 'apellidos y nombres completos': 'OTRO SERVICIO DOS', 'especialidad quirurgica': 'TRAUMATOLOGIA', 'establecimiento quirurgico destino': 'HOSPITAL DISTRITAL LAREDO' })];
}

function estadoInicial(G, { activos = ['ginecologia'], db = PACIENTES } = {}) {
  const e = { hojas: {}, db: JSON.parse(JSON.stringify(db)), activos };
  e.hojas['1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU|HOSPITAL LAREDO'] = new Hoja(hojaDesdeJson('gineco-hoja-antigua.json'));
  e.hojas['1XsoXl-4mv0CY1sSYi7MrLmf671rvoWC6Uf9xfXLngkc|HOSPITAL LAREDO'] = new Hoja(hojaDesdeJson('cirugia-general.json'));
  e.hojas['1IoT5KGuTcT83ZLyHh4SrLR4yhbFjIKkI|LISTA_ESPERA_QX'] = new Hoja(oficialSintetica(G));
  return e;
}
const foto = e => JSON.stringify(Object.keys(e.hojas).sort().map(k => [k, e.hojas[k].f.map(r => { const c = r.slice(); while (c.length && (c[c.length - 1] === '' || c[c.length - 1] == null)) c.pop(); return c; })]));
const sinVersion = o => { const c = JSON.parse(JSON.stringify(o)); delete c.version; return c; };
const ordenar = o => Array.isArray(o) ? o.map(ordenar) : (o && typeof o === 'object') ? Object.keys(o).sort().reduce((a, k) => (a[k] = ordenar(o[k]), a), {}) : o;
const igual = (a, b) => JSON.stringify(ordenar(a)) === JSON.stringify(ordenar(b));

let fallas = 0;
const ver = (d, ok, x) => { if (!ok) fallas++; console.log((ok ? '  OK    ' : '  FALLA ') + d + (x !== undefined ? '   ->  ' + x : '')); };

// ============ 1) DIFERENCIAL: ginecología ===================================
console.log('1) GINECOLOGÍA — Apps Script anterior vs actual, mismo estado inicial');
function escenarioGineco(gs) {
  const G0 = cargar(gs, { hojas: {}, db: [], activos: [] });
  const e = estadoInicial(G0);
  const G = cargar(gs, e);
  const resp = [];
  for (const p of e.db) resp.push(sinVersion(G.post({ paciente: p })));
  const borrada = e.db[3];
  resp.push(sinVersion(G.post({ accion: 'borrar', dni: borrada.dni })));
  // una fila escrita a mano en la hoja antigua, que el reconciliador debe traer
  const hA = e.hojas['1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU|HOSPITAL LAREDO'];
  const filaNueva = hA.getLastRow() + 1, cab = hA.f.findIndex(r => r.some(v => String(v).trim() === 'ID registro')) + 1;
  const col = n => hA.f[cab - 1].findIndex(v => String(v).trim() === n) + 1;
  hA.poner(filaNueva, col('DNI'), '99999999'); hA.poner(filaNueva, col('Apellidos y nombres completos'), 'PACIENTE ESCRITA A MANO');
  hA.poner(filaNueva, col('ID registro'), 900);
  const rec = G.reconciliar_(false);
  return { e, resp, rec: sinVersion(rec), ops: G.ops };
}
const V = escenarioGineco(GS_VIEJO), N = escenarioGineco(GS_NUEVO);
ver('las 3 hojas quedan idénticas celda por celda', foto(V.e) === foto(N.e));
ver('mismas respuestas a la app (' + V.resp.length + ' escrituras + 1 borrado)', igual(V.resp, N.resp));
// El informe cambió a propósito (sql/…, 29/09): las discrepancias falsas de
// "5231" vs "00005231" ya no se cuentan y hay una lista de posibles
// duplicados. Todo lo demás, igual; y solo pueden DESAPARECER discrepancias.
const sinInforme = r => { const c = JSON.parse(JSON.stringify(r)); delete c.discrepancias; delete c.duplicados; return c; };
ver('el reconciliador informa lo mismo (altas, rellenos, empujadas, errores)', igual(sinInforme(V.rec), sinInforme(N.rec)), JSON.stringify({ altas: N.rec.altas.length, rellenos: N.rec.rellenos.length, empujadas: N.rec.empujadas, errores: N.rec.errores }));
ver('discrepancias: solo desaparecen las falsas, no aparecen nuevas', (N.rec.discrepancias || []).every(d => (V.rec.discrepancias || []).indexOf(d) >= 0), (V.rec.discrepancias || []).length + ' → ' + (N.rec.discrepancias || []).length);
const quitarServ = ops => ops.map(o => o[0] === 'alta' ? ['alta', Object.fromEntries(Object.entries(o[1]).filter(([k]) => k !== 'servicio'))] : o);
ver('mismas altas y rellenos en la base (salvo servicio explícito)', igual(quitarServ(V.ops), quitarServ(N.ops)), N.ops.length + ' operaciones');
ver('las altas nuevas entran como ginecología', N.ops.filter(o => o[0] === 'alta').every(o => o[1].servicio === 'ginecologia'));
ver('la hoja de Cirugía General NO se tocó',
  JSON.stringify(N.e.hojas['1XsoXl-4mv0CY1sSYi7MrLmf671rvoWC6Uf9xfXLngkc|HOSPITAL LAREDO'].f) === JSON.stringify(hojaDesdeJson('cirugia-general.json')));

// ============ 2) CIRUGÍA GENERAL ============================================
console.log('\n2) CIRUGÍA GENERAL');
{
  const G0 = cargar(GS_NUEVO, { hojas: {}, db: [], activos: [] });
  const e = estadoInicial(G0);
  const G = cargar(GS_NUEVO, e);
  const antes = foto(e);
  const hCG = e.hojas['1XsoXl-4mv0CY1sSYi7MrLmf671rvoWC6Uf9xfXLngkc|HOSPITAL LAREDO'];
  const gineco = e.db[0];
  const cg = { id: 'cg-1', dni: gineco.dni, nombre: 'PACIENTE CIRUGIA PRUEBA', servicio: 'cirugia_general', sexo: 'Masculino',
    edad: 50, estado: 'en_tramite', diagnostico: 'HERNIA UMBILICAL', cie10: 'K42.9', nivel_cirugia: 'Mayor', tipo_seguro: 'SIS', id_registro: 500 };

  const r = G.post({ paciente: cg });
  ver('escribir responde ok, solo con su hoja', r.ok === true && !!r.antiguo && !('oficial' in r), JSON.stringify(sinVersion(r)).slice(0, 120));
  const filaCG = hCG.f.find(x => x.includes('PACIENTE CIRUGIA PRUEBA'));
  const cab = hCG.f.find(x => x.some(v => String(v).trim() === 'ID registro'));
  const valor = n => filaCG && filaCG[cab.findIndex(v => String(v).trim() === n)];
  ver('queda en la hoja de Cirugía General', !!filaCG);
  ver('especialidad CIRUGIA GENERAL', valor('Especialidad quirúrgica') === 'CIRUGIA GENERAL', valor('Especialidad quirúrgica'));
  ver('género en palabra completa, como su hoja', valor('Género') === 'Masculino', valor('Género'));
  const soloGineco = s => JSON.stringify(JSON.parse(s).filter(([k]) => !k.startsWith('1XsoXl')));
  ver('las hojas de gineco NO cambian (aunque el DNI sea de una paciente de gineco)', soloGineco(foto(e)) === soloGineco(antes));

  const antesBorrar = foto(e);
  const b = G.post({ accion: 'borrar', dni: gineco.dni, servicio: 'cirugia_general' });
  ver('borrar en Cirugía General responde ok', b.ok === true, JSON.stringify(sinVersion(b)).slice(0, 100));
  ver('borrar NO toca las hojas de gineco con el mismo DNI', soloGineco(foto(e)) === soloGineco(antesBorrar));
  ver('y sí saca la fila de Cirugía General', !hCG.f.some(x => x.includes('PACIENTE CIRUGIA PRUEBA')));

  const x = G.post({ paciente: Object.assign({}, cg, { servicio: 'traumatologia' }) });
  ver('servicio desconocido: error y no escribe nada', x.ok === false && /desconocido/.test(x.error || ''), x.error);
  const y = G.post({ accion: 'borrar', dni: gineco.dni });
  ver('borrar sin servicio (app vieja) = ginecología, como antes', y.ok === true && 'oficial' in y);
}
{
  console.log('\n   Posible duplicado en la hoja (el caso Zavaleta: DNI con un dígito cambiado)');
{
  const G0 = cargar(GS_NUEVO, { hojas: {}, db: [], activos: [] });
  const e = estadoInicial(G0, { activos: ['ginecologia'] });
  const G = cargar(GS_NUEVO, e);
  const hA = e.hojas['1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU|HOSPITAL LAREDO'];
  const cab = hA.f.findIndex(r => r.some(v => String(v).trim() === 'ID registro')) + 1;
  const col = n => hA.f[cab - 1].findIndex(v => String(v).trim() === n) + 1;
  const real = e.db[0];
  const typo = String(real.dni).slice(0, -1) + ((+String(real.dni).slice(-1) + 1) % 10);
  let fila = hA.getLastRow() + 1;
  hA.poner(fila, col('DNI'), typo); hA.poner(fila, col('Apellidos y nombres completos'), real.nombre); hA.poner(fila, col('ID registro'), 901);
  fila++;
  hA.poner(fila, col('DNI'), '77777777'); hA.poner(fila, col('Apellidos y nombres completos'), 'PERSONA REALMENTE NUEVA'); hA.poner(fila, col('ID registro'), 902);
  const rec = G.reconciliar_(false);
  const altas = G.ops.filter(o => o[0] === 'alta').map(o => o[1].dni);
  ver('el DNI mal tipeado NO se importa como paciente nueva', altas.indexOf(typo) < 0, altas.join(','));
  ver('queda como posible duplicado, con el motivo', rec.duplicados.length === 1 && /un dígito/.test(rec.duplicados[0]) && /mismo nombre/.test(rec.duplicados[0]), rec.duplicados[0]);
  ver('una persona realmente nueva sí se importa', altas.indexOf('77777777') >= 0);
}

console.log('\n   Reconciliador con Cirugía General APAGADA');
  const G0 = cargar(GS_NUEVO, { hojas: {}, db: [], activos: [] });
  const e = estadoInicial(G0, { activos: ['ginecologia'] });
  const G = cargar(GS_NUEVO, e);
  const rec = G.reconciliar_(true);
  ver('no trae a nadie de la hoja de Cirugía General', !rec.altas.some(a => /cirug/.test(a)), rec.altas.length + ' altas');
}
{
  console.log('\n   Reconciliador con Cirugía General ENCENDIDA (simulación, como en la Fase 5)');
  const G0 = cargar(GS_NUEVO, { hojas: {}, db: [], activos: [] });
  const e = estadoInicial(G0, { activos: ['ginecologia', 'cirugia_general'] });
  const G = cargar(GS_NUEVO, e);
  const rec = G.reconciliar_(false);
  const altasCG = G.ops.filter(o => o[0] === 'alta' && o[1].servicio === 'cirugia_general');
  ver('trae las filas de su hoja como Cirugía General', altasCG.length > 0, altasCG.length + ' altas');
  ver('ninguna alta de Cirugía General queda como gineco', G.ops.filter(o => o[0] === 'alta').every(o => o[1].servicio === (/cirug/.test(o[1].especialidad || '') || /CIRUGIA/.test(o[1].especialidad || '') ? 'cirugia_general' : o[1].servicio)));
  const rellenosEnGineco = G.ops.filter(o => o[0] === 'relleno' && (e.db.find(p => p.id === o[1]) || {}).servicio !== 'ginecologia' && !String(o[1]).startsWith('nuevo'));
  ver('no rellena pacientes de gineco con datos de Cirugía General', rellenosEnGineco.length === 0, rellenosEnGineco.length);
  ver('sin errores', rec.errores.length === 0, rec.errores.join(' | '));
  const hG = e.hojas['1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU|HOSPITAL LAREDO'];
  const cgEnGineco = hG.f.filter(r => r.includes('CIRUGIA GENERAL')).length;
  ver('al empujar, nadie de Cirugía General termina en la hoja de gineco', cgEnGineco === 0, cgEnGineco);
}
{
  console.log('\n   Desplegables');
  const G0 = cargar(GS_NUEVO, { hojas: {}, db: [], activos: [] });
  const e = estadoInicial(G0);
  const G = cargar(GS_NUEVO, e);
  const hCG = e.hojas['1XsoXl-4mv0CY1sSYi7MrLmf671rvoWC6Uf9xfXLngkc|HOSPITAL LAREDO'];
  const sim = G.desplegables_(G.SS_ID_CG, 'HOSPITAL LAREDO', true);
  ver('probar: no pone nada', Object.keys(hCG.dv).length === 0);
  ver('probar: encuentra las 9 columnas', (sim.match(/  ✓ /g) || []).length === 9, (sim.match(/  ✗ .*/g) || []).join(' '));
  console.log(sim.split('\n').filter(l => /fuera de la lista/.test(l)).map(l => '        ' + l.trim().slice(0, 150)).join('\n'));
  const antes = JSON.stringify(hCG.f);
  G.desplegables_(G.SS_ID_CG, 'HOSPITAL LAREDO', false);
  const cab = hCG.f.findIndex(r => r.some(v => String(v).trim() === 'ID registro')) + 1;
  const colG = hCG.f[cab - 1].findIndex(v => String(v).trim() === 'Género') + 1;
  const dvG = hCG.dv[(cab + 1) + ',' + colG];
  ver('poner: Género con Masculino/Femenino desde la fila siguiente al encabezado', !!dvG && dvG.lista.join() === 'Masculino,Femenino' && !hCG.dv[cab + ',' + colG]);
  ver('poner: no cambia ningún valor ya escrito', JSON.stringify(hCG.f) === antes);
  ver('poner: no toca las hojas de gineco', Object.keys(e.hojas).filter(k => !k.startsWith('1XsoXl')).every(k => Object.keys(e.hojas[k].dv).length === 0));
}

console.log('\n' + (fallas ? fallas + ' FALLA(S)' : 'Todo en orden.'));
process.exitCode = fallas ? 1 : 0;

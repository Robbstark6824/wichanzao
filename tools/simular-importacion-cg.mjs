// Ensayo de ENCENDER Cirugía General, sin escribir nada real.
//
//   node tools/simular-importacion-cg.mjs
//
// Corre el reconciliador DE VERDAD (google/apps-script-sync.gs) en el
// emulador, con:
//   · la hoja de Cirugía General tal como está AHORA (xlsx público),
//   · los pacientes que hay AHORA en la base (lectura con la clave de .env),
//   · Cirugía General activa, como quedará en la tabla servicios.
// Y muestra: con qué estado entraría cada paciente, qué cambiaría en su hoja
// al devolverlos (celda por celda) y que las hojas de gineco no se tocan.
//
// La hoja trae datos de pacientes: la copia descargada va a
// C:\Proyectos\respaldos-wichanzao, nunca al repositorio.
import fs from 'fs';
import { execSync } from 'child_process';
import { Hoja, cargar } from './emulador-apps-script.mjs';

const DEST = 'C:/Proyectos/respaldos-wichanzao/cg-simulacion';
fs.mkdirSync(DEST, { recursive: true });
const ID_CG = '1XsoXl-4mv0CY1sSYi7MrLmf671rvoWC6Uf9xfXLngkc';

function bajar(id, nombre) {
  const xlsx = DEST + '/' + nombre + '.xlsx', json = DEST + '/' + nombre + '.json', py = DEST + '/volcar.py';
  execSync(`curl -sL -o "${xlsx}" "https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx"`);
  fs.writeFileSync(py, [
    'import openpyxl, json, datetime, warnings, sys',
    "warnings.filterwarnings('ignore')",
    "ws = openpyxl.load_workbook(sys.argv[1], data_only=True)['HOSPITAL LAREDO']",
    "rows = [[({'__d': c.isoformat()[:10]} if isinstance(c,(datetime.datetime,datetime.date)) else ('' if c is None else c)) for c in r] for r in ws.iter_rows(values_only=True)]",
    "while rows and all(v == '' for v in rows[-1]): rows.pop()",
    "json.dump(rows, open(sys.argv[2],'w',encoding='utf-8'), ensure_ascii=False)"
  ].join(String.fromCharCode(10)));
  execSync(`python "${py}" "${xlsx}" "${json}"`);
  return JSON.parse(fs.readFileSync(json, 'utf8')).map(r => r.map(v => (v && v.__d) ? new Date(v.__d + 'T12:00:00Z') : v));
}

const cg = bajar(ID_CG, 'cirugia-general-ahora');
const gin = bajar('1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU', 'gineco-ahora');

const KEY = fs.readFileSync('.env', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/)[1];
const db = await (await fetch('https://xqphjvppfgwabfruyjae.supabase.co/rest/v1/pacientes?select=*', {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
})).json();

const gs = fs.readFileSync('google/apps-script-sync.gs', 'utf8');
const G0 = cargar(gs, { hojas: {}, db: [], activos: [] });
const oficialHead = ['id registro'].concat(Object.keys(G0.buildValuesNew(db[0] || {})));
const estado = {
  hojas: {
    [ID_CG + '|HOSPITAL LAREDO']: new Hoja(cg),
    ['1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU|HOSPITAL LAREDO']: new Hoja(gin),
    ['1IoT5KGuTcT83ZLyHh4SrLR4yhbFjIKkI|LISTA_ESPERA_QX']: new Hoja([oficialHead])
  },
  db: JSON.parse(JSON.stringify(db)),
  activos: ['ginecologia', 'cirugia_general'],
  // Como en producción: lo de gineco ya se empujó en la última pasada.
  props: { ULTIMA_SYNC: new Date(Date.now() - 60000).toISOString(), ULTIMO_DIA_EG: '2026-09-29' }
};
const G = cargar(gs, estado);
const antes = { cg: JSON.stringify(estado.hojas[ID_CG + '|HOSPITAL LAREDO'].f), gin: JSON.stringify(gin) };
const rec = G.reconciliar_(false);

const altasCG = G.ops.filter(o => o[0] === 'alta' && o[1].servicio === 'cirugia_general').map(o => o[1]);
const cuenta = {};
altasCG.forEach(p => { cuenta[p.estado] = (cuenta[p.estado] || 0) + 1; });
console.log('Pacientes en la base ahora: ' + db.length + ' (' + db.filter(p => p.servicio === 'cirugia_general').length + ' de Cirugía General)');
console.log('Entrarían de la hoja de Cirugía General: ' + altasCG.length + ' → ' + JSON.stringify(cuenta));
console.log('  con anestesia: ' + altasCG.filter(p => p.tipo_anestesia).length + ' · con ID registro de la hoja: ' + altasCG.filter(p => p.id_registro != null).length
  + ' · con "NA": ' + altasCG.filter(p => p.laboratorio_na || p.ekg_na || p.riesgo_qx_na).length);
console.log('Altas de gineco: ' + G.ops.filter(o => o[0] === 'alta' && o[1].servicio !== 'cirugia_general').length
  + ' · rellenos: ' + G.ops.filter(o => o[0] === 'relleno').length + ' · empujadas: ' + rec.empujadas + ' · errores: ' + (rec.errores.join(' | ') || 'ninguno'));

// Su hoja, antes y después
const A = JSON.parse(antes.cg), D = estado.hojas[ID_CG + '|HOSPITAL LAREDO'].f;
const hi = A.findIndex(r => r.some(v => String(v).trim() === 'ID registro'));
const cab = A[hi];
const fechaTxt = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); return m ? m[3] + '/' + m[2] + '/' + m[1].slice(2) : v; };
const cambios = {}; let aTexto = 0, iguales = 0;
for (let i = hi + 1; i < Math.max(A.length, D.length); i++) {
  for (let j = 0; j < cab.length; j++) {
    const a0 = (A[i] || [])[j] ?? '', d1 = (D[i] || [])[j] ?? '';
    const d0 = d1 instanceof Date ? d1.toISOString() : d1;   // celda que nadie reescribió
    if (a0 === d0) { iguales++; continue; }
    const a = (typeof a0 === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(a0)) ? fechaTxt(a0) : String(a0).trim();
    const d = String(d0).trim();
    if (a === d) { if (a0 !== d0 && typeof a0 === 'string' && /T/.test(a0)) aTexto++; else iguales++; continue; }
    if (/^\d{4}-\d{2}-\d{2}T/.test(String(a0)) && fechaTxt(String(a0)) === d) { aTexto++; continue; }
    if (/^\d+(\.0)?$/.test(a) && /^\d+$/.test(d) && +a === +d) { iguales++; continue; }
    (cambios[cab[j]] = cambios[cab[j]] || []).push('fila ' + (i + 1) + ': ' + JSON.stringify(a0) + ' → ' + JSON.stringify(d0));
  }
}
console.log('\nSu hoja después de la primera pasada:');
console.log('  celdas iguales: ' + iguales + ' · fechas iguales que pasan a texto dd/mm/aa: ' + aTexto);
const cols = Object.keys(cambios);
console.log('  columnas con valores que cambian: ' + cols.length);
cols.sort((a, b) => cambios[b].length - cambios[a].length).forEach(k => {
  console.log('   · ' + k + ' — ' + cambios[k].length);
  cambios[k].slice(0, 5).forEach(x => console.log('       ' + x));
  if (cambios[k].length > 5) console.log('       …');
});
console.log('\nHoja de gineco intacta: ' + (JSON.stringify(estado.hojas['1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU|HOSPITAL LAREDO'].f) === antes.gin ? 'sí' : 'NO'));
console.log('Filas de Cirugía General en la hoja oficial: ' + estado.hojas['1IoT5KGuTcT83ZLyHh4SrLR4yhbFjIKkI|LISTA_ESPERA_QX'].f.filter(r => r.includes('CIRUGIA GENERAL')).length);

// Segunda pasada, 15 minutos después: no debería encontrar nada nuevo.
const rec2 = G.reconciliar_(false);
console.log('\nSegunda pasada → altas: ' + rec2.altas.length + ' · rellenos: ' + rec2.rellenos.length
  + ' · empujadas: ' + rec2.empujadas + ' · discrepancias: ' + rec2.discrepancias.length + ' · errores: ' + rec2.errores.length);
rec2.rellenos.forEach(d => console.log("   ~ " + d));

/* SOLO LECTURA. Compara cada catálogo oficial de GERESA (pestaña CATALOGOS,
   más CAT_ORIGEN y CAT_DESTINO) contra las opciones que ofrece la app, para
   comprobar que todo desplegable del formato existe dentro de index.html.
   Uso: node tools/auditar-catalogos.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SS = 'https://docs.google.com/spreadsheets/d/1IoT5KGuTcT83ZLyHh4SrLR4yhbFjIKkI/gviz/tq?tqx=out:csv&sheet=';

function parseCSV(t) {
  const R = []; let w = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i+1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else { if (c === '"') q = true; else if (c === ',') { w.push(f); f = ''; }
      else if (c === '\n') { w.push(f); R.push(w); w = []; f = ''; } else if (c === '\r') {} else f += c; } }
  if (f !== '' || w.length) { w.push(f); R.push(w); }
  return R;
}
const n = s => String(s ?? '').trim();
const k = s => n(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

const app = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
/* Un valor cuenta como "disponible desde la app" tanto si es una opción del
   formulario como si el Apps Script lo produce traduciendo un dato capturado:
   la app ofrece RAQUIDEA y el script escribe "Regional/General"; la app maneja
   el estado "operada" y el script escribe "Operado". Por eso se miran los dos
   archivos, no solo index.html. */
const gs = fs.readFileSync(path.join(ROOT, 'google', 'apps-script-sync.gs'), 'utf8');
const appK = k(app) + ' ' + k(gs);

/* Dónde vive cada catálogo dentro de la app. */
const DONDE = {
  'Género': 'paso 1 · select (solo Femenino: servicio de ginecología)',
  'Tipo de seguro': 'paso 1 · select',
  'Nivel de cirugía': 'paso 3 · select',
  'Tipo de anestesia': 'paso 3 · select (5 opciones → se traducen al catálogo)',
  'Tipo examen prequirúrgico': 'paso 4 · checks de Laboratorio y EKG + select del examen 3',
  'Aplica imágenes': 'paso 4 · select',
  'Resultado evaluación preoperatoria': 'paso 5 · select',
  'Estado programación': 'derivado del estado de la paciente',
  'Motivo de espera': 'paso 6 · select',
  'Estado actual paciente': 'derivado del estado de la paciente',
  'Motivo suspensión': 'diálogo Suspender · select',
  'Tipo cierre': 'derivado de la vía de cierre elegida',
  'Motivo cierre': 'diálogos Operada / Sin cirugía · select',
};

const cat = parseCSV(await (await fetch(SS + 'CATALOGOS')).text());
const cab = cat[0].map(n);

console.log('CATÁLOGO'.padEnd(36) + '│ VALORES │ EN LA APP │ DÓNDE');
console.log('─'.repeat(36) + '┼─────────┼───────────┼' + '─'.repeat(46));

let faltantes = [];
for (let c = 0; c < cab.length; c++) {
  const nombre = cab[c];
  if (!nombre || nombre.startsWith('Ver hoja')) continue;
  const vals = [];
  for (let r = 1; r < cat.length; r++) { const v = n(cat[r][c]); if (v) vals.push(v); }
  if (!vals.length) continue;
  const falta = vals.filter(v => !appK.includes(k(v)));
  if (falta.length) faltantes.push(nombre + ': ' + falta.join(', '));
  console.log(
    nombre.slice(0, 35).padEnd(36) + '│ ' + String(vals.length).padStart(7) + ' │ ' +
    (falta.length ? (vals.length - falta.length) + '/' + vals.length + ' ⚠️' : '     ✓   ').padEnd(9) + ' │ ' +
    (DONDE[nombre] || '—')
  );
}

/* Los dos catálogos grandes viven como buscador. */
for (const [tab, varName, donde] of [
  ['CAT_ORIGEN', 'QX_CAT_ORIGEN', 'paso 1 · buscador de establecimiento origen'],
  ['CAT_DESTINO', 'QX_CAT_DESTINO', 'paso 1 · buscador de hospital destino'],
]) {
  const filas = parseCSV(await (await fetch(SS + tab)).text()).slice(1).filter(r => n(r[0]));
  const ini = app.indexOf('var ' + varName + ' = [');
  const fin = app.indexOf('];', ini);
  const enApp = ini === -1 ? 0 : (app.slice(ini, fin).match(/\n\s*\[/g) || []).length;
  console.log(
    tab.slice(0, 35).padEnd(36) + '│ ' + String(filas.length).padStart(7) + ' │ ' +
    (enApp >= filas.length ? '     ✓   ' : enApp + '/' + filas.length + ' ⚠️').padEnd(9) + ' │ ' + donde
  );
  if (enApp < filas.length) faltantes.push(tab + ': la app tiene ' + enApp + ' de ' + filas.length);
}

console.log('\n' + (faltantes.length
  ? '⚠️  Faltan en la app:\n   ' + faltantes.join('\n   ')
  : '✓ Todos los catálogos del formato están disponibles dentro de la app.'));

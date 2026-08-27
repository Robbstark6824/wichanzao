/* SOLO LECTURA. Matriz de las 56 columnas del formato oficial:
   obligatoriedad · ¿está en las 47 del formato antiguo? · ¿de dónde sale? */
import fs from 'node:fs';

// (sin credenciales: solo lee las dos hojas públicas y el .gs del repo)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else { if (c === '"') inQ = true; else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') {} else field += c; }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const norm = s => String(s ?? '').trim();
const key = s => norm(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

/* --- cabeceras reales de ambas hojas --- */
const ofiRows = parseCSV(await (await fetch('https://docs.google.com/spreadsheets/d/1IoT5KGuTcT83ZLyHh4SrLR4yhbFjIKkI/gviz/tq?tqx=out:csv&sheet=LISTA_ESPERA_QX')).text());
const hOfi = ofiRows.findIndex(r => key(r[0]).includes('id registro'));
const OFI = ofiRows[hOfi].map(norm);
OFI[0] = 'ID registro';

const antRows = parseCSV(await (await fetch('https://docs.google.com/spreadsheets/d/1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU/export?format=csv')).text());
const hAnt = antRows.findIndex(r => key(r[0]) === 'id registro');
const ANT = new Set(antRows[hAnt].map(c => key(c)).filter(Boolean));

/* --- obligatoriedad, tal como la declara DICCIONARIO_DATOS --- */
const OBL = {
  'establecimiento quirurgico destino': 'OBLIGATORIO',
  'establecimiento origen que refiere': 'OBLIGATORIO',
  'fecha referencia aceptada': 'condicional · si el origen es una IPRESS real',
  'dni': 'OBLIGATORIO · alternativo con HC',
  'n° historia clinica': 'OBLIGATORIO · alternativo con DNI',
  'cie-10 principal': 'OBLIGATORIO',
  'diagnostico principal': 'OBLIGATORIO',
  'codigo procedimiento': 'recomendado',
  'procedimiento quirurgico propuesto': 'OBLIGATORIO',
  'tipo de anestesia': 'OBLIGATORIO',
  'f. primera evaluacion por cirugia': 'OBLIGATORIO',
  'tipo examen prequirurgico 1': 'condicional', 'tipo examen prequirurgico 2': 'condicional', 'tipo examen prequirurgico 3': 'condicional',
  'fecha examen prequirurgico 1': 'condicional', 'fecha examen prequirurgico 2': 'condicional', 'fecha examen prequirurgico 3': 'condicional',
  '¿aplica diagnostico por imagenes?': 'OBLIGATORIO',
  'f. diagnostico por imagenes': 'condicional · si aplica = Sí',
  'f. riesgo quirurgico': 'según avance',
  'f. evaluacion anestesica': 'según avance',
  'f. evaluacion preoperatoria por cirugia': 'según avance',
  'resultado evaluacion preoperatoria': 'según avance',
  'estado de programacion': 'OBLIGATORIO',
  'fecha programacion quirurgica': 'condicional · si está programada',
  'motivo de espera': 'condicional',
  'fecha suspension': 'condicional', 'motivo suspension': 'condicional', 'detalle motivo suspension': 'condicional',
  'tipo cierre': 'condicional', 'motivo cierre': 'condicional', 'fecha cierre': 'condicional',
};

/* --- de dónde sale cada columna (leído del Apps Script) --- */
const gs = fs.readFileSync(ROOT + '/google/apps-script-sync.gs', 'utf8');
const nuevo = gs.slice(gs.indexOf('function buildValuesNew'), gs.indexOf('function buildValuesOld'));
const viejo = gs.slice(gs.indexOf('function buildValuesOld'), gs.indexOf('function findHeaderRow'));
function fuente(bloque, k) {
  const re = new RegExp("v\\['" + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'\\]\\s*=\\s*([^;]+);");
  const m = bloque.match(re);
  return m ? m[1].trim().replace(/\s+/g, ' ') : null;
}

const filas = [];
for (const h of OFI) {
  if (!h) continue;
  const k = key(h);
  const f = fuente(nuevo, k);
  filas.push({
    col: h,
    obligatoriedad: OBL[k] || '—',
    en47: ANT.has(k) ? 'sí' : 'NO',
    escrita: f ? 'sí' : (k === 'id registro' ? 'sí (auto)' : 'NO'),
    fuente: f ? f.slice(0, 58) : (k === 'id registro' ? 'correlativo de la hoja' : '—'),
  });
}

const W = [42, 38, 5, 9, 58];
const head = ['COLUMNA OFICIAL (56)', 'OBLIGATORIEDAD GERESA', 'en47', 'la llena', 'de dónde sale'];
console.log(head.map((h, i) => h.padEnd(W[i])).join(' │ '));
console.log(W.map(w => '─'.repeat(w)).join('─┼─'));
for (const f of filas) {
  console.log([f.col, f.obligatoriedad, f.en47, f.escrita, f.fuente].map((c, i) => String(c).slice(0, W[i]).padEnd(W[i])).join(' │ '));
}
console.log('\nColumnas oficiales: ' + filas.length);
const huecos = filas.filter(f => f.obligatoriedad.startsWith('OBLIGATORIO') && f.escrita === 'NO').map(f => f.col);
console.log('Obligatorias que NADIE llena: ' + (huecos.length ? huecos.join(', ') : '(ninguna) ✓'));
console.log('Solo en la oficial (no están en las 47): ' + filas.filter(f => f.en47 === 'NO').map(f => f.col).join(' · '));

// Comprobación independiente después de la primera sincronización real:
// ni la base ni la hoja deben haber cambiado de contenido.
import fs from 'fs';

const SB = 'https://xqphjvppfgwabfruyjae.supabase.co';
const KEY = fs.readFileSync('.env', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/)[1];
const CSV = 'https://docs.google.com/spreadsheets/d/1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU/export?format=csv';

const pacientes = await (await fetch(SB + '/rest/v1/pacientes?select=dni,nombre,estado,id_registro,origen,updated_at&order=id_registro', {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
})).json();

console.log('BASE — ' + pacientes.length + ' pacientes\n');
pacientes.forEach(p => console.log(
  '  ' + String(p.id_registro ?? '—').padStart(3) + ' · ' +
  p.nombre.padEnd(30).slice(0, 30) + ' · ' + p.estado.padEnd(15) +
  ' · origen: ' + (p.origen || '(no consta)')
));

// ¿Alguien cambió de estado en el último cuarto de hora?
const corte = new Date(Date.now() - 15 * 60 * 1000).toISOString();
const hist = await (await fetch(SB + '/rest/v1/historial_estados?select=created_at,estado_anterior,estado_nuevo,paciente_id&created_at=gt.' + corte, {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
})).json();
console.log('\nCambios de estado en los últimos 15 min: ' + hist.length +
  (hist.length ? '  ← REVISAR' : '  (ninguno, correcto)'));

// La hoja: ninguna fila duplicada, ninguna perdida.
//
// Hay que parsear el CSV de verdad, no partir por saltos de línea: un
// diagnóstico con un salto dentro de la celda parte el renglón y aparecen
// filas fantasma. Pasó, y me hizo dar una falsa alarma.
function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const registros = parseCSV(await (await fetch(CSV)).text());
const cabecera = registros.findIndex(r => r.some(c => norm(c) === 'id registro'));
// Igual que el script: solo cuentan las filas con DNI Y nombre.
const bloque = registros.slice(cabecera + 1).filter(r => (r[9] || '').trim() && (r[10] || '').trim());

console.log('\nHOJA — ' + registros.length + ' registros · bloque GERESA desde la fila ' + (cabecera + 2));

let dup = 0, ausentes = 0;
for (const p of pacientes) {
  const veces = bloque.filter(r => (r[9] || '').trim() === p.dni).length;
  if (veces === 0) { console.log('  ✗ NO aparece: ' + p.nombre); ausentes++; }
  else if (veces > 1) { console.log('  ✗ DUPLICADA (' + veces + ' filas): ' + p.nombre); dup++; }
}
if (!dup && !ausentes) console.log('  ✓ las ' + pacientes.length + ' pacientes aparecen una sola vez');
console.log('  Filas con paciente en el bloque: ' + bloque.length + ' (deben ser ' + pacientes.length + ')');

const desconocidas = bloque.filter(r => !pacientes.some(p => p.dni === (r[9] || '').trim()));
console.log('  Filas en la hoja que la app no tiene: ' + desconocidas.length +
  (desconocidas.length ? '  ← ' + desconocidas.map(r => r[10]).join(', ') : ''));

// El registro histórico de febrero sigue donde estaba.
const historica = registros.findIndex(r => r.join(',').toUpperCase().includes('OTINIANO') && r.includes('70515665'));
console.log('\nRegistro histórico de Elizabeth (febrero): ' +
  (historica >= 0 ? '✓ intacto, fila ' + (historica + 1) : '✗ NO ESTÁ'));

/* Cruza CAT_DESTINO (21 hospitales, sin código) contra CAT_ORIGEN (334 con
   código) para recuperar el código único de cada hospital de destino. */
import fs from 'node:fs';

/* Uso: node tools/gen-cat-destino.mjs   → imprime el array QX_CAT_DESTINO listo
   para pegar en index.html. Solo lectura, sin credenciales. */
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
const k = s => n(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/* Quita palabras de relleno para poder emparejar "DISTRITAL PACASMAYO" con
   "HOSPITAL DISTRITAL PACASMAYO - PACASMAYO - PACASMAYO". */
const nucleo = s => k(s).replace(/\b(hospital|de|del|la|el|apoyo|ipress|centro|salud)\b/g, '').replace(/\s+/g, ' ').trim();

const dest = parseCSV(await (await fetch(SS + 'CAT_DESTINO')).text()).slice(1)
  .map(r => ({ nombre: n(r[0]), red: n(r[2]) })).filter(x => x.nombre);
const orig = parseCSV(await (await fetch(SS + 'CAT_ORIGEN')).text()).slice(1)
  .map(r => ({ sel: n(r[0]), cod: n(r[1]), nombre: n(r[2]), prov: n(r[3]), dist: n(r[4]) }))
  .filter(x => x.cod);

const porNucleo = new Map();
for (const o of orig) {
  const key = nucleo(o.nombre);
  if (key && !porNucleo.has(key)) porNucleo.set(key, o);
}

/* CAT_DESTINO y CAT_ORIGEN nombran distinto al mismo establecimiento. */
const ALIAS = { 'hospital distrital santa isabel': 'HOSPITAL DISTRITAL DE EL PORVENIR SANTA ISABEL' };

const salida = [];
let sin = 0;
for (const d of dest) {
  const key = nucleo(d.nombre);
  let hit = porNucleo.get(key);
  if (!hit && ALIAS[k(d.nombre)]) hit = porNucleo.get(nucleo(ALIAS[k(d.nombre)]));
  if (!hit) {
    // segundo intento: que el núcleo del destino esté contenido en el de origen
    for (const [kk, oo] of porNucleo) {
      if (kk.includes(key) || key.includes(kk)) { hit = oo; break; }
    }
  }
  if (hit) {
    salida.push([d.nombre, hit.cod, d.red, hit.prov, hit.dist]);
    console.log('✓ ' + d.nombre.padEnd(52) + ' → ' + hit.cod + '  (' + hit.prov + ' / ' + hit.dist + ')');
  } else {
    salida.push([d.nombre, '', d.red, '', '']);
    sin++;
    console.log('✗ ' + d.nombre.padEnd(52) + ' → sin código en CAT_ORIGEN');
  }
}
console.log('\n' + salida.length + ' hospitales de destino · ' + (salida.length - sin) + ' con código · ' + sin + ' sin código');

const js = 'var QX_CAT_DESTINO = [\n' +
  salida.map(r => '  ["' + r[0].replace(/"/g, '\\"') + '", "' + r[1] + '", "' + r[2] + '"]').join(',\n') +
  '\n];\n';

console.log(js);

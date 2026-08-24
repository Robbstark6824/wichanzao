/**
 * Completa el catálogo CIE-10 con los códigos faltantes de CIE-10-ES
 * (Ministerio de Sanidad de España / dataset CodiEsp, descripciones en español).
 * Fuente: tools/_codiesp_x/codiesp_codes/codiesp-D_codes.tsv
 * Conserva TODAS las entradas existentes; solo agrega lo que falta a nivel OMS
 * (códigos de 3-4 caracteres: categoría y subcategoría).
 *
 * Uso: node tools/merge-cie10-codiesp.js
 */
const fs = require('fs');

const compact = JSON.parse(fs.readFileSync('icons/cie10-data-compact.json', 'utf8'));
const ch = compact.ch;
const d = compact.d;
const seen = new Set(d.map(e => e[0]));
const before = d.length;

function key(c3) { return c3.charCodeAt(0) * 100 + parseInt(c3.slice(1, 3), 10); }
const chapters = Object.keys(ch).map(function (roman) {
  var r = ch[roman]; var p = r[1].split('-');
  return { roman: roman, start: p[0], end: p[1] };
});
function chapterFor(code) {
  var c3 = code.slice(0, 3);
  if (!/^[A-Z][0-9]{2}/.test(c3)) return null;
  var k = key(c3);
  for (var i = 0; i < chapters.length; i++) {
    if (key(chapters[i].start) <= k && k <= key(chapters[i].end)) return chapters[i].roman;
  }
  // Fallback para códigos en el borde del rango (K94/K95, V00, Y99...):
  // el capítulo cuyo rango de LETRAS contiene la letra del código.
  var L = c3.charCodeAt(0);
  for (var j = 0; j < chapters.length; j++) {
    if (chapters[j].start.charCodeAt(0) <= L && L <= chapters[j].end.charCodeAt(0)) return chapters[j].roman;
  }
  return null;
}

var whoRe = /^[A-Z][0-9]{2}(\.[0-9])?$/;   // nivel OMS
var tsv = fs.readFileSync('tools/_codiesp_x/codiesp_codes/codiesp-D_codes.tsv', 'utf8').split(/\r?\n/);
var added = 0, noChap = 0;
for (var i = 0; i < tsv.length; i++) {
  if (!tsv[i]) continue;
  var col = tsv[i].split('\t');
  var code = col[0];
  if (!whoRe.test(code)) continue;
  if (seen.has(code)) continue;
  var name = (col[1] || '').trim() || (col[2] || '').trim();   // español, o inglés si falta
  if (!name) continue;
  var roman = chapterFor(code);
  if (!roman) { noChap++; continue; }
  d.push([code, name, roman]);
  seen.add(code);
  added++;
}

d.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });

compact.d = d;
fs.writeFileSync('icons/cie10-data-compact.json', JSON.stringify(compact));

var full = d.map(function (e) {
  var info = ch[e[2]] || ['Sin clasificar', '?', 'medicina'];
  return { code: e[0], name: e[1], chapter: e[2], chName: info[0], range: info[1], specialty: info[2] };
});
fs.writeFileSync('icons/cie10-data.json', JSON.stringify(full));

console.log('Antes:', before);
console.log('Agregados desde CIE-10-ES:', added);
console.log('Omitidos (sin capítulo):', noChap);
console.log('TOTAL ahora:', d.length);
console.log('con subdivisión (.x):', d.filter(function (e) { return e[0].indexOf('.') !== -1; }).length);

/**
 * Completa el catálogo CIE-10 de la app SIN perder las entradas curadas.
 * - Mantiene icons/cie10-data-compact.json (10,824 entradas en español).
 * - Agrega los códigos faltantes desde la fuente oficial española
 *   (verasativa/CIE-10, descargada a tools/_cie_src.csv).
 * - Agrega el capítulo U (COVID-19, resistencia antimicrobiana) que ninguna
 *   fuente incluye, con nombres oficiales OMS.
 * Regenera ambos JSON (compact + full).
 *
 * Uso: node tools/merge-cie10-complete.js
 */
const fs = require('fs');

const compact = JSON.parse(fs.readFileSync('icons/cie10-data-compact.json', 'utf8'));
const ch = compact.ch;                 // {roman: [chName, range, specialty]}
const d = compact.d;                   // [[code, name, roman], ...]
const seen = new Set(d.map(e => e[0]));
const before = d.length;

// ── Chapter resolver ──────────────────────────────────────
function key(c3) { return c3.charCodeAt(0) * 100 + parseInt(c3.slice(1, 3), 10); }
const chapters = Object.keys(ch).map(function (roman) {
  var r = ch[roman]; var parts = r[1].split('-');
  return { roman: roman, start: parts[0], end: parts[1] };
});
function chapterFor(code) {
  var c3 = code.slice(0, 3);
  if (!/^[A-Z][0-9]{2}/.test(c3)) return null;
  var k = key(c3);
  for (var i = 0; i < chapters.length; i++) {
    if (key(chapters[i].start) <= k && k <= key(chapters[i].end)) return chapters[i].roman;
  }
  return null;
}
function dot(code) { return code.length <= 3 ? code : code.slice(0, 3) + '.' + code.slice(3); }

// ── Minimal CSV parser (handles quoted commas) ────────────
function parseLine(line) {
  var out = [], cur = '', inQ = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (inQ) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else { if (c === '"') inQ = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
  }
  out.push(cur); return out;
}

// ── Merge from official source (levels 2 = category, 3 = subcategory) ──
var addedSrc = 0, skippedNoChap = 0;
var src = fs.readFileSync('tools/_cie_src.csv', 'utf8').split(/\r?\n/);
for (var li = 1; li < src.length; li++) {
  if (!src[li]) continue;
  var cols = parseLine(src[li]);
  var code = cols[0], desc = cols[6], level = cols[7];
  if (level !== '2' && level !== '3') continue;      // skip chapter/block rows
  if (!code || code.indexOf('-') !== -1) continue;   // skip ranges
  var dc = dot(code);
  if (seen.has(dc)) continue;                        // keep existing curated entry
  var roman = chapterFor(dc);
  if (!roman) { skippedNoChap++; continue; }
  if (!desc) continue;
  d.push([dc, desc, roman]);
  seen.add(dc);
  addedSrc++;
}

// ── Capítulo U (OMS uso de emergencia) — ninguna fuente lo trae ──
var U = [
  ['U04', 'Síndrome respiratorio agudo severo [SARS]'],
  ['U04.9', 'Síndrome respiratorio agudo severo [SARS], no especificado'],
  ['U07.0', 'Trastornos respiratorios por el uso de cigarrillos electrónicos [vapeo]'],
  ['U07.1', 'COVID-19, virus identificado'],
  ['U07.2', 'COVID-19, virus no identificado (diagnóstico clínico-epidemiológico)'],
  ['U08.9', 'Antecedente personal de COVID-19, no especificado'],
  ['U09.9', 'Afección posterior a COVID-19, no especificada'],
  ['U10.9', 'Síndrome inflamatorio multisistémico asociado a COVID-19, no especificado'],
  ['U12.9', 'Vacuna contra la COVID-19 causante de efecto adverso'],
  ['U82', 'Resistencia a los antibióticos betalactámicos'],
  ['U83', 'Resistencia a otros antibióticos'],
  ['U84', 'Resistencia a otros antimicrobianos'],
  ['U85', 'Resistencia a agentes antineoplásicos']
];
var addedU = 0;
U.forEach(function (u) {
  if (seen.has(u[0])) return;
  d.push([u[0], u[1], 'XXII']);
  seen.add(u[0]);
  addedU++;
});

// ── Subcategorías estándar (OMS/MINSA) ausentes en la fuente ──
var EXTRA = [
  ['A09.0', 'Otras gastroenteritis y colitis de origen infeccioso', 'I'],
  ['A09.9', 'Gastroenteritis y colitis de origen no especificado', 'I'],
  ['R19.7', 'Diarrea, no especificada', 'XVIII'],
  ['K35.2', 'Apendicitis aguda con peritonitis generalizada', 'XI'],
  ['K35.3', 'Apendicitis aguda con peritonitis localizada', 'XI'],
  ['K35.8', 'Apendicitis aguda, otra y la no especificada', 'XI']
];
var addedExtra = 0;
EXTRA.forEach(function (x) {
  if (seen.has(x[0])) return;
  d.push([x[0], x[1], x[2]]);
  seen.add(x[0]);
  addedExtra++;
});

// ── Sort canonically by code ──────────────────────────────
d.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });

// ── Write compact ─────────────────────────────────────────
compact.d = d;
fs.writeFileSync('icons/cie10-data-compact.json', JSON.stringify(compact));

// ── Regenerate full (array of objects) ────────────────────
var full = d.map(function (e) {
  var info = ch[e[2]] || ['Sin clasificar', '?', 'medicina'];
  return { code: e[0], name: e[1], chapter: e[2], chName: info[0], range: info[1], specialty: info[2] };
});
fs.writeFileSync('icons/cie10-data.json', JSON.stringify(full));

console.log('Antes:', before);
console.log('Agregados desde fuente oficial:', addedSrc);
console.log('Agregados capítulo U:', addedU);
console.log('Sin capítulo (omitidos):', skippedNoChap);
console.log('TOTAL ahora:', d.length);
console.log('con subdivisión (.x):', d.filter(function (e) { return e[0].indexOf('.') !== -1; }).length);

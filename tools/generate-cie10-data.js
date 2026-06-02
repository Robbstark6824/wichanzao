/**
 * Genera cie10-data.json y cie10-data-compact.json desde el archivo
 * CIE10_Codigos_Diagnosticos.md
 *
 * Uso: node tools/generate-cie10-data.js
 * Output:
 *   icons/cie10-data.json          — full JSON (con metadata por código)
 *   icons/cie10-data-compact.json  — compact JSON (~500KB, clave para la app)
 */

const fs = require('fs');
const path = require('path');

// Chapter definitions → compact format
// [start, end, roman, name, range, specialty]
const CHAPTERS = [
  ['A00','B99','I','Ciertas enfermedades infecciosas y parasitarias','A00-B99','medicina'],
  ['C00','D49','II','Neoplasias','C00-D49','medicina'],
  ['D50','D89','III','Enfermedades de la sangre y organos hematopoyeticos','D50-D89','medicina'],
  ['E00','E90','IV','Enfermedades endocrinas, nutricionales y metabolicas','E00-E90','medicina'],
  ['F00','F99','V','Trastornos mentales y del comportamiento','F00-F99','medicina'],
  ['G00','G99','VI','Enfermedades del sistema nervioso','G00-G99','medicina'],
  ['H00','H59','VII','Enfermedades del ojo y sus anexos','H00-H59','medicina'],
  ['H60','H95','VIII','Enfermedades del oido y de la apofisis mastoides','H60-H95','medicina'],
  ['I00','I99','IX','Enfermedades del sistema circulatorio','I00-I99','medicina'],
  ['J00','J99','X','Enfermedades del sistema respiratorio','J00-J99','medicina'],
  ['K00','K93','XI','Enfermedades del sistema digestivo','K00-K93','medicina'],
  ['L00','L99','XII','Enfermedades de la piel y el tejido subcutaneo','L00-L99','medicina'],
  ['M00','M99','XIII','Enfermedades del sistema osteomuscular','M00-M99','medicina'],
  ['N00','N99','XIV','Enfermedades del sistema genitourinario','N00-N99','medicina'],
  ['O00','O99','XV','Embarazo, parto y puerperio','O00-O99','gineco'],
  ['P00','P96','XVI','Ciertas afecciones originadas en el periodo perinatal','P00-P96','pediatria'],
  ['Q00','Q99','XVII','Malformaciones congenitas, deformidades y anomalias cromosomicas','Q00-Q99','pediatria'],
  ['R00','R99','XVIII','Sintomas, signos y hallazgos anormales clinicos y de laboratorio','R00-R99','medicina'],
  ['S00','T98','XIX','Traumatismos, envenenamientos y otras consecuencias de causas externas','S00-T98','cirugia'],
  ['V01','Y98','XX','Causas externas de morbilidad y de mortalidad','V01-Y98','medicina'],
  ['Z00','Z99','XXI','Factores que influyen en el estado de salud y contacto con servicios de salud','Z00-Z99','medicina'],
  ['U00','U99','XXII','Codigos para situaciones especiales','U00-U99','medicina'],
];

function parseRangeCode(code) {
  const match = code.match(/^([A-Z]\d{2})/);
  return match ? match[1] : code;
}

function assignChapter(code) {
  const baseCode = parseRangeCode(code);
  for (const ch of CHAPTERS) {
    if (baseCode >= ch[0] && baseCode <= ch[1]) {
      return ch[2]; // Roman numeral
    }
  }
  return '?';
}

function main() {
  const mdPath = path.resolve('C:/Proyectos/NEURO-ARSENAL WEB/backend/docs/_inbox/CIE10_Codigos_Diagnosticos.md');
  const content = fs.readFileSync(mdPath, 'utf8');
  const lines = content.split('\n');

  // Full data objects
  const codes = [];
  // Compact: [code, name, chapterRoman]
  const compactCodes = [];
  const seen = new Set();

  for (const line of lines) {
    const match = line.match(/\|\s*\*\*([^*]+)\*\*\s*\|\s*(.+?)\s*\|/);
    if (!match) continue;

    const code = match[1].trim();
    let name = match[2].trim();

    if (seen.has(code)) continue;
    seen.add(code);

    // Clean truncations
    name = name.replace(/\s+no\s*$/, ' no especificado');
    name = name.replace(/\s+sin\s*$/, ' sin otra especificacion');
    name = name.replace(/\s+especificada(s)?\s*$/, ' especificada$1');

    const ch = assignChapter(code);
    const chInfo = CHAPTERS.find(c => c[2] === ch) || CHAPTERS[0];

    codes.push({
      code, name,
      chapter: ch,
      chName: chInfo[3],
      range: chInfo[4],
      specialty: chInfo[5]
    });

    compactCodes.push([code, name, ch]);
  }

  // Sort
  const sorter = (a, b) => {
    const [aBase, aSub] = (typeof a === 'string' ? a : a.code || a[0]).split('.');
    const [bBase, bSub] = (typeof b === 'string' ? b : b.code || b[0]).split('.');
    if (aBase !== bBase) return aBase.localeCompare(bBase);
    return (parseInt(aSub) || 0) - (parseInt(bSub) || 0);
  };
  codes.sort((a, b) => sorter(a.code, b.code));
  compactCodes.sort((a, b) => sorter(a[0], b[0]));

  // Chapter lookup table for compact format
  const chLookup = {};
  CHAPTERS.forEach(ch => {
    chLookup[ch[2]] = [ch[3], ch[4], ch[5]]; // [name, range, specialty]
  });

  // Write full
  const fullPath = path.resolve('C:/Proyectos/wichanzao-final/icons/cie10-data.json');
  fs.writeFileSync(fullPath, JSON.stringify(codes), 'utf8');

  // Write compact: { ch: {...}, d: [[code, name, ch], ...] }
  const compactPath = path.resolve('C:/Proyectos/wichanzao-final/icons/cie10-data-compact.json');
  fs.writeFileSync(compactPath, JSON.stringify({ ch: chLookup, d: compactCodes }), 'utf8');

  // Stats
  const chapterCounts = {};
  compactCodes.forEach(c => {
    chapterCounts[c[2]] = (chapterCounts[c[2]] || 0) + 1;
  });

  console.log('=== CIE-10 Data Generado ===');
  console.log('Total codigos:', compactCodes.length);
  console.log('Full JSON:', (fs.statSync(fullPath).size / 1024).toFixed(1), 'KB');
  console.log('Compact JSON:', (fs.statSync(compactPath).size / 1024).toFixed(1), 'KB');
  console.log('\nPor capitulo:');
  Object.entries(chapterCounts).sort((a, b) => a[0].localeCompare(b[0])).forEach(([ch, n]) => {
    const info = chLookup[ch] || ['?', '?', '?'];
    console.log(`  ${ch.padEnd(5)} ${n.toString().padStart(4)} codigos  ${info[0]}`);
  });
}

main();

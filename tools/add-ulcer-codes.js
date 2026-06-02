/**
 * Agrega subcategorías de úlceras pépticas (K25-K28) a los JSON de CIE-10.
 * Cada categoría tiene subcategorías de aguda/crónica con/sin hemorragia/perforación.
 *
 * Uso: node tools/add-ulcer-codes.js
 */

const fs = require('fs');
const path = require('path');

const ULCER_TYPES = [
  ['K25', 'Úlcera gástrica'],
  ['K26', 'Úlcera duodenal'],
  ['K27', 'Úlcera péptica, de sitio no especificado'],
  ['K28', 'Úlcera gastroyeyunal'],
];

const ULCER_COMPLICATIONS = [
  ['.0', 'Aguda con hemorragia'],
  ['.1', 'Aguda con perforación'],
  ['.2', 'Aguda con hemorragia y perforación'],
  ['.3', 'Aguda sin hemorragia ni perforación'],
  ['.4', 'Crónica o no especificada con hemorragia'],
  ['.5', 'Crónica o no especificada con perforación'],
  ['.6', 'Crónica o no especificada con hemorragia y perforación'],
  ['.7', 'Crónica sin hemorragia ni perforación'],
  ['.9', 'No especificada como aguda ni crónica, sin hemorragia ni perforación'],
];

const CHAPTER = 'XI';

function addUlcerCodes() {
  const compactPath = path.resolve('C:/Proyectos/wichanzao-final/icons/cie10-data-compact.json');
  const fullPath = path.resolve('C:/Proyectos/wichanzao-final/icons/cie10-data.json');

  // ── Compact JSON ────────────────────────────
  const compactRaw = fs.readFileSync(compactPath, 'utf8');
  const compact = JSON.parse(compactRaw);

  // Eliminar encabezados K25-K28
  const topLevelCodes = new Set(['K25', 'K26', 'K27', 'K28']);
  const filtered = compact.d.filter(entry => !topLevelCodes.has(entry[0]));
  const removedCount = compact.d.length - filtered.length;
  console.log(`Removidos ${removedCount} encabezados`);

  // Agregar subcategorías
  let addedCount = 0;
  for (const [baseCode, baseName] of ULCER_TYPES) {
    for (const [suffix, complication] of ULCER_COMPLICATIONS) {
      const code = baseCode + suffix;
      const name = `${baseName}, ${complication.charAt(0).toLowerCase() + complication.slice(1)}`;
      filtered.push([code, name, CHAPTER]);
      addedCount++;
    }
  }

  // Reordenar
  filtered.sort((a, b) => {
    const [aBase, aSub] = a[0].split('.');
    const [bBase, bSub] = b[0].split('.');
    if (aBase !== bBase) return aBase.localeCompare(bBase);
    return (parseInt(aSub) || 0) - (parseInt(bSub) || 0);
  });

  compact.d = filtered;
  fs.writeFileSync(compactPath, JSON.stringify(compact), 'utf8');
  console.log(`Compact JSON: ${addedCount} subcategorías de úlceras agregadas (${filtered.length} total)`);

  // ── Full JSON ──────────────────────────────
  const fullRaw = fs.readFileSync(fullPath, 'utf8');
  const full = JSON.parse(fullRaw);

  const fullFiltered = full.filter(entry => !topLevelCodes.has(entry.code));

  const chInfo = compact.ch[CHAPTER] || ['Enfermedades del sistema digestivo', 'K00-K93', 'medicina'];
  const [chName, range, specialty] = chInfo;

  for (const [baseCode, baseName] of ULCER_TYPES) {
    for (const [suffix, complication] of ULCER_COMPLICATIONS) {
      const code = baseCode + suffix;
      const name = `${baseName}, ${complication.charAt(0).toLowerCase() + complication.slice(1)}`;
      fullFiltered.push({
        code,
        name,
        chapter: CHAPTER,
        chName,
        range,
        specialty
      });
    }
  }

  fullFiltered.sort((a, b) => {
    const [aBase, aSub] = a.code.split('.');
    const [bBase, bSub] = b.code.split('.');
    if (aBase !== bBase) return aBase.localeCompare(bBase);
    return (parseInt(aSub) || 0) - (parseInt(bSub) || 0);
  });

  fs.writeFileSync(fullPath, JSON.stringify(fullFiltered), 'utf8');
  console.log(`Full JSON: ${fullFiltered.length} códigos totales`);

  // ── Verificación ──────────────────────────
  const verify = JSON.parse(fs.readFileSync(compactPath, 'utf8'));
  const ulcerCodes = verify.d.filter(e => e[0].match(/^K2[5-8]/));
  console.log('\n=== CÓDIGOS DE ÚLCERAS AGREGADOS ===');
  ulcerCodes.forEach(e => console.log(`  ${e[0]} | ${e[1]}`));
  console.log(`\nTotal códigos de úlceras: ${ulcerCodes.length}`);
}

addUlcerCodes();

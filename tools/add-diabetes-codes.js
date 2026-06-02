/**
 * Agrega las subcategorías faltantes de diabetes (E10-E14) a los JSON de CIE-10.
 * Cada categoría (E10-E14) tiene 9 subcategorías de complicaciones (.0-.9).
 *
 * Uso: node tools/add-diabetes-codes.js
 */

const fs = require('fs');
const path = require('path');

// Definición de subcategorías para cada tipo de diabetes
const DIABETES_TYPES = [
  ['E10', 'Diabetes mellitus insulinodependiente'],
  ['E11', 'Diabetes mellitus no insulinodependiente'],
  ['E12', 'Diabetes mellitus asociada con desnutrición'],
  ['E13', 'Otras diabetes mellitus especificadas'],
  ['E14', 'Diabetes mellitus, no especificada'],
];

const COMPLICATIONS = [
  ['.0', 'Con coma'],
  ['.1', 'Con cetoacidosis'],
  ['.2', 'Con complicaciones renales'],
  ['.3', 'Con complicaciones oftálmicas'],
  ['.4', 'Con complicaciones neurológicas'],
  ['.5', 'Con alteraciones de la circulación periférica'],
  ['.6', 'Con otras complicaciones especificadas'],
  ['.7', 'Con complicaciones múltiples'],
  ['.8', 'Con complicaciones no especificadas'],
  ['.9', 'Sin mención de complicación'],
];

// Capítulo IV = endocrino
const CHAPTER = 'IV';

function addDiabetesCodes() {
  const compactPath = path.resolve('C:/Proyectos/wichanzao-final/icons/cie10-data-compact.json');
  const fullPath = path.resolve('C:/Proyectos/wichanzao-final/icons/cie10-data.json');

  // ── Compact JSON ────────────────────────────
  const compactRaw = fs.readFileSync(compactPath, 'utf8');
  const compact = JSON.parse(compactRaw);

  // Eliminar solo los encabezados E10-E14 (dejamos sus subcategorías)
  const topLevelCodes = new Set(['E10', 'E11', 'E12', 'E13', 'E14']);
  const filtered = compact.d.filter(entry => !topLevelCodes.has(entry[0]));

  // Agregar todas las subcategorías de diabetes
  let addedCount = 0;
  for (const [baseCode, baseName] of DIABETES_TYPES) {
    for (const [suffix, complication] of COMPLICATIONS) {
      const code = baseCode + suffix;
      const name = baseName + ', ' + complication.charAt(0).toLowerCase() + complication.slice(1);
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
  console.log(`Compact JSON: ${addedCount} códigos de diabetes agregados (${filtered.length} total)`);

  // ── Full JSON ──────────────────────────────
  const fullRaw = fs.readFileSync(fullPath, 'utf8');
  const full = JSON.parse(fullRaw);

  const fullFiltered = full.filter(entry => !topLevelCodes.has(entry.code));

  const chInfo = compact.ch[CHAPTER] || ['Enfermedades endocrinas, nutricionales y metabólicas', 'E00-E90', 'medicina'];
  const [chName, range, specialty] = chInfo;

  for (const [baseCode, baseName] of DIABETES_TYPES) {
    for (const [suffix, complication] of COMPLICATIONS) {
      const code = baseCode + suffix;
      const name = baseName + ', ' + complication.charAt(0).toLowerCase() + complication.slice(1);
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
  const diabetesCodes = verify.d.filter(e => e[0].match(/^E1[0-4]/));
  console.log('\n=== CÓDIGOS DE DIABETES AGREGADOS ===');
  diabetesCodes.forEach(e => console.log(`  ${e[0]} | ${e[1]}`));
  console.log(`\nTotal códigos de diabetes: ${diabetesCodes.length}`);
}

addDiabetesCodes();

/**
 * Agrega subcategorías de aborto O03-O06 (CIE-10 estándar).
 * Cada tipo de aborto tiene 10 subcategorías por completitud y complicaciones.
 *
 * Uso: node tools/add-abortion-codes.js
 */

const fs = require('fs');
const path = require('path');

const ABORT_TYPES = [
  ['O03', 'Aborto espontaneo'],
  ['O04', 'Aborto medico'],
  ['O05', 'Otro aborto'],
  ['O06', 'Aborto no especificado'],
];

const ABORT_COMPLICATIONS = [
  ['.0', 'incompleto, complicado con infeccion genital y pelviana'],
  ['.1', 'incompleto, complicado con hemorragia excesiva o tardia'],
  ['.2', 'incompleto, complicado con embolia'],
  ['.3', 'incompleto, con otras complicaciones y las no especificadas'],
  ['.4', 'incompleto, sin complicacion'],
  ['.5', 'completo o no especificado, complicado con infeccion genital y pelviana'],
  ['.6', 'completo o no especificado, complicado con hemorragia excesiva o tardia'],
  ['.7', 'completo o no especificado, complicado con embolia'],
  ['.8', 'completo o no especificado, con otras complicaciones y las no especificadas'],
  ['.9', 'completo o no especificado, sin complicacion'],
];

function addAbortionCodes() {
  const compactPath = path.resolve('C:/Proyectos/wichanzao-final/icons/cie10-data-compact.json');
  const fullPath = path.resolve('C:/Proyectos/wichanzao-final/icons/cie10-data.json');

  // Compact JSON
  const compact = JSON.parse(fs.readFileSync(compactPath, 'utf8'));
  const topSet = new Set(['O03','O04','O05','O06']);
  const filtered = compact.d.filter(e => !topSet.has(e[0]));
  console.log('Removidos ' + (compact.d.length - filtered.length) + ' encabezados');

  for (const [base, baseName] of ABORT_TYPES) {
    for (const [suffix, comp] of ABORT_COMPLICATIONS) {
      filtered.push([base + suffix, baseName + ', ' + comp, 'XV']);
    }
  }

  filtered.sort((a, b) => {
    const [aB, aS] = a[0].split('.'); const [bB, bS] = b[0].split('.');
    if (aB !== bB) return aB.localeCompare(bB);
    return (parseInt(aS)||0) - (parseInt(bS)||0);
  });

  compact.d = filtered;
  fs.writeFileSync(compactPath, JSON.stringify(compact), 'utf8');
  console.log('Compact JSON: ' + 40 + ' codigos agregados (' + filtered.length + ' total)');

  // Full JSON
  const full = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const fullFiltered = full.filter(e => !topSet.has(e.code));
  const chInfo = compact.ch['XV'] || ['Embarazo, parto y puerperio','O00-O99','gineco'];

  for (const [base, baseName] of ABORT_TYPES) {
    for (const [suffix, comp] of ABORT_COMPLICATIONS) {
      fullFiltered.push({
        code: base + suffix, name: baseName + ', ' + comp,
        chapter: 'XV', chName: chInfo[0], range: chInfo[1], specialty: chInfo[2]
      });
    }
  }

  fullFiltered.sort((a, b) => {
    const [aB, aS] = a.code.split('.'); const [bB, bS] = b.code.split('.');
    if (aB !== bB) return aB.localeCompare(bB);
    return (parseInt(aS)||0) - (parseInt(bS)||0);
  });

  fs.writeFileSync(fullPath, JSON.stringify(fullFiltered), 'utf8');
  console.log('Full JSON: ' + fullFiltered.length + ' codigos totales');

  // Verify
  const v = JSON.parse(fs.readFileSync(compactPath, 'utf8'));
  const codes = v.d.filter(e => e[0].match(/^O0[3-6]/));
  console.log('\n=== CODIGOS DE ABORTO ===');
  codes.forEach(e => console.log('  ' + e[0] + ' | ' + e[1]));
  console.log('Total: ' + codes.length);
}

addAbortionCodes();

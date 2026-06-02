/**
 * Agrega TODAS las subcategorías CIE-10 faltantes a los JSON.
 * Basado en el estándar CIE-10 oficial.
 *
 * Grupos agregados:
 *   F10-F19  Trastornos por uso de sustancias (90 codigos)
 *   N00-N07  Enfermedades glomerulares (80 codigos)
 *   L89      Ulceras por presion / decubito (5 codigos)
 *   K20      Esofagitis (3 codigos)
 *   K30      Dispepsia funcional (no tiene subcats oficiales)
 *
 * Uso: node tools/add-all-missing-subcategories.js
 */

const fs = require('fs');
const path = require('path');

// ── Definición de todas las subcategorías a agregar ──────────

const ADDITIONS = {
  // F10-F19: Trastornos mentales por uso de sustancias
  // Cada uno tiene 9 subcategorías estándar (.0-.9)
  'F': (function() {
    const substances = [
      ['F10', 'Trastornos mentales y del comportamiento debidos al uso de alcohol'],
      ['F11', 'Trastornos mentales y del comportamiento debidos al uso de opioides'],
      ['F12', 'Trastornos mentales y del comportamiento debidos al uso de cannabinoides'],
      ['F13', 'Trastornos mentales y del comportamiento debidos al uso de sedantes o hipnoticos'],
      ['F14', 'Trastornos mentales y del comportamiento debidos al uso de cocaina'],
      ['F15', 'Trastornos mentales y del comportamiento debidos al uso de otros estimulantes (incluyendo cafeina)'],
      ['F16', 'Trastornos mentales y del comportamiento debidos al uso de alucinogenos'],
      ['F17', 'Trastornos mentales y del comportamiento debidos al uso de tabaco'],
      ['F18', 'Trastornos mentales y del comportamiento debidos al uso de disolventes volatiles'],
      ['F19', 'Trastornos mentales y del comportamiento debidos al uso de multiples drogas y otras sustancias psicoactivas'],
    ];
    const complications = [
      ['.0', 'intoxicacion aguda'],
      ['.1', 'consumo perjudicial'],
      ['.2', 'sindrome de dependencia'],
      ['.3', 'sindrome de abstinencia'],
      ['.4', 'sindrome de abstinencia con delirium'],
      ['.5', 'trastorno psicotico'],
      ['.6', 'sindrome amnesico'],
      ['.7', 'trastorno psicotico residual y de comienzo tardio'],
      ['.8', 'otros trastornos mentales y del comportamiento'],
      ['.9', 'trastorno mental y del comportamiento, no especificado'],
    ];
    const result = [];
    for (const [base, baseName] of substances) {
      for (const [suffix, compName] of complications) {
        result.push([base + suffix, baseName + ', ' + compName, 'V']);
      }
    }
    return result;
  })(),

  // N00-N07: Enfermedades glomerulares
  'N': (function() {
    const glomerular = [
      ['N00', 'Sindrome nefritico agudo'],
      ['N01', 'Sindrome nefritico rapidamente progresivo'],
      ['N02', 'Hematuria recurrente y persistente'],
      ['N03', 'Sindrome nefritico cronico'],
      ['N04', 'Sindrome nefrotico'],
      ['N05', 'Sindrome nefritico no especificado'],
      ['N06', 'Proteinuria aislada con lesion morfologica especificada'],
      ['N07', 'Nefropatia hereditaria no clasificada en otra parte'],
    ];
    const morphology = [
      ['.0', 'anormalidad glomerular minima'],
      ['.1', 'lesiones glomerulares focales y segmentarias'],
      ['.2', 'glomerulonefritis membranosa difusa'],
      ['.3', 'glomerulonefritis proliferativa mesangial difusa'],
      ['.4', 'glomerulonefritis proliferativa endocapilar difusa'],
      ['.5', 'glomerulonefritis mesangiocapilar difusa'],
      ['.6', 'enfermedad por depositos densos'],
      ['.7', 'glomerulonefritis difusa en media luna'],
      ['.8', 'otras lesiones morfologicas'],
      ['.9', 'lesion morfologica no especificada'],
    ];
    const result = [];
    for (const [base, baseName] of glomerular) {
      for (const [suffix, morphName] of morphology) {
        result.push([base + suffix, baseName + ', ' + morphName, 'XIV']);
      }
    }
    return result;
  })(),

  // L89: Úlcera de decúbito / por presión — estadios
  'L89': [
    ['L89.0', 'Ulcera de decubito y zona de presion, estadio 1', 'XII'],
    ['L89.1', 'Ulcera de decubito y zona de presion, estadio 2', 'XII'],
    ['L89.2', 'Ulcera de decubito y zona de presion, estadio 3', 'XII'],
    ['L89.3', 'Ulcera de decubito y zona de presion, estadio 4', 'XII'],
    ['L89.9', 'Ulcera de decubito y zona de presion, no especificada', 'XII'],
  ],

  // K20: Esofagitis
  'K20': [
    ['K20.0', 'Esofagitis eosinofilica', 'XI'],
    ['K20.8', 'Otras esofagitis especificadas', 'XI'],
    ['K20.9', 'Esofagitis, no especificada', 'XI'],
  ],
};

// ── Main ─────────────────────────────────────────────────────
function addAllMissing() {
  const compactPath = path.resolve('C:/Proyectos/wichanzao-final/icons/cie10-data-compact.json');
  const fullPath = path.resolve('C:/Proyectos/wichanzao-final/icons/cie10-data.json');

  // ── Compact JSON ──────────────────────────
  const compact = JSON.parse(fs.readFileSync(compactPath, 'utf8'));

  // Eliminar encabezados que vamos a reemplazar
  const topLevelToRemove = new Set();
  for (const key of Object.keys(ADDITIONS)) {
    const entries = ADDITIONS[key];
    if (Array.isArray(entries[0])) {
      // Es array de arrays (F y N groups)
      const bases = new Set();
      for (const entry of entries) {
        const baseMatch = entry[0].match(/^([A-Z]\d{2})/);
        if (baseMatch) bases.add(baseMatch[1]);
      }
      for (const b of bases) topLevelToRemove.add(b);
    } else {
      // Es array simple (L89, K20)
      topLevelToRemove.add(key);
    }
  }

  console.log('Encabezados a reemplazar:', [...topLevelToRemove].sort().join(', '));

  const filtered = compact.d.filter(entry => !topLevelToRemove.has(entry[0]));
  const removedCount = compact.d.length - filtered.length;
  console.log('Removidos ' + removedCount + ' encabezados top-level');

  // Agregar todas las subcategorías
  let totalAdded = 0;
  for (const key of Object.keys(ADDITIONS)) {
    const entries = ADDITIONS[key];
    if (Array.isArray(entries[0]) && Array.isArray(entries[0])) {
      for (const entry of entries) {
        filtered.push([entry[0], entry[1], entry[2]]);
        totalAdded++;
      }
    } else {
      for (const entry of entries) {
        filtered.push([entry[0], entry[1], entry[2]]);
        totalAdded++;
      }
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
  console.log('Compact JSON: ' + totalAdded + ' subcategorias agregadas (' + filtered.length + ' total)');

  // ── Full JSON ────────────────────────────
  const full = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const fullFiltered = full.filter(entry => !topLevelToRemove.has(entry.code));

  // Helper: add entries to full JSON
  function addToFull(arr) {
    for (const entry of arr) {
      const code = entry[0], name = entry[1], chRoman = entry[2];
      const chInfo = compact.ch[chRoman] || ['Sin clasificar', '?-?', 'medicina'];
      fullFiltered.push({
        code, name,
        chapter: chRoman,
        chName: chInfo[0], range: chInfo[1], specialty: chInfo[2]
      });
    }
  }

  for (const key of Object.keys(ADDITIONS)) {
    const entries = ADDITIONS[key];
    if (Array.isArray(entries[0]) && Array.isArray(entries[0])) {
      addToFull(entries);
    } else {
      addToFull(entries);
    }
  }

  fullFiltered.sort((a, b) => {
    const [aBase, aSub] = a.code.split('.');
    const [bBase, bSub] = b.code.split('.');
    if (aBase !== bBase) return aBase.localeCompare(bBase);
    return (parseInt(aSub) || 0) - (parseInt(bSub) || 0);
  });

  fs.writeFileSync(fullPath, JSON.stringify(fullFiltered), 'utf8');
  console.log('Full JSON: ' + fullFiltered.length + ' codigos totales');

  // ── Verificación ──────────────────────────
  const verify = JSON.parse(fs.readFileSync(compactPath, 'utf8'));
  const verifyCounts = {};
  for (const entry of verify.d) {
    const ch = entry[2];
    verifyCounts[ch] = (verifyCounts[ch] || 0) + 1;
  }
  console.log('\n=== ESTADISTICAS FINALES ===');
  console.log('Total codigos: ' + verify.d.length);
  for (const [ch, count] of Object.entries(verifyCounts).sort()) {
    const info = verify.ch[ch] || ['?', '?', '?'];
    console.log('  Cap ' + ch + ': ' + count + ' codigos  ' + info[0]);
  }

  // ── Verificar grupos agregados ──────────
  console.log('\n=== VERIFICACION DE NUEVOS CODIGOS ===');
  for (const base of ['F10','F11','F17','N00','N04','L89','K20']) {
    const matches = verify.d.filter(e => e[0].startsWith(base));
    console.log('  ' + base + ': ' + matches.length + ' codigos');
    if (matches.length <= 10) {
      matches.forEach(e => console.log('    ' + e[0] + ' | ' + e[1]));
    }
  }
}

addAllMissing();

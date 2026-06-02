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

    // ── Fix truncated names ────────────────────────────
    // Per-code completions (most common)
    const COMP = {
      // O — Embarazo
      'O07.0':'Falla de la induccion medica del aborto, complicado por infeccion genital y pelviana',
      'O07.1':'Falla de la induccion medica del aborto, complicado por hemorragia excesiva o tardia',
      'O07.2':'Falla de la induccion medica del aborto, complicado por embolia',
      'O08':'Complicaciones consecutivas al aborto, al embarazo ectopico y al embarazo molar',
      'O08.0':'Infeccion genital y pelviana consecutiva al aborto, al embarazo ectopico y al embarazo molar',
      'O08.1':'Hemorragia excesiva o tardia consecutiva al aborto, al embarazo ectopico y al embarazo molar',
      'O08.2':'Embolia consecutiva al aborto, al embarazo ectopico y al embarazo molar',
      'O08.3':'Choque consecutivo al aborto, al embarazo ectopico y al embarazo molar',
      'O08.6':'Lesion de organos o tejidos de la pelvis consecutivo al aborto, al embarazo ectopico y al embarazo molar',
      'O08.7':'Otras complicaciones venosas consecutivas al aborto, al embarazo ectopico y al embarazo molar',
      'O08.9':'Complicacion no especificada consecutiva al aborto, al embarazo ectopico y al embarazo molar',
      'O10':'Hipertension preexistente que complica el embarazo, el parto y el puerperio',
      'O10.0':'Hipertension esencial preexistente que complica el embarazo, el parto y el puerperio',
      'O10.1':'Enfermedad cardiaca hipertensiva preexistente que complica el embarazo, el parto y el puerperio',
      'O10.3':'Enfermedad cardiorrenal hipertensiva preexistente que complica el embarazo, el parto y el puerperio',
      'O10.4':'Hipertension secundaria preexistente que complica el embarazo, el parto y el puerperio',
      'O10.9':'Hipertension preexistente no especificada, que complica el embarazo, el parto y el puerperio',
      'O11':'Trastornos hipertensivos preexistentes, con proteinuria agregada',
      'O12':'Edema y proteinuria gestacionales [inducidos por el embarazo], sin hipertension',
      'O13':'Hipertension gestacional [inducida por el embarazo], sin proteinuria significativa',
      'O14':'Hipertension gestacional [inducida por el embarazo], con proteinuria significativa',
      'O23':'Infeccion de las vias genitourinarias en el embarazo',
      'O23.3':'Infeccion de otras partes de las vias urinarias en el embarazo',
      'O23.4':'Infeccion no especificada de las vias urinarias en el embarazo',
      'O24.0':'Diabetes mellitus preexistente insulinodependiente, en el embarazo',
      'O24.1':'Diabetes mellitus preexistente no insulinodependiente, en el embarazo',
      'O24.2':'Diabetes mellitus preexistente relacionada con desnutricion, en el embarazo',
      'O24.3':'Diabetes mellitus preexistente, sin otra especificacion, en el embarazo',
      'O26.3':'Retencion de dispositivo anticonceptivo intrauterino en el embarazo',
      'O26.6':'Trastornos del higado en el embarazo, el parto y el puerperio',
      'O26.7':'Subluxacion de la sinfisis (del pubis) en el embarazo, el parto y el puerperio',
      'O26.8':'Otras complicaciones especificadas relacionadas con el embarazo',
      'O28':'Hallazgos anormales en el examen prenatal de la madre',
      'O28.0':'Hallazgo hematologico anormal en el examen prenatal de la madre',
      'O28.1':'Hallazgo bioquimico anormal en el examen prenatal de la madre',
      'O28.2':'Hallazgo citologico anormal en el examen prenatal de la madre',
      'O28.3':'Hallazgo ultrasonico anormal en el examen prenatal de la madre',
      'O28.4':'Hallazgo radiologico anormal en el examen prenatal de la madre',
      'O28.8':'Otros hallazgos anormales en el examen prenatal de la madre',
      'O28.9':'Hallazgo anormal no especificado en el examen prenatal de la madre',
      'O29.2':'Complicaciones del sistema nervioso central debidas a la anestesia durante el embarazo',
      'O31.1':'Embarazo que continua despues del aborto de un feto o mas',
      'O32':'Atencion materna por presentacion anormal del feto',
      'O32.3':'Atencion materna por presentacion de cara, de frente o de menton del feto',
      'O32.8':'Atencion materna por otras presentaciones anormales del feto',
      'O33':'Atencion materna por desproporcion conocida o presunta',
      'O34':'Atencion materna por anormalidades conocidas o presuntas de los organos pelvianos',
      'O34.9':'Atencion materna por anormalidad no especificada de organo pelviano',
      'O35.2':'Atencion materna por (presunta) enfermedad hereditaria en el feto',
      'O35.4':'Atencion materna por (presunta) lesion al feto debida al alcohol',
      'O35.8':'Atencion materna por otras (presuntas) anormalidades y lesiones del feto',
      'O41':'Otros trastornos del liquido amniotico y de las membranas',
      'O41.8':'Otros trastornos especificados del liquido amniotico y de las membranas',
      'O45.0':'Desprendimiento prematuro de la placenta con defecto de la coagulacion',
      'O61.9':'Fracaso no especificado de la induccion del trabajo de parto',
      'O62':'Anormalidades de la dinamica del trabajo de parto',
      'O62.4':'Contracciones uterinas hipertonicas, incoordinadas y prolongadas del trabajo de parto',
      'O64.0':'Trabajo de parto obstruido debido a rotacion incompleta de la cabeza fetal',
      'O64.4':'Trabajo de parto obstruido debido a presentacion de hombro',
      'O65.0':'Trabajo de parto obstruido debido a deformidad de la pelvis osea',
      'O65.1':'Trabajo de parto obstruido debido a estrechez general de la pelvis',
      'O65.2':'Trabajo de parto obstruido debido a disminucion del estrecho superior de la pelvis',
      'O65.3':'Trabajo de parto obstruido debido a disminucion del estrecho inferior de la pelvis',
      'O65.5':'Trabajo de parto obstruido debido a anomalias de los organos pelvianos de la madre',
      'O66.5':'Fracaso no especificado de la aplicacion de forceps o de ventosa extractora',
      'O67':'Trabajo de parto y parto complicados por hemorragia intraparto, no clasificados en otra parte',
      'O68':'Trabajo de parto y parto complicados por sufrimiento fetal',
      'O68.0':'Trabajo de parto y parto complicados por anomalia de la frecuencia cardiaca fetal',
      'O68.1':'Trabajo de parto y parto complicados por la presencia de meconio en el liquido amniotico',
      'O68.2':'Trabajo de parto y parto complicados por anomalia de la frecuencia cardiaca fetal con presencia de meconio en el liquido amniotico',
      'O69':'Trabajo de parto y parto complicados por problemas del cordon umbilical',
      'O69.0':'Trabajo de parto y parto complicados por prolapso del cordon umbilical',
      'O69.2':'Trabajo de parto y parto complicados por otros enredos del cordon umbilical',
      'O73.1':'Retencion de fragmentos de la placenta o de las membranas, sin hemorragia',
      'O74.3':'Complicaciones del sistema nervioso central por la anestesia durante el trabajo de parto y el parto',
      'O74.7':'Falla o dificultad en la intubacion durante el trabajo de parto y el parto',
      'O75':'Otras complicaciones del trabajo de parto y del parto, no clasificadas en otra parte',
      'O75.5':'Retraso del parto despues de la ruptura artificial de las membranas',
      'O75.9':'Complicacion no especificada del trabajo de parto y del parto',
      'O89.2':'Complicaciones del sistema nervioso central debidas a la anestesia durante el puerperio',
      'O90':'Complicaciones del puerperio, no clasificadas en otra parte',
      'O94':'Secuelas de complicaciones del embarazo, del parto y del puerperio',
      'O98':'Enfermedades maternas infecciosas y parasitarias clasificables en otra parte, que complican el embarazo, el parto y el puerperio',
      'O98.0':'Tuberculosis que complica el embarazo, el parto y el puerperio',
      'O98.4':'Hepatitis viral que complica el embarazo, el parto y el puerperio',
      'O98.5':'Otras enfermedades virales que complican el embarazo, el parto y el puerperio',
      'O98.6':'Enfermedades causadas por protozoarios que complican el embarazo, el parto y el puerperio',
      'O99':'Otras enfermedades maternas clasificables en otra parte, que complican el embarazo, el parto y el puerperio',
      'O99.2':'Enfermedades endocrinas, de la nutricion y del metabolismo que complican el embarazo, el parto y el puerperio',
      'O99.4':'Enfermedades del sistema circulatorio que complican el embarazo, el parto y el puerperio',
      'O99.5':'Enfermedades del sistema respiratorio que complican el embarazo, el parto y el puerperio',
      'O99.6':'Enfermedades del sistema digestivo que complican el embarazo, el parto y el puerperio',
      'O99.7':'Enfermedades de la piel y del tejido subcutaneo que complican el embarazo, el parto y el puerperio',
      'O99.8':'Otras enfermedades especificadas y afecciones que complican el embarazo, el parto y el puerperio',
      // Common truncations across all chapters
      'A15.1':'Tuberculosis del pulmon, confirmada unicamente por cultivo',
      'A16.7':'Tuberculosis respiratoria primaria, sin mencion de confirmacion bacteriologica o histologica',
      'A16.8':'Otras tuberculosis respiratorias, sin mencion de confirmacion bacteriologica o histologica',
      'A16.9':'Tuberculosis respiratoria no especificada, sin mencion de confirmacion bacteriologica o histologica',
      'A48.2':'Enfermedad de los legionarios no neumonica [fiebre de Pontiac]',
      'A54.1':'Infeccion gonococica del tracto genitourinario inferior con absceso periuretral y de glandulas accesorias',
      'A77':'Fiebre maculosa [rickettsiosis transmitida por garrapatas]',
      'A81':'Infecciones del sistema nervioso central por virus lento',
      'A92.8':'Otras fiebres virales especificadas transmitidas por mosquitos',
      'A93.8':'Otras fiebres virales especificadas transmitidas por artropodos',
      'B08':'Otras infecciones viricas caracterizadas por lesiones de la piel y de las membranas mucosas',
      'B08.8':'Otras infecciones virales especificadas, caracterizadas por lesiones de la piel y de las membranas mucosas',
      'B09':'Infeccion viral no especificada, caracterizada por lesiones de la piel y de las membranas mucosas',
      'B17.0':'Infeccion (superinfeccion) aguda por agente delta en el portador de hepatitis B',
      'B20.0':'Enfermedad por VIH, resultante en infeccion por micobacterias',
      'B20.2':'Enfermedad por VIH, resultante en enfermedad por citomegalovirus',
      'B20.6':'Enfermedad por VIH, resultante en neumonia por Pneumocystis jirovecii',
      'B20.9':'Enfermedad por VIH, resultante en enfermedad infecciosa o parasitaria no especificada',
      'B33':'Otras enfermedades virales, no clasificadas en otra parte',
      'B50.0':'Paludismo debido a Plasmodium falciparum con complicaciones cerebrales',
      'B81':'Otras helmintiasis intestinales, no clasificadas en otra parte',
      'B94':'Secuelas de otras enfermedades infecciosas y parasitarias y de las no especificadas',
      'B95':'Estreptococos y estafilococos como causa de enfermedades clasificadas en otros capitulos',
      'B95.5':'Estreptococo no especificado como causa de enfermedades clasificadas en otros capitulos',
      'B95.8':'Estafilococo no especificado, como causa de enfermedades clasificadas en otros capitulos',
      'B96':'Otros agentes bacterianos como causa de enfermedades clasificadas en otros capitulos',
      'B96.0':'Mycoplasma pneumoniae [M. pneumoniae] como causa de enfermedades clasificadas en otros capitulos',
      'B96.1':'Klebsiella pneumoniae [K. pneumoniae] como causa de enfermedades clasificadas en otros capitulos',
      'B96.3':'Haemophilus influenzae [H. influenzae] como causa de enfermedades clasificadas en otros capitulos',
      'B96.5':'Pseudomonas (aeruginosa) (mallei) (pseudomallei) como causa de enfermedades clasificadas en otros capitulos',
      'D00':'Carcinoma in situ de la cavidad bucal, del esofago y del estomago',
      'D00.0':'Carcinoma in situ del labio, de la cavidad bucal y de la faringe',
      'D01':'Carcinoma in situ de otros organos digestivos y de los no especificados',
      'D21':'Otros tumores benignos del tejido conjuntivo y de los tejidos blandos',
    };
    if (COMP[code]) { name = COMP[code]; }

    // Heuristic completions for common truncation patterns
    if (!COMP[code]) {
      // O chapter completions
      if (ch === 'XV') {
        // 'en el' at end → 'en el embarazo'
        if (/\ben el\s*$/.test(name)) name = name.replace(/\ben el\s*$/, 'en el embarazo');
        // 'en el embarazo, el' at end → full phrase
        else if (/\ben el embarazo, el\s*$/.test(name)) name = name.replace(/\ben el embarazo, el\s*$/, 'en el embarazo, el parto y el puerperio');
        // 'que complica el' at end → full phrase
        else if (/\bque complica el\s*$/.test(name)) name = name.replace(/\bque complica el\s*$/, 'que complica el embarazo, el parto y el puerperio');
        // 'el embarazo, el parto y el' at end → full phrase
        else if (/\bel embarazo, el parto y el\s*$/.test(name)) name = name.replace(/\bel embarazo, el parto y el\s*$/, 'el embarazo, el parto y el puerperio');
        // 'del embarazo, del' at end → full phrase
        else if (/\bdel embarazo, del\s*$/.test(name)) name = name.replace(/\bdel embarazo, del\s*$/, 'del embarazo, del parto y del puerperio');
        // 'trabajo de' at end → 'trabajo de parto'
        else if (/\btrabajo de\s*$/.test(name)) name = name.replace(/\btrabajo de\s*$/, 'trabajo de parto');
        // 'examen prenatal de la' at end → 'examen prenatal de la madre'
        else if (/\bexamen prenatal de la\s*$/.test(name)) name = name.replace(/\bexamen prenatal de la\s*$/, 'examen prenatal de la madre');
        // 'del trabajo de' at end → 'del trabajo de parto'
        else if (/\bdel trabajo de\s*$/.test(name)) name = name.replace(/\bdel trabajo de\s*$/, 'del trabajo de parto');
        // 'trabajo de parto y del' at end → 'trabajo de parto y del parto'
        else if (/\btrabajo de parto y del\s*$/.test(name)) name = name.replace(/\btrabajo de parto y del\s*$/, 'trabajo de parto y del parto');
        // 'del embarazo' at end (needs puerperio too)
        else if (/\bdel embarazo\s*$/.test(name) && name.includes('complica')) name += ', el parto y el puerperio';
        // 'en el examen prenatal' at end → 'en el examen prenatal de la madre'
        else if (/\ben el examen prenatal\s*$/.test(name)) name = name.replace(/\ben el examen prenatal\s*$/, 'en el examen prenatal de la madre');
        // 'embarazo, el parto y el' at end → full
        else if (/\bembarazo, el parto y el\s*$/.test(name)) name = name.replace(/\bembarazo, el parto y el\s*$/, 'embarazo, el parto y el puerperio');
      }
      // Generic completions
      // 'y del' at end → 'y del puerperio' (only for O chapter)
      if (ch === 'XV' && /\by del\s*$/.test(name) && !COMP[code]) {
        if (!/\by del puerperio\b/.test(name)) name += ' puerperio';
      }
      // 'no clasificadas en' at end → 'no clasificadas en otra parte'
      if (/\bno clasificadas en\s*$/.test(name)) name = name.replace(/\bno clasificadas en\s*$/, 'no clasificadas en otra parte');
      // 'no clasificados en' at end → 'no clasificados en otra parte'
      else if (/\bno clasificados en\s*$/.test(name)) name = name.replace(/\bno clasificados en\s*$/, 'no clasificados en otra parte');
      // 'clasificadas en' at end → 'clasificadas en otra parte'
      if (/\bclasificadas en\s*$/.test(name) && !/\bclasificadas en otra parte\b/.test(name)) name = name.replace(/\bclasificadas en\s*$/, 'clasificadas en otra parte');
      // 'causa de' at end → 'causa de enfermedades clasificadas en otros capitulos' (for B95-B97)
      if (/\bcausa de\s*$/.test(name) && ch === 'I') name = name.replace(/\bcausa de\s*$/, 'causa de enfermedades clasificadas en otros capitulos');
      // 'caracterizadas por' at end → 'caracterizadas por lesiones de la piel' (for B08-B09)
      if (/\bcaracterizadas por\s*$/.test(name) && ch === 'I') name = name.replace(/\bcaracterizadas por\s*$/, 'caracterizadas por lesiones de la piel y de las membranas mucosas');
    }

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

  // ── Inject missing diabetes subcategories ─────────────────
  // The markdown only has top-level E10-E14 headers without complication codes.
  // Real CIE-10 specifies .0–.9 subcategories for each diabetes type.
  const DIABETES_BASE = [
    ['E10', 'Diabetes mellitus insulinodependiente'],
    ['E11', 'Diabetes mellitus no insulinodependiente'],
    ['E12', 'Diabetes mellitus asociada con desnutricion'],
    ['E13', 'Otras diabetes mellitus especificadas'],
    ['E14', 'Diabetes mellitus, no especificada'],
  ];
  const DIABETES_COMP = [
    ['.0', 'con coma'],
    ['.1', 'con cetoacidosis'],
    ['.2', 'con complicaciones renales'],
    ['.3', 'con complicaciones oftalmicas'],
    ['.4', 'con complicaciones neurologicas'],
    ['.5', 'con alteraciones de la circulacion periferica'],
    ['.6', 'con otras complicaciones especificadas'],
    ['.7', 'con complicaciones multiples'],
    ['.8', 'con complicaciones no especificadas'],
    ['.9', 'sin mencion de complicacion'],
  ];
  const topLevelDiabetes = new Set(['E10','E11','E12','E13','E14']);

  // Remove top-level headers — we'll replace with detailed subcategories
  codes = codes.filter(c => !topLevelDiabetes.has(c.code));
  compactCodes = compactCodes.filter(c => !topLevelDiabetes.has(c[0]));

  for (const [base, baseName] of DIABETES_BASE) {
    for (const [suffix, compName] of DIABETES_COMP) {
      const code = base + suffix;
      const name = baseName + ', ' + compName;
      const ch = 'IV';
      const chInfo = CHAPTERS.find(c => c[2] === ch) || CHAPTERS[0];
      codes.push({ code, name, chapter: ch, chName: chInfo[3], range: chInfo[4], specialty: chInfo[5] });
      compactCodes.push([code, name, ch]);
    }
  }

  // ── Inject missing ulcer subcategories ─────────────────
  // K25-K28 also only have top-level headers in the markdown.
  const ULCER_BASE = [
    ['K25', 'Ulcera gastrica'],
    ['K26', 'Ulcera duodenal'],
    ['K27', 'Ulcera peptica, de sitio no especificado'],
    ['K28', 'Ulcera gastroyeyunal'],
  ];
  const ULCER_COMP = [
    ['.0', 'aguda con hemorragia'],
    ['.1', 'aguda con perforacion'],
    ['.2', 'aguda con hemorragia y perforacion'],
    ['.3', 'aguda sin hemorragia ni perforacion'],
    ['.4', 'cronica o no especificada con hemorragia'],
    ['.5', 'cronica o no especificada con perforacion'],
    ['.6', 'cronica o no especificada con hemorragia y perforacion'],
    ['.7', 'cronica sin hemorragia ni perforacion'],
    ['.9', 'no especificada como aguda ni cronica, sin hemorragia ni perforacion'],
  ];
  const topLevelUlcer = new Set(['K25','K26','K27','K28']);
  codes = codes.filter(c => !topLevelUlcer.has(c.code));
  compactCodes = compactCodes.filter(c => !topLevelUlcer.has(c[0]));

  for (const [base, baseName] of ULCER_BASE) {
    for (const [suffix, compName] of ULCER_COMP) {
      const code = base + suffix;
      const name = baseName + ', ' + compName;
      const ch = 'XI';
      const chInfo = CHAPTERS.find(c => c[2] === ch) || CHAPTERS[0];
      codes.push({ code, name, chapter: ch, chName: chInfo[3], range: chInfo[4], specialty: chInfo[5] });
      compactCodes.push([code, name, ch]);
    }
  }

  // ── Inject missing substance use disorder subcategories (F10-F19) ──
  const F_SUBSTANCES = [
    ['F10','Trastornos mentales y del comportamiento debidos al uso de alcohol'],
    ['F11','Trastornos mentales y del comportamiento debidos al uso de opioides'],
    ['F12','Trastornos mentales y del comportamiento debidos al uso de cannabinoides'],
    ['F13','Trastornos mentales y del comportamiento debidos al uso de sedantes o hipnoticos'],
    ['F14','Trastornos mentales y del comportamiento debidos al uso de cocaina'],
    ['F15','Trastornos mentales y del comportamiento debidos al uso de otros estimulantes (incluyendo cafeina)'],
    ['F16','Trastornos mentales y del comportamiento debidos al uso de alucinogenos'],
    ['F17','Trastornos mentales y del comportamiento debidos al uso de tabaco'],
    ['F18','Trastornos mentales y del comportamiento debidos al uso de disolventes volatiles'],
    ['F19','Trastornos mentales y del comportamiento debidos al uso de multiples drogas y otras sustancias psicoactivas'],
  ];
  const F_COMPLICATIONS = [
    ['.0','intoxicacion aguda'],['.1','consumo perjudicial'],['.2','sindrome de dependencia'],
    ['.3','sindrome de abstinencia'],['.4','sindrome de abstinencia con delirium'],
    ['.5','trastorno psicotico'],['.6','sindrome amnesico'],
    ['.7','trastorno psicotico residual y de comienzo tardio'],
    ['.8','otros trastornos mentales y del comportamiento'],
    ['.9','trastorno mental y del comportamiento, no especificado'],
  ];
  const topF = new Set(['F10','F11','F12','F13','F14','F15','F16','F17','F18','F19']);
  codes = codes.filter(c => !topF.has(c.code));
  compactCodes = compactCodes.filter(c => !topF.has(c[0]));
  for (const [base, baseName] of F_SUBSTANCES) {
    for (const [suffix, compName] of F_COMPLICATIONS) {
      const code = base + suffix, name = baseName + ', ' + compName, ch = 'V';
      const chInfo = CHAPTERS.find(c => c[2] === ch) || CHAPTERS[0];
      codes.push({code,name,chapter:ch,chName:chInfo[3],range:chInfo[4],specialty:chInfo[5]});
      compactCodes.push([code,name,ch]);
    }
  }

  // ── Inject missing glomerular disease subcategories (N00-N07) ──
  const N_BASE = [
    ['N00','Sindrome nefritico agudo'],['N01','Sindrome nefritico rapidamente progresivo'],
    ['N02','Hematuria recurrente y persistente'],['N03','Sindrome nefritico cronico'],
    ['N04','Sindrome nefrotico'],['N05','Sindrome nefritico no especificado'],
    ['N06','Proteinuria aislada con lesion morfologica especificada'],
    ['N07','Nefropatia hereditaria no clasificada en otra parte'],
  ];
  const N_MORPH = [
    ['.0','anormalidad glomerular minima'],['.1','lesiones glomerulares focales y segmentarias'],
    ['.2','glomerulonefritis membranosa difusa'],['.3','glomerulonefritis proliferativa mesangial difusa'],
    ['.4','glomerulonefritis proliferativa endocapilar difusa'],['.5','glomerulonefritis mesangiocapilar difusa'],
    ['.6','enfermedad por depositos densos'],['.7','glomerulonefritis difusa en media luna'],
    ['.8','otras lesiones morfologicas'],['.9','lesion morfologica no especificada'],
  ];
  const topN = new Set(['N00','N01','N02','N03','N04','N05','N06','N07']);
  codes = codes.filter(c => !topN.has(c.code));
  compactCodes = compactCodes.filter(c => !topN.has(c[0]));
  for (const [base, baseName] of N_BASE) {
    for (const [suffix, morphName] of N_MORPH) {
      const code = base + suffix, name = baseName + ', ' + morphName, ch = 'XIV';
      const chInfo = CHAPTERS.find(c => c[2] === ch) || CHAPTERS[0];
      codes.push({code,name,chapter:ch,chName:chInfo[3],range:chInfo[4],specialty:chInfo[5]});
      compactCodes.push([code,name,ch]);
    }
  }

  // ── Inject L89 ulceras de decubito / presion ──
  const topL89 = new Set(['L89']);
  codes = codes.filter(c => !topL89.has(c.code));
  compactCodes = compactCodes.filter(c => !topL89.has(c[0]));
  const L89_ENTRIES = [
    ['L89.0','Ulcera de decubito y zona de presion, estadio 1','XII'],
    ['L89.1','Ulcera de decubito y zona de presion, estadio 2','XII'],
    ['L89.2','Ulcera de decubito y zona de presion, estadio 3','XII'],
    ['L89.3','Ulcera de decubito y zona de presion, estadio 4','XII'],
    ['L89.9','Ulcera de decubito y zona de presion, no especificada','XII'],
  ];
  for (const [code, name, ch] of L89_ENTRIES) {
    const chInfo = CHAPTERS.find(c => c[2] === ch) || CHAPTERS[0];
    codes.push({code,name,chapter:ch,chName:chInfo[3],range:chInfo[4],specialty:chInfo[5]});
    compactCodes.push([code,name,ch]);
  }

  // ── Inject K20 esofagitis ──
  const topK20 = new Set(['K20']);
  codes = codes.filter(c => !topK20.has(c.code));
  compactCodes = compactCodes.filter(c => !topK20.has(c[0]));
  const K20_ENTRIES = [
    ['K20.0','Esofagitis eosinofilica','XI'],
    ['K20.8','Otras esofagitis especificadas','XI'],
    ['K20.9','Esofagitis, no especificada','XI'],
  ];
  for (const [code, name, ch] of K20_ENTRIES) {
    const chInfo = CHAPTERS.find(c => c[2] === ch) || CHAPTERS[0];
    codes.push({code,name,chapter:ch,chName:chInfo[3],range:chInfo[4],specialty:chInfo[5]});
    compactCodes.push([code,name,ch]);
  }

  // ── Inject missing abortion subcategories (O03-O06) ──
  const ABORT_BASE = ['O03','O04','O05','O06'];
  const ABORT_NAMES = {'O03':'Aborto espontaneo','O04':'Aborto medico','O05':'Otro aborto','O06':'Aborto no especificado'};
  const ABORT_COMP = [
    ['.0','incompleto, complicado con infeccion genital y pelviana'],
    ['.1','incompleto, complicado con hemorragia excesiva o tardia'],
    ['.2','incompleto, complicado con embolia'],
    ['.3','incompleto, con otras complicaciones y las no especificadas'],
    ['.4','incompleto, sin complicacion'],
    ['.5','completo o no especificado, complicado con infeccion genital y pelviana'],
    ['.6','completo o no especificado, complicado con hemorragia excesiva o tardia'],
    ['.7','completo o no especificado, complicado con embolia'],
    ['.8','completo o no especificado, con otras complicaciones y las no especificadas'],
    ['.9','completo o no especificado, sin complicacion'],
  ];
  const topAbort = new Set(ABORT_BASE);
  codes = codes.filter(c => !topAbort.has(c.code));
  compactCodes = compactCodes.filter(c => !topAbort.has(c[0]));
  for (const base of ABORT_BASE) {
    for (const [suffix, compName] of ABORT_COMP) {
      const code = base + suffix, name = ABORT_NAMES[base] + ', ' + compName, ch = 'XV';
      const chInfo = CHAPTERS.find(c => c[2] === ch) || CHAPTERS[0];
      codes.push({code,name,chapter:ch,chName:chInfo[3],range:chInfo[4],specialty:chInfo[5]});
      compactCodes.push([code,name,ch]);
    }
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

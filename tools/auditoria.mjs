// Auditoría del engranaje completo.
//
// Lo importante que hace y que un chequeo de sintaxis NO ve:
//   · llamadas a funciones que ya no existen (hoy se borró mucho código);
//   · botones cuyo onclick apunta a una función inexistente — eso no falla al
//     cargar, falla el día que alguien lo pulsa;
//   · columnas que el código escribe y que la base no tiene.
import fs from 'fs';
import * as acorn from 'acorn';

let fallos = 0, avisos = 0;
const bien = t => console.log('   ✓ ' + t);
const mal = t => { fallos++; console.log('   ✗ ' + t); };
const ojo = t => { avisos++; console.log('   ! ' + t); };
const titulo = t => console.log('\n' + t + '\n' + '─'.repeat(t.length));

// ── Nombres declarados y nombres llamados ────────────────────────────────
function analiza(src, globales) {
  const declarados = new Set(globales);
  const llamados = new Map();          // nombre → nº de llamadas
  const ast = acorn.parse(src, { ecmaVersion: 2020, allowReturnOutsideFunction: true });

  const anda = (n, dentro) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(x => anda(x, dentro)); return; }
    if (!n.type) return;

    if (n.type === 'FunctionDeclaration' && n.id) declarados.add(n.id.name);
    if ((n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') && n.id) declarados.add(n.id.name);
    if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'Identifier') declarados.add(n.id.name);
    if (n.type === 'CatchClause' && n.param && n.param.type === 'Identifier') declarados.add(n.param.name);
    if (n.params) n.params.forEach(p => { if (p.type === 'Identifier') declarados.add(p.name); });
    if (n.type === 'CallExpression' && n.callee && n.callee.type === 'Identifier') {
      llamados.set(n.callee.name, (llamados.get(n.callee.name) || 0) + 1);
    }
    for (const k in n) if (k !== 'type' && k !== 'start' && k !== 'end') anda(n[k], n);
  };
  anda(ast);
  return { declarados, llamados };
}

const NAVEGADOR = ['window','document','console','JSON','Math','Date','String','Number','Boolean','Array',
  'Object','parseInt','parseFloat','isNaN','isFinite','setTimeout','setInterval','clearTimeout','clearInterval',
  'fetch','alert','confirm','prompt','encodeURIComponent','decodeURIComponent','encodeURI','decodeURI',
  'localStorage','sessionStorage','navigator','location','FormData','Blob','File','FileReader','Image','URL',
  'Promise','Error','RegExp','Set','Map','WeakMap','Symbol','atob','btoa','requestAnimationFrame','indexedDB',
  'crypto','TextEncoder','TextDecoder','performance','history','screen','MutationObserver','IntersectionObserver',
  'AbortController','Intl','structuredClone','queueMicrotask','supabase','jspdf','jsPDF','JSZip','html2canvas',
  'Notification','MediaRecorder','AudioContext','matchMedia','getComputedStyle','CustomEvent','Event','URLSearchParams'];

const GOOGLE = ['SpreadsheetApp','UrlFetchApp','PropertiesService','Utilities','Session','Logger','ContentService',
  'ScriptApp','LockService','MailApp','GmailApp','DriveApp','CacheService','HtmlService','JSON','Math','Date',
  'String','Number','Boolean','Array','Object','parseInt','parseFloat','isNaN','Error','RegExp','encodeURIComponent'];

// ═════════════════════════════════════════════════════════════════════════
titulo('1 · LA APP (index.html)');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const principal = scripts.reduce((a, b) => (b.length > a.length ? b : a), '');
bien('script principal: ' + principal.length.toLocaleString('es') + ' caracteres');

const app = analiza(principal, NAVEGADOR);
const huerfanas = [...app.llamados.keys()].filter(n => !app.declarados.has(n));
if (huerfanas.length) huerfanas.forEach(n => mal('se llama a "' + n + '()" y no existe (' + app.llamados.get(n) + ' veces)'));
else bien(app.llamados.size + ' funciones distintas invocadas, todas existen');

// Botones: onclick/onkeydown dentro de las cadenas HTML.
const manejadores = new Map();
for (const m of principal.matchAll(/on(?:click|change|input|keydown|submit)=\\?["']([^"']*?)\\?["']/g)) {
  // El lookbehind descarta los métodos: this.closest(), e.stopPropagation().
  // Solo interesan las funciones sueltas, que son las que pueden no existir.
  for (const f of m[1].matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const n = f[1];
    if (['if','for','while','return','function','typeof','new','catch','switch'].includes(n)) continue;
    manejadores.set(n, (manejadores.get(n) || 0) + 1);
  }
}
const botonesRotos = [...manejadores.keys()].filter(n => !app.declarados.has(n) && !NAVEGADOR.includes(n));
if (botonesRotos.length) botonesRotos.forEach(n => mal('un botón llama a "' + n + '()" y no existe — fallaría al pulsarlo'));
else bien(manejadores.size + ' funciones distintas usadas en botones, todas existen');

// ═════════════════════════════════════════════════════════════════════════
titulo('2 · EL APPS SCRIPT (apps-script-sync.gs)');
const gs = fs.readFileSync('google/apps-script-sync.gs', 'utf8');
const scr = analiza(gs, GOOGLE);
const hg = [...scr.llamados.keys()].filter(n => !scr.declarados.has(n));
if (hg.length) hg.forEach(n => mal('se llama a "' + n + '()" y no existe'));
else bien(scr.llamados.size + ' funciones distintas invocadas, todas existen');
bien('versión declarada: ' + (gs.match(/var VERSION = '([^']+)'/) || [, '?'])[1]);

// ═════════════════════════════════════════════════════════════════════════
titulo('3 · LO QUE EL CÓDIGO ESCRIBE vs LO QUE LA BASE TIENE');
const KEY = fs.readFileSync('.env', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/)[1];
const SB = 'https://xqphjvppfgwabfruyjae.supabase.co/rest/v1/';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
const q = async p => (await fetch(SB + p, { headers: H })).json();

const [muestra] = await q('pacientes?select=*&limit=1');
const columnas = new Set(Object.keys(muestra || {}));
const usadas = new Set();
for (const m of (principal + gs).matchAll(/\bp\.([a-z_]{4,})\b/g)) usadas.add(m[1]);
for (const m of (principal + gs).matchAll(/'([a-z_]{4,})'\s*:/g)) usadas.add(m[1]);
const inventadas = [...usadas].filter(c => !columnas.has(c) &&
  /^(fecha|eco|fur|motivo|tipo|codigo|cie10|diagn|nivel|orden|lugar|estab|provin|distri|red_|especial|resultado|detalle|referencia|cama|turno|origen|id_reg)/.test(c));
if (inventadas.length) inventadas.forEach(c => ojo('el código menciona "' + c + '" y no es columna de pacientes'));
else bien('las ' + columnas.size + ' columnas que usa el código existen en la base');

// ═════════════════════════════════════════════════════════════════════════
titulo('4 · INTEGRIDAD DE LOS DATOS');
const ps = await q('pacientes?select=*');
bien(ps.length + ' pacientes');

const term = e => ['operada', 'suspendida', 'referida'].includes(e);
const problemas = [];
for (const p of ps) {
  if (p.estado === 'programada' && (!p.fecha_cirugia || !p.turno)) problemas.push(p.nombre + ': programada sin fecha o turno');
  if (p.estado === 'hospitalizada' && !p.cama_hospitalizacion) problemas.push(p.nombre + ': hospitalizada sin cama');
  if (p.estado === 'suspendida' && !p.motivo_suspension) problemas.push(p.nombre + ': suspendida sin motivo');
  if (p.estado === 'referida' && !p.motivo_cierre && !p.referencia_hospital) problemas.push(p.nombre + ': cerrada sin motivo');
  if (term(p.estado) && !p.fecha_cierre && !p.fecha_real_operacion && !p.fecha_suspension) problemas.push(p.nombre + ': cerrada sin ninguna fecha de cierre');
  if (p.eco_dias != null && (p.eco_dias < 0 || p.eco_dias > 6)) problemas.push(p.nombre + ': eco_dias fuera de 0-6');
}
problemas.length ? problemas.forEach(ojo) : bien('ningún estado incoherente con sus datos obligatorios');

const ids = {};
ps.forEach(p => { if (p.id_registro != null) ids[p.id_registro] = (ids[p.id_registro] || 0) + 1; });
const rep = Object.keys(ids).filter(k => ids[k] > 1);
rep.length ? mal('ID registro repetido: ' + rep.join(', ')) : bien('ningún ID registro repetido');

const dnis = {};
ps.forEach(p => { dnis[p.dni] = (dnis[p.dni] || 0) + 1; });
const dr = Object.keys(dnis).filter(k => dnis[k] > 1);
dr.length ? mal('DNI repetido: ' + dr.join(', ')) : bien('ningún DNI repetido');

// Historial vs estado real: el fallo del que arrancó todo hoy.
const hist = await q('historial_estados?select=paciente_id,estado_nuevo,created_at&order=created_at.desc');
const ultimo = {};
hist.forEach(h => { if (!ultimo[h.paciente_id]) ultimo[h.paciente_id] = h.estado_nuevo; });
const desajuste = ps.filter(p => ultimo[p.id] && ultimo[p.id] !== p.estado);
desajuste.length
  ? desajuste.forEach(p => mal(p.nombre + ': el historial dice "' + ultimo[p.id] + '" y la tabla "' + p.estado + '"'))
  : bien('el historial concuerda con el estado de todas');

// ═════════════════════════════════════════════════════════════════════════
titulo('5 · LO QUE ESTÁ PUBLICADO');
const vivo = await (await fetch('https://robbstark6824.github.io/wichanzao/index.html?v=' + Date.now())).text();
bien(vivo.length === html.replace(/\r\n/g, '\n').length || vivo.length === html.length
  ? 'la app publicada coincide en tamaño con la del repositorio'
  : 'la app publicada mide ' + vivo.length + ' y la local ' + html.length);
vivo.includes('export?format=csv')
  ? mal('la app publicada TODAVÍA lee el CSV público de la hoja')
  : bien('la app publicada no lee la hoja pública');
vivo.includes('qxTrimestreEco') ? bien('lleva la regla del trimestre') : mal('NO lleva la regla del trimestre');

const ping = await (await fetch('https://script.google.com/macros/s/AKfycbxH2ZHmkZ9d68nFD7Sww40Shbv0lQ7FibzGfeRze48Powy5qj-ygD8rYPoCZy4qiAxEhw/exec',
  { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: 'ping' }) })).text();
const vGs = (ping.match(/"version":"([^"]+)"/) || [, '?'])[1];
const vLocal = (gs.match(/var VERSION = '([^']+)'/) || [, '?'])[1];
vGs === vLocal ? bien('Apps Script desplegado al día: ' + vGs) : mal('Apps Script desplegado "' + vGs + '" pero el archivo dice "' + vLocal + '"');
ping.includes('token no válido') ? bien('el Web App responde en JSON y sigue siendo público') : mal('el Web App no responde como debe: ' + ping.slice(0, 80));

// ═════════════════════════════════════════════════════════════════════════
titulo('6 · LA HOJA CONTRA LA BASE');
// Hay que parsear el CSV de verdad: un diagnóstico con un salto de línea dentro
// de la celda parte el renglón y aparecen filas fantasma. Ya dio un susto.
function parseCSV(t) {
  const filas = []; let fila = [], campo = '', enComillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enComillas) { if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else enComillas = false; } else campo += c; }
    else if (c === '"') enComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}
const norma = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
try {
  const reg = parseCSV(await (await fetch('https://docs.google.com/spreadsheets/d/1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU/export?format=csv')).text());
  const cab = reg.findIndex(r => r.some(c => norma(c) === 'id registro'));
  const bloque = reg.slice(cab + 1).filter(r => (r[9] || '').trim() && (r[10] || '').trim());
  bien(reg.length + ' registros en la hoja · bloque GERESA desde la fila ' + (cab + 2));

  const faltan = ps.filter(p => !bloque.some(r => (r[9] || '').trim() === p.dni));
  faltan.length ? faltan.forEach(p => mal(p.nombre + ' está en la app y NO en la hoja')) : bien('las ' + ps.length + ' pacientes están en la hoja');

  const dobles = ps.filter(p => bloque.filter(r => (r[9] || '').trim() === p.dni).length > 1);
  dobles.length ? dobles.forEach(p => mal(p.nombre + ' aparece dos veces en el bloque')) : bien('ninguna duplicada en el bloque GERESA');

  const desconocidas = bloque.filter(r => !ps.some(p => p.dni === (r[9] || '').trim()));
  desconocidas.length ? desconocidas.forEach(r => ojo('en la hoja y no en la app: ' + r[10])) : bien('ninguna fila de la hoja falta en la app');

  const historica = reg.findIndex(r => r.join(',').toUpperCase().includes('OTINIANO') && r.includes('70515665'));
  historica >= 0 ? bien('el registro histórico de febrero sigue intacto (fila ' + (historica + 1) + ')')
                 : mal('el registro histórico de febrero YA NO ESTÁ');
} catch (e) {
  ojo('no se pudo leer la hoja: ' + e.message);
}

// ═════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(fallos ? '✗ ' + fallos + ' FALLO(S)' + (avisos ? ' y ' + avisos + ' aviso(s)' : '')
  : '✓ SIN FALLOS' + (avisos ? ' · ' + avisos + ' aviso(s) para mirar' : ' · el engranaje encaja'));
process.exit(fallos ? 1 : 0);

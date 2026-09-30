// Publica google/apps-script-sync.gs en el proyecto "Sync GERESA" SIN copiar y
// pegar: lo mismo que Ctrl+A → Ctrl+V → Ctrl+S → Gestionar implementaciones →
// ✎ → Nueva versión, en un solo comando.
//
//   node tools/publicar-apps-script.mjs              pruebas → subir → nueva versión → verificar
//   node tools/publicar-apps-script.mjs --solo-subir  sube el código (lo usa el disparador de
//                                                     15 min) sin publicar versión del Web App
//   node tools/publicar-apps-script.mjs --sin-pruebas (no recomendado)
//
// Requisitos (una sola vez):
//   1. https://script.google.com/home/usersettings → "API de Google Apps Script": Activado.
//   2. npx -y @google/clasp@2.4.2 login   (con la cuenta dueña de "Sync GERESA")
//
// Ojo: el disparador de sincronización corre con el código GUARDADO, no con la
// versión publicada. Por eso nada se sube si alguna prueba falla.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SCRIPT_ID = '1iYtROM-XZEbjlgup5C0nM1R8oSiKIRKfOHWPjSbwwtWjRX-1dZpDf1SY';        // Sync GERESA
const DEPLOY_ID = 'AKfycbxH2ZHmkZ9d68nFD7Sww40Shbv0lQ7FibzGfeRze48Powy5qj-ygD8rYPoCZy4qiAxEhw'; // la /exec de la app
const CLASP = 'npx -y @google/clasp@2.4.2';
const DIR = path.resolve('google/clasp');
const SRC = path.join(DIR, 'src');
const args = process.argv.slice(2);
const soloSubir = args.includes('--solo-subir');
const sinPruebas = args.includes('--sin-pruebas');

const correr = (cmd, opts = {}) => execSync(cmd, Object.assign({ stdio: 'inherit' }, opts));
const salida = (cmd, opts = {}) => execSync(cmd, Object.assign({ encoding: 'utf8' }, opts));

const gs = fs.readFileSync('google/apps-script-sync.gs', 'utf8');
const VERSION = (gs.match(/var VERSION = '([^']+)'/) || [])[1];
if (!VERSION) throw new Error('No encuentro var VERSION en el .gs');
new Function(gs);   // sintaxis
console.log('Código a publicar: VERSION ' + VERSION);

// 1. Pruebas: si una falla, no se sube nada.
if (!sinPruebas) {
  for (const t of ['tools/referencia-geresa.mjs', 'tools/test-sync-servicios.mjs', 'tools/test-exportar.mjs', 'tools/test-sesion-apps-script.mjs']) {
    process.stdout.write('  prueba ' + t + ' … ');
    try { salida('node ' + t); console.log('OK'); }
    catch (e) { console.log('FALLA'); console.log(String(e.stdout || '').split('\n').filter(l => /FALLA|✗|Error/.test(l)).slice(0, 10).join('\n')); process.exit(1); }
  }
}

// 2. Carpeta de clasp: el manifiesto (appsscript.json) se trae del proyecto la
//    primera vez y se guarda en git; el código se copia como "Código.gs", el
//    mismo nombre que tiene en el editor (push reemplaza TODOS los archivos).
fs.mkdirSync(SRC, { recursive: true });
fs.writeFileSync(path.join(DIR, '.clasp.json'), JSON.stringify({ scriptId: SCRIPT_ID, rootDir: 'src' }, null, 2));
if (!fs.existsSync(path.join(SRC, 'appsscript.json'))) {
  console.log('Primera vez: trayendo el manifiesto del proyecto…');
  const tmp = path.join(DIR, '_pull');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp);
  fs.writeFileSync(path.join(tmp, '.clasp.json'), JSON.stringify({ scriptId: SCRIPT_ID, rootDir: '.' }));
  correr(CLASP + ' pull', { cwd: tmp });
  fs.copyFileSync(path.join(tmp, 'appsscript.json'), path.join(SRC, 'appsscript.json'));
  const remotos = fs.readdirSync(tmp).filter(f => /\.(gs|js)$/.test(f));
  console.log('  archivos de código en el proyecto: ' + remotos.join(', '));
  if (remotos.length !== 1) throw new Error('Esperaba UN archivo de código en Sync GERESA y hay ' + remotos.length + '. Revisar antes de subir.');
  fs.rmSync(tmp, { recursive: true, force: true });
}
fs.writeFileSync(path.join(SRC, 'Código.gs'), gs);

// 3. Subir (queda "guardado": el disparador de 15 min ya lo usa)
correr(CLASP + ' push --force', { cwd: DIR });
if (soloSubir) { console.log('Subido (sin nueva versión del Web App).'); process.exit(0); }

// 4. Nueva versión en la MISMA implementación (misma URL /exec)
correr(CLASP + ' deploy --deploymentId ' + DEPLOY_ID + ' --description "' + VERSION + '"', { cwd: DIR });

// 5. Verificar que la dirección de la app ya responde con esta versión. Con
//    curl y en dos pasos (POST → leer la redirección → GET): el fetch de Node
//    se quedaba sin conectar a script.google.com en esta PC, y curl -L pierde
//    el cuerpo del POST al seguir la redirección.
const url = 'https://script.google.com/macros/s/' + DEPLOY_ID + '/exec';
function versionViva() {
  try {
    const dest = salida('curl -s -o NUL -w "%{redirect_url}" -X POST -H "Content-Type: text/plain;charset=utf-8" -d "{\\"token\\":\\"x\\"}" "' + url + '"').trim();
    return JSON.parse(salida('curl -s "' + dest + '"')).version;
  } catch (e) { return '(sin respuesta)'; }
}
for (let i = 0; i < 8; i++) {
  const v = versionViva();
  if (v === VERSION) { console.log('✓ Publicado: la app ya habla con ' + VERSION); process.exit(0); }
  console.log('  todavía responde ' + v + '… esperando');
  await new Promise(res => setTimeout(res, 10000));
}
console.log('✗ La dirección no muestra la versión nueva. Revisar en Gestionar implementaciones.');
process.exit(1);

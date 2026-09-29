// Foto de referencia de lo que la app manda a las hojas GERESA.
//
// La expansión a varios servicios toca la base y el Apps Script. Ginecología
// tiene que seguir escribiendo EXACTAMENTE lo mismo en cada celda. Este script
// lo comprueba:
//
//   node tools/referencia-geresa.mjs --guardar
//       Toma los pacientes de la base (tal como los manda la app: filas de
//       PostgREST), calcula con el .gs actual lo que iría a cada columna de la
//       hoja antigua (buildValuesOld) y de la oficial (buildValuesNew), y lo
//       guarda junto con esas filas de entrada. Se hace UNA vez, antes de
//       cambiar nada; no sobrescribe una referencia existente sin --forzar.
//
//   node tools/referencia-geresa.mjs
//       Vuelve a calcular con el .gs de ahora, sobre las MISMAS filas guardadas
//       y con la misma fecha de "hoy", y compara celda por celda. Sale con
//       código 1 si cambia una sola.
//
//   node tools/referencia-geresa.mjs --con-servicio
//       Igual, pero añade servicio:'ginecologia' a cada fila, como vendrán
//       después de la migración de base. Debe dar lo mismo.
//
// El .gs se carga tal cual en Node; solo se fija la fecha de hoy (hoyStr_) para
// que la edad gestacional y los plazos no cambien de un día a otro.
// La referencia lleva datos de pacientes: se guarda FUERA del repositorio.
// Solo lee. No escribe en la base ni en ninguna hoja.
import fs from 'fs';

const ARCHIVO = 'C:/Proyectos/respaldos-wichanzao/referencia-geresa.json';
const args = process.argv.slice(2);
const GUARDAR = args.includes('--guardar');
const FORZAR = args.includes('--forzar');
const CON_SERVICIO = args.includes('--con-servicio');

function cargarGs(hoy) {
  const gs = fs.readFileSync('google/apps-script-sync.gs', 'utf8').replace(/\r\n/g, '\n');
  const stubs = `
    var Utilities = { formatDate: function () { throw new Error('Utilities.formatDate fuera de hoyStr_'); } };
    var Session = { getScriptTimeZone: function () { return 'America/Lima'; } };
  `;
  return new Function('HOY_FIJO', stubs + gs + `
    hoyStr_ = function () { return HOY_FIJO; };
    return { buildValuesOld, buildValuesNew, VERSION };`)(hoy);
}

function calcular(G, filas) {
  const out = {};
  for (const p of filas) {
    const fila = CON_SERVICIO ? Object.assign({}, p, { servicio: 'ginecologia' }) : p;
    out[p.id] = { antigua: G.buildValuesOld(fila), oficial: G.buildValuesNew(fila) };
  }
  return JSON.parse(JSON.stringify(out));   // mismo trato que JSON.stringify al enviar
}

if (GUARDAR) {
  if (fs.existsSync(ARCHIVO) && !FORZAR)
    throw new Error('Ya hay una referencia en ' + ARCHIVO + '. Usa --forzar solo si de verdad quieres reemplazarla.');
  const env = fs.readFileSync('.env', 'utf8');
  const KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/)[1];
  const SB = 'https://xqphjvppfgwabfruyjae.supabase.co';
  const resp = await fetch(SB + '/rest/v1/pacientes?select=*&order=created_at', {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
  });
  if (!resp.ok) throw new Error('La base respondió ' + resp.status + ': ' + await resp.text());
  const filas = await resp.json();

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const G = cargarGs(hoy);
  const salidas = calcular(G, filas);
  fs.mkdirSync('C:/Proyectos/respaldos-wichanzao', { recursive: true });
  fs.writeFileSync(ARCHIVO, JSON.stringify({
    tomada: new Date().toISOString(), hoy, versionGs: G.VERSION, entradas: filas, salidas
  }, null, 1));
  const celdas = Object.values(salidas).reduce((n, s) => n + Object.keys(s.antigua).length + Object.keys(s.oficial).length, 0);
  console.log('Referencia guardada: ' + filas.length + ' pacientes, ' + celdas + ' celdas (hoy = ' + hoy + ', .gs ' + G.VERSION + ')');
  console.log(ARCHIVO);
  process.exit(0);
}

if (!fs.existsSync(ARCHIVO)) throw new Error('No hay referencia. Primero: node tools/referencia-geresa.mjs --guardar');
const ref = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
const G = cargarGs(ref.hoy);
const ahora = calcular(G, ref.entradas);

const difs = [];
let celdas = 0;
for (const p of ref.entradas) {
  for (const hoja of ['antigua', 'oficial']) {
    const a = ref.salidas[p.id][hoja], b = ahora[p.id][hoja];
    const claves = new Set(Object.keys(a).concat(Object.keys(b)));
    for (const k of claves) {
      celdas++;
      const va = JSON.stringify(a[k]), vb = JSON.stringify(b[k]);
      if (va !== vb) difs.push(p.nombre + ' · hoja ' + hoja + ' · "' + k + '": ' + va + ' → ' + vb);
    }
  }
}

console.log('Referencia del ' + ref.tomada.slice(0, 10) + ' (.gs ' + ref.versionGs + ') vs .gs actual (' + G.VERSION + ')'
  + (CON_SERVICIO ? ', filas con servicio=ginecologia' : ''));
console.log(ref.entradas.length + ' pacientes, ' + celdas + ' celdas comparadas.');
if (difs.length) {
  console.log('\n✗ ' + difs.length + ' celda(s) cambian:');
  difs.forEach(d => console.log('   ' + d));
  process.exit(1);
}
console.log('✓ Idéntico: ginecología escribe exactamente lo mismo.');

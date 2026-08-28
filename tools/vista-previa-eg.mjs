// ¿Qué va a cambiar EXACTAMENTE en la columna "Diagnóstico principal" de las
// hojas, paciente por paciente? Con las funciones reales y los datos reales.
// No escribe nada.
import fs from 'fs';

const gs = fs.readFileSync('google/apps-script-sync.gs', 'utf8').replace(/\r\n/g, '\n');
const HOY = new Date().toISOString().slice(0, 10);
const G = new Function('Utilities', 'Session', gs + '; return { dx: dxPrincipal_, fur: furEfectiva_, eg: egEn_ };')(
  { formatDate: () => HOY }, { getScriptTimeZone: () => 'America/Lima' }
);

const KEY = fs.readFileSync('.env', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/)[1];
const ps = await (await fetch('https://xqphjvppfgwabfruyjae.supabase.co/rest/v1/pacientes?select=*&order=id_registro',
  { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })).json();

console.log('Hoy es ' + HOY + '. Esto es lo que se escribiría en las hojas:\n');

let tocadas = 0;
for (const p of ps) {
  const antes = p.diagnostico || '(sin diagnóstico)';
  const despues = G.dx(p) || '(sin diagnóstico)';
  const cambia = antes !== despues;
  if (cambia) tocadas++;
  console.log((cambia ? '  CAMBIA  ' : '  igual   ') + p.nombre);
  console.log('           ' + despues.replace(/\n/g, ' ⏎ ').slice(0, 150));
}

console.log('\n→ ' + tocadas + ' de ' + ps.length + ' fichas cambian. Las demás salen exactamente igual que hoy.');

// --- Simulacro: qué pasaría si a Ximena le pusieras su ecografía ----------
const x = ps.find(p => /ximena/i.test(p.nombre || ''));
if (x) {
  console.log('\n\nSIMULACRO (no se guarda nada): si a ' + x.nombre + ' le pusieras');
  console.log('la eco del 1.er trimestre marcando 36ss 2/7 el 28/08/2026:\n');
  const sim = { ...x, eco_fecha: '2026-08-28', eco_semanas: 36, eco_dias: 2 };
  console.log('  En la app verías:   ' + G.eg(sim, HOY) + '  hoy');
  if (sim.fecha_cirugia) console.log('                      ' + G.eg(sim, sim.fecha_cirugia) + '  el día de la cirugía');
  console.log('  En el Excel:        ' + G.dx(sim).replace(/\n/g, ' ⏎ '));
}

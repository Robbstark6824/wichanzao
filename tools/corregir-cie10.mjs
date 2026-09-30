// Correcciones de datos del 2026-09-29 pedidas por el usuario: códigos CIE-10
// mal escritos y dos erratas de diagnóstico, en Cirugía General y gineco.
//
//   node tools/corregir-cie10.mjs           muestra qué cambiaría (no escribe)
//   node tools/corregir-cie10.mjs --aplicar  lo aplica y guarda el antes/después
//
// Cada cambio lleva una CONDICIÓN: solo se hace si el valor actual sigue siendo
// el que se vio (así no pisa nada que alguien haya editado mientras tanto). El
// antes/después queda en C:\Proyectos\respaldos-wichanzao\pendientes\ para
// poder revertir. Las fichas cambiadas llegan solas al Excel en la siguiente
// pasada de la sincronización (cada 15 min).
import fs from 'fs';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/)[1];
const SB = 'https://xqphjvppfgwabfruyjae.supabase.co/rest/v1/pacientes';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const APLICAR = process.argv.includes('--aplicar');

// [servicio, id_registro, campo, valor que debe haber ahora (null = vacío), valor nuevo, motivo]
const C = 'cirugia_general', G = 'ginecologia';
const CAMBIOS = [
  // --- formato (falta el punto o minúscula): mismo código, bien escrito
  [C, 20, 'cie10', 'D172', 'D17.2', 'formato'], [C, 21, 'cie10', 'D171', 'D17.1', 'formato'],
  [C, 25, 'cie10', 'D172', 'D17.2', 'formato'], [C, 26, 'cie10', 'D172', 'D17.2', 'formato'],
  [C, 28, 'cie10', 'M063', 'M06.3', 'formato'], [C, 41, 'cie10', 'M795', 'M79.5', 'formato'],
  [C, 14, 'cie10', 'k80.2', 'K80.2', 'mayúscula'], [C, 15, 'cie10', 'k80.2', 'K80.2', 'mayúscula'],
  [C, 17, 'cie10', 'k80.2', 'K80.2', 'mayúscula'], [C, 27, 'cie10', 'k80.2', 'K80.2', 'mayúscula'],
  [G, 13, 'cie10', 'Z359', 'Z35.9', 'formato'], [G, 18, 'cie10', 'Z359', 'Z35.9', 'formato'],
  [G, 19, 'cie10', 'Z359', 'Z35.9', 'formato'], [G, 23, 'cie10', 'Z359', 'Z35.9', 'formato'],
  [G, 16, 'cie10', 'N871', 'N87.1', 'formato'], [G, 20, 'cie10', 'T839', 'T83.9', 'formato'],
  // --- el código describía otra enfermedad: el de sus pares con el mismo diagnóstico
  [C, 37, 'cie10', 'K42.9', 'K80.2', 'litiasis vesicular tenía código de hernia umbilical'],
  [C, 38, 'cie10', 'K42.9', 'K80.2', 'litiasis vesicular tenía código de hernia umbilical'],
  [C, 39, 'cie10', 'K42.9', 'K80.2', 'litiasis vesicular tenía código de hernia umbilical'],
  [C, 40, 'cie10', 'K42.9', 'K80.2', 'litiasis vesicular tenía código de hernia umbilical'],
  [C, 24, 'cie10', 'D172', 'L72.0', 'quiste epidérmico tenía código de lipoma (igual que IDs 34 y 36)'],
  [C, 24, 'diagnostico', 'QUITE EPIDERMICO', 'QUISTE EPIDERMICO', 'errata'],
  [C, 29, 'diagnostico', 'LIOMA', 'LIPOMA', 'errata'], [C, 29, 'cie10', 'D171', 'D17.1', 'formato'],
  // --- código que no existe
  [C, 16, 'cie10', 'K466.9', 'K46.9', 'K466.9 no existe: era K46.9 (hernia abdominal sin obstrucción ni gangrena)'],
  [C, 30, 'cie10', 'W459', 'M79.5', 'W45.9 no existe; mismo diagnóstico que el ID 41 (M79.5)'],
  // --- sin código: el de sus pares con el mismo diagnóstico
  [C, 23, 'cie10', null, 'K80.2', 'litiasis vesicular, igual que sus pares'],
  [C, 19, 'cie10', null, 'I84.2', 'hemorroides, igual que el ID 1'],
  [C, 22, 'cie10', null, 'K11.6', 'mucocele (mucocele de glándula salival)'],
];

const sinTocar = [[G, 24, 'cie10', '99215', 'Prolapso: 99215 es un código de consulta (CPT); el de prolapso genital N81.- depende del tipo: lo decide el médico']];
console.log((APLICAR ? 'APLICANDO' : 'SIMULACIÓN (no escribe)') + ': ' + CAMBIOS.length + ' cambios\n');

const registro = [];
let hechos = 0, omitidos = 0;
for (const [serv, id, campo, viejo, nuevo, motivo] of CAMBIOS) {
  const filtro = `servicio=eq.${serv}&id_registro=eq.${id}&` + (viejo === null ? `${campo}=is.null` : `${campo}=eq.${encodeURIComponent(viejo)}`);
  const previo = await (await fetch(`${SB}?select=id,nombre&${filtro}`, { headers: H })).json();
  const linea = `${serv === C ? 'CG' : 'GO'} ${String(id).padStart(2)} · ${campo.padEnd(11)} ${String(viejo ?? '(vacío)').padEnd(17)} → ${nuevo.padEnd(18)} ${previo[0] ? previo[0].nombre : ''}`;
  if (previo.length !== 1) { omitidos++; console.log('  SALTADO (ya no tiene ese valor o no existe)  ' + linea); continue; }
  if (APLICAR) {
    const r = await fetch(`${SB}?${filtro}`, { method: 'PATCH', headers: Object.assign({ Prefer: 'return=representation' }, H), body: JSON.stringify({ [campo]: nuevo }) });
    const out = await r.json();
    if (!r.ok || out.length !== 1) { console.log('  ERROR ' + linea + ' ' + JSON.stringify(out)); process.exitCode = 1; continue; }
    registro.push({ servicio: serv, id_registro: id, paciente_id: previo[0].id, nombre: previo[0].nombre, campo, antes: viejo, despues: nuevo, motivo });
  }
  hechos++;
  console.log('  ' + (APLICAR ? 'hecho ' : 'haría ') + linea);
}
console.log('\n' + hechos + (APLICAR ? ' aplicados' : ' por aplicar') + ', ' + omitidos + ' saltados.');
console.log('\nNO se tocan (decide el médico):');
sinTocar.forEach(x => console.log('  ' + (x[0] === C ? 'CG' : 'GO') + ' ' + x[1] + ' · ' + x[2] + ' «' + x[3] + '» — ' + x[4]));
if (APLICAR && registro.length) {
  fs.mkdirSync('C:/Proyectos/respaldos-wichanzao/pendientes', { recursive: true });
  const f = 'C:/Proyectos/respaldos-wichanzao/pendientes/correcciones-cie10-2026-09-29.json';
  fs.writeFileSync(f, JSON.stringify({ aplicadas: new Date().toISOString(), cambios: registro }, null, 1));
  console.log('\nAntes/después guardado en ' + f);
}

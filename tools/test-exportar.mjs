// Prueba la exportación del jefe de información (acción "exportar" del Apps
// Script) sin Google ni la base: tools/emulador-apps-script.mjs.
//
//   node tools/test-exportar.mjs
//
// El archivo oficial de mentira tiene la forma del real
// (FORMATO_LISTA_ESPERA_QUIRURGICA_LAREDO.xlsx): título en la fila 1,
// encabezado en la 3, filas de otros servicios/hospitales, una columna con
// fórmula y la pestaña VALIDACION_CALIDAD con fórmulas sobre los datos.
import fs from 'fs';
import path from 'path';
import { Hoja, cargar } from './emulador-apps-script.mjs';

const RESP = 'C:/Proyectos/respaldos-wichanzao';
const ultimo = fs.readdirSync(RESP).filter(d => /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(d)).sort().pop();
const DB = JSON.parse(fs.readFileSync(path.join(RESP, ultimo, 'datos/public.pacientes.json'), 'utf8'));
DB.forEach(p => { for (const k of ['fecha_captacion', 'fecha_primera_evaluacion', 'fecha_cirugia']) if (p[k]) p[k] = String(p[k]).slice(0, 10); });

const gs = fs.readFileSync('google/apps-script-sync.gs', 'utf8');
const SS2 = '1IoT5KGuTcT83ZLyHh4SrLR4yhbFjIKkI';

function estadoNuevo() {
  const G0 = cargar(gs, { hojas: {}, db: [], activos: [] });
  const claves = Object.keys(G0.buildValuesNew(DB[0]));
  const cab = ['ID registro'].concat(claves, ['Días de espera']);   // la última: fórmula
  const fila = o => cab.map(h => o[h] ?? '');
  const lista = new Hoja([
    ['MATRIZ NOMINAL REGIONAL DE LISTA DE ESPERA QUIRÚRGICA'],
    [''],
    cab,
    fila({ 'ID registro': 1, dni: '11111111', 'apellidos y nombres completos': 'OTRO HOSPITAL', 'especialidad quirurgica': 'CIRUGIA GENERAL' }),
    fila({ 'ID registro': 2, dni: '22222222', 'apellidos y nombres completos': 'CARGADO A MANO', 'especialidad quirurgica': 'TRAUMATOLOGIA' })
  ], 500);
  const colF = cab.length;
  for (let r = 4; r <= 500; r++) lista.fx[r + ',' + colF] = '=IF(A' + r + '="","",TODAY()-I' + r + ')';
  const valid = new Hoja([['VALIDACIÓN BÁSICA DE CALIDAD DE DATOS'], [''], ['Indicador', 'Resultado'], ['Total registros con paciente', '']]);
  valid.fx['4,2'] = '=COUNTA(LISTA_ESPERA_QX!K4:K500)';
  const e = {
    hojas: {
      [SS2 + '|LISTA_ESPERA_QX']: lista,
      [SS2 + '|VALIDACION_CALIDAD']: valid,
      [SS2 + '|CATALOGOS']: new Hoja([['Género'], ['Masculino'], ['Femenino']]),
      [SS2 + '|INSTRUCTIVO']: new Hoja([['Instructivo']])
    },
    db: JSON.parse(JSON.stringify(DB)), activos: ['ginecologia', 'cirugia_general'],
    sesiones: { 'jwt-jefa': 'u-jefa', 'jwt-admin': 'u-admin', 'jwt-medico': 'u-medico', 'jwt-pendiente': 'u-pend' },
    workers: [
      { id: 'u-jefa', name: 'Anestesióloga', rol: 'jefe_info', is_admin: false, aprobado: true },
      { id: 'u-admin', name: 'Admin', rol: 'medico', is_admin: true, aprobado: true },
      { id: 'u-medico', name: 'Interno', rol: 'medico', is_admin: false, aprobado: true },
      { id: 'u-pend', name: 'Nueva jefa', rol: 'jefe_info', is_admin: false, aprobado: false }
    ]
  };
  return { e, G: cargar(gs, e), cab, colF };
}

let fallas = 0;
const ver = (d, ok, x) => { if (!ok) fallas++; console.log((ok ? '  OK    ' : '  FALLA ') + d + (x !== undefined ? '   ->  ' + x : '')); };
const base = { accion: 'exportar', servicios: ['ginecologia', 'cirugia_general'], fechaPor: 'cirugia', desde: '2026-01-01', hasta: '2026-12-31', correo: 'jefa@gmail.com', salida: 'link' };

console.log('QUIÉN PUEDE EXPORTAR');
{
  const { G } = estadoNuevo();
  const r1 = G.post(Object.assign({}, base));
  ver('sin sesión: rechazado', r1.ok === false && /sesión/.test(r1.error), r1.error);
  const r2 = G.post(Object.assign({}, base, { jwt: 'jwt-inventado' }));
  ver('sesión inválida: rechazado', r2.ok === false, r2.error);
  const r3 = G.post(Object.assign({}, base, { jwt: 'jwt-medico' }));
  ver('un médico/interno: rechazado', r3.ok === false && /jefe/.test(r3.error), r3.error);
  const r4 = G.post(Object.assign({}, base, { jwt: 'jwt-pendiente' }));
  ver('un jefe con cuenta sin aprobar: rechazado', r4.ok === false && /aprobada/.test(r4.error), r4.error);
  const r5 = G.post(Object.assign({}, base, { jwt: 'jwt-admin' }));
  ver('el admin: puede', r5.ok === true, r5.error);
  const r6 = G.post(Object.assign({}, base, { jwt: 'jwt-jefa' }));
  ver('la jefa de información: puede', r6.ok === true, r6.error);
}

console.log('\nCOPIA FIEL DEL ARCHIVO GERESA (link)');
{
  const { e, G, cab, colF } = estadoNuevo();
  const original = JSON.stringify(e.hojas[SS2 + '|LISTA_ESPERA_QX'].f);
  const r = G.post(Object.assign({}, base, { jwt: 'jwt-jefa', servicios: ['ginecologia'] }));
  const esperados = DB.filter(p => (p.servicio || 'ginecologia') === 'ginecologia' && p.fecha_cirugia && p.fecha_cirugia >= '2026-01-01' && p.fecha_cirugia <= '2026-12-31');
  ver('responde ok con link', r.ok === true && /docs.google.com/.test(r.url), r.error || r.url);
  ver('cuenta los pacientes del filtro', r.pacientes === esperados.length, r.pacientes + ' de ' + esperados.length);
  const id = e.copias[0].id;
  const L = e.hojas[id + '|LISTA_ESPERA_QX'];
  ver('copia todas las pestañas', ['LISTA_ESPERA_QX', 'VALIDACION_CALIDAD', 'CATALOGOS', 'INSTRUCTIVO'].every(n => e.hojas[id + '|' + n]));
  ver('conserva el título (fila 1) y el encabezado (fila 3)', L.f[0][0] === 'MATRIZ NOMINAL REGIONAL DE LISTA DE ESPERA QUIRÚRGICA' && JSON.stringify(L.f[2]) === JSON.stringify(cab));
  const datos = L.f.slice(3).filter(x => x.some(v => v !== ''));
  ver('solo quedan los pacientes exportados (sin otros hospitales/servicios)', datos.length === esperados.length && !L.f.some(x => x.includes('OTRO HOSPITAL') || x.includes('CARGADO A MANO')), datos.length);
  ver('ID registro correlativo 1..N', datos.every((x, i) => String(x[0]) === String(i + 1)));
  ver('todas con especialidad GINECOLOGIA', datos.every(x => x[cab.indexOf('especialidad quirurgica')] === 'GINECOLOGIA'));
  ver('la columna con fórmula conserva sus fórmulas', L.fx['4,' + colF] && L.fx['500,' + colF]);
  ver('VALIDACION_CALIDAD conserva su fórmula', e.hojas[id + '|VALIDACION_CALIDAD'].fx['4,2'] === '=COUNTA(LISTA_ESPERA_QX!K4:K500)');
  ver('DNI y fechas se escriben como texto (no se pierden ceros)', L.formatos['4,' + (cab.indexOf('dni') + 1)] === '@');
  ver('el archivo original de la GERESA no se tocó', JSON.stringify(e.hojas[SS2 + '|LISTA_ESPERA_QX'].f) === original);
  ver('compartido SOLO con el correo de la jefa, privado', JSON.stringify(e.copias[0].editores) === '["jefa@gmail.com"]' && e.copias[0].acceso === 'PRIVATE');
  ver('queda en la carpeta de exportaciones', e.copias[0].carpeta === 'Exportaciones GERESA - Hospital Laredo', e.copias[0].carpeta);
  ver('no va a la papelera', !e.copias[0].papelera);
}

console.log('\nARCHIVO .xlsx PARA DESCARGAR');
{
  const { e, G } = estadoNuevo();
  const r = G.post(Object.assign({}, base, { jwt: 'jwt-jefa', salida: 'archivo', correo: '' }));
  ver('devuelve el archivo', r.ok === true && r.salida === 'archivo' && !!r.base64 && /\.xlsx$/.test(r.nombre), r.error || r.nombre);
  ver('no pide correo', r.ok === true);
  ver('la copia se va a la papelera', e.copias[0].papelera === true);
  ver('no se comparte con nadie', e.copias[0].editores.length === 0);
}

console.log('\nFILTROS');
{
  const { G } = estadoNuevo();
  const reg = G.post(Object.assign({}, base, { jwt: 'jwt-jefa', fechaPor: 'registro', servicios: ['cirugia_general'] }));
  const cgSin = DB.filter(p => p.servicio === 'cirugia_general' && !p.fecha_captacion && !p.fecha_primera_evaluacion).length;
  ver('por registro, Cirugía General: los que no tienen fecha se cuentan aparte', reg.sinFecha === cgSin, reg.sinFecha + ' sin fecha');
  const reg2 = G.post(Object.assign({}, base, { jwt: 'jwt-jefa', fechaPor: 'registro', servicios: ['cirugia_general'], incluirSinFecha: true }));
  ver('…y con "incluir sin fecha" entran', reg2.pacientes === reg.pacientes + cgSin, reg2.pacientes);
  const mal = G.post(Object.assign({}, base, { jwt: 'jwt-jefa', desde: '2026-12-01', hasta: '2026-01-01' }));
  ver('fechas al revés: error claro', mal.ok === false && /posterior/.test(mal.error), mal.error);
  const sinServ = G.post(Object.assign({}, base, { jwt: 'jwt-jefa', servicios: [] }));
  ver('sin servicio: error claro', sinServ.ok === false, sinServ.error);
}

console.log('\nSI FALLA AL COMPARTIR');
{
  const { e, G } = estadoNuevo();
  const r = G.post(Object.assign({}, base, { jwt: 'jwt-jefa', correo: 'alguien@no-es-google.pe' }));
  ver('error claro', r.ok === false && /Google/.test(r.error), r.error);
  ver('la copia con datos no queda a medias: papelera', e.copias[0] && e.copias[0].papelera === true);
}

console.log('\n' + (fallas ? fallas + ' FALLA(S)' : 'Todo en orden.'));
process.exitCode = fallas ? 1 : 0;

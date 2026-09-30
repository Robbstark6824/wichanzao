// Prueba que el Apps Script exige la sesión de un usuario aprobado en escribir,
// borrar y sincronizar (y no se fía de lo que mande el teléfono), con Google y
// Supabase de mentira (tools/emulador-apps-script.mjs).
//
//   node tools/test-sesion-apps-script.mjs
//
// Antes de EXIGIR_SESION_DESDE una app vieja (sin sesión) sigue funcionando y se
// cuenta; desde esa fecha, no. Se prueban las dos épocas fijando "hoy".
import fs from 'fs';
import path from 'path';
import { Hoja, cargar } from './emulador-apps-script.mjs';

const RESP = 'C:/Proyectos/respaldos-wichanzao';
const ultimo = fs.readdirSync(RESP).filter(d => /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(d)).sort().pop();
const DB = JSON.parse(fs.readFileSync(path.join(RESP, ultimo, 'datos/public.pacientes.json'), 'utf8'));
const esquema = JSON.parse(fs.readFileSync(path.join(RESP, ultimo, 'esquema.json'), 'utf8'));
const FECHAS = esquema.columnas.filter(c => c.table_name === 'pacientes' && c.data_type === 'date').map(c => c.column_name);
DB.forEach(p => { for (const k of FECHAS) if (p[k]) p[k] = String(p[k]).slice(0, 10); });
const HOJAS = path.join(RESP, '2026-09-29_1509/hojas');
const hojaJson = f => new Hoja(JSON.parse(fs.readFileSync(path.join(HOJAS, f), 'utf8')).map(r => r.map(v => (v && v.__d) ? new Date(v.__d + 'T12:00:00Z') : v)));

const gs = fs.readFileSync('google/apps-script-sync.gs', 'utf8');
const ID = { antigua: '1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU|HOSPITAL LAREDO', cg: '1XsoXl-4mv0CY1sSYi7MrLmf671rvoWC6Uf9xfXLngkc|HOSPITAL LAREDO', oficial: '1IoT5KGuTcT83ZLyHh4SrLR4yhbFjIKkI|LISTA_ESPERA_QX' };

function estado(hoy) {
  const G0 = cargar(gs, { hojas: {}, db: [], activos: [] });
  const cab = ['ID registro'].concat(Object.keys(G0.buildValuesNew(DB[0])));
  const e = {
    hojas: { [ID.antigua]: hojaJson('gineco-hoja-antigua.json'), [ID.cg]: hojaJson('cirugia-general.json'), [ID.oficial]: new Hoja([cab]) },
    db: JSON.parse(JSON.stringify(DB)), activos: ['ginecologia'], hoy,
    sesiones: { 'jwt-gine': 'u-gine', 'jwt-cg': 'u-cg', 'jwt-jefa': 'u-jefa', 'jwt-admin': 'u-admin', 'jwt-pend': 'u-pend' },
    workers: [
      { id: 'u-gine', name: 'Interna Gineco', rol: 'medico', servicio: 'ginecologia', is_admin: false, aprobado: true },
      { id: 'u-cg', name: 'Interno CG', rol: 'medico', servicio: 'cirugia_general', is_admin: false, aprobado: true },
      { id: 'u-jefa', name: 'Jefa', rol: 'jefe_info', servicio: 'ginecologia', is_admin: false, aprobado: true },
      { id: 'u-admin', name: 'Admin', rol: 'medico', servicio: 'ginecologia', is_admin: true, aprobado: true },
      { id: 'u-pend', name: 'Pendiente', rol: 'medico', servicio: 'ginecologia', is_admin: false, aprobado: false }
    ]
  };
  return { e, G: cargar(gs, e) };
}

let fallas = 0;
const ver = (d, ok, x) => { if (!ok) fallas++; console.log((ok ? '  OK    ' : '  FALLA ') + d + (x !== undefined ? '   ->  ' + x : '')); };
const pGine = () => DB.find(p => (p.servicio || 'ginecologia') === 'ginecologia');
const pCG = () => DB.find(p => p.servicio === 'cirugia_general');
const celda = (hoja, dni, columna) => {
  const cab = hoja.f.findIndex(r => r.some(v => String(v).trim() === 'ID registro'));
  const cd = hoja.f[cab].findIndex(v => String(v).trim() === 'DNI'), cc = hoja.f[cab].findIndex(v => String(v).trim() === columna);
  const fila = hoja.f.slice(cab + 1).find(r => String(r[cd]).trim() === String(dni));
  return fila ? String(fila[cc]) : null;
};
const filaDe = (hoja, dni) => celda(hoja, dni, 'DNI') !== null;

console.log('ANTES DE LA FECHA LÍMITE (transición: la app vieja sigue funcionando)');
{
  const { e, G } = estado('2026-09-29');
  const r = G.post({ paciente: pGine() });
  ver('una app vieja (sin sesión) todavía puede escribir', r.ok === true, r.error);
  const est = G.post({ accion: 'estado' });
  ver('y se cuenta, para saber cuándo ya nadie la usa', est.sinSesion === 1 && /escribir/.test(est.sinSesionUltima || ''), est.sinSesion + ' · ' + est.sinSesionUltima);
  ver('el estado anuncia la fecha límite', est.sesionDesde === '2026-10-06', est.sesionDesde);
}

console.log('\nESCRIBIR (con sesión)');
{
  const { e, G } = estado('2026-09-29');
  const gi = pGine(), cg = pCG();
  const falsificado = Object.assign({}, gi, { nombre: 'NOMBRE FALSIFICADO', edad: 99 });
  const r1 = G.post({ jwt: 'jwt-gine', paciente: falsificado });
  ver('una interna de gineco escribe una paciente de gineco', r1.ok === true, r1.error);
  ver('en la hoja queda lo que dice la BASE, no lo que mandó el teléfono', celda(e.hojas[ID.antigua], gi.dni, 'Apellidos y nombres completos') === gi.nombre, celda(e.hojas[ID.antigua], gi.dni, 'Apellidos y nombres completos'));
  const r2 = G.post({ jwt: 'jwt-gine', paciente: cg });
  ver('…pero no una de Cirugía General', r2.ok === false && /permiso/.test(r2.error), r2.error);
  ver('y nada de Cirugía General entró a la hoja de gineco', !filaDe(e.hojas[ID.antigua], cg.dni) || celda(e.hojas[ID.antigua], cg.dni, 'Especialidad quirúrgica') !== 'CIRUGIA GENERAL');
  const r3 = G.post({ jwt: 'jwt-cg', paciente: cg });
  ver('un interno de Cirugía General escribe la suya', r3.ok === true, r3.error);
  const r4 = G.post({ jwt: 'jwt-jefa', paciente: gi });
  ver('el jefe de información no escribe (solo lectura)', r4.ok === false && /permiso/.test(r4.error), r4.error);
  const r5 = G.post({ jwt: 'jwt-admin', paciente: cg });
  ver('el admin escribe de cualquier servicio', r5.ok === true, r5.error);
  const r6 = G.post({ jwt: 'jwt-pend', paciente: gi });
  ver('una cuenta sin aprobar, no', r6.ok === false && /aprobada/.test(r6.error), r6.error);
  const r7 = G.post({ jwt: 'jwt-inventado', paciente: gi });
  ver('una sesión inventada o vencida, no', r7.ok === false && /sesión venció/.test(r7.error), r7.error);
  const r8 = G.post({ jwt: 'jwt-gine', paciente: { id: 'no-existe', dni: '11111111', nombre: 'X' } });
  ver('una paciente que no está en la base, no', r8.ok === false && /no existe/.test(r8.error), r8.error);
  const r9 = G.post({ jwt: 'jwt-gine', paciente: { dni: '11111111', nombre: 'X' } });
  ver('sin id de paciente, no', r9.ok === false, r9.error);
}

console.log('\nBORRAR');
{
  const { e, G } = estado('2026-09-29');
  const gi = pGine();
  const r1 = G.post({ jwt: 'jwt-gine', accion: 'borrar', dni: gi.dni, servicio: 'ginecologia' });
  ver('si la paciente SIGUE en la base, no es un borrado: rechazado', r1.ok === false && /sigue en la base/.test(r1.error), r1.error);
  ver('y su fila sigue en la hoja', filaDe(e.hojas[ID.antigua], gi.dni));
  e.db = e.db.filter(p => p.id !== gi.id);                     // la app la borra primero de la base
  const r2 = G.post({ jwt: 'jwt-cg', accion: 'borrar', dni: gi.dni, servicio: 'ginecologia' });
  ver('un usuario de otro servicio no puede borrar filas de gineco', r2.ok === false && /permiso/.test(r2.error), r2.error);
  const r3 = G.post({ jwt: 'jwt-jefa', accion: 'borrar', dni: gi.dni, servicio: 'ginecologia' });
  ver('el jefe de información no borra', r3.ok === false && /permiso/.test(r3.error), r3.error);
  const r4 = G.post({ jwt: 'jwt-gine', accion: 'borrar', dni: gi.dni, servicio: 'ginecologia' });
  ver('la interna de gineco, ya sin la paciente en la base, sí', r4.ok === true, r4.error);
  ver('y la fila sale de la hoja', !filaDe(e.hojas[ID.antigua], gi.dni));
}

console.log('\nSINCRONIZAR');
{
  const { G } = estado('2026-09-29');
  const r1 = G.post({ jwt: 'jwt-jefa', accion: 'sincronizar' });
  ver('el jefe de información puede sincronizar', r1.ok === true || !/sesión|permiso|aprobada/.test(r1.error || ''), JSON.stringify({ ok: r1.ok, error: r1.error }));
  const r2 = G.post({ jwt: 'jwt-pend', accion: 'sincronizar' });
  ver('una cuenta sin aprobar, no', r2.ok === false && /aprobada/.test(r2.error), r2.error);
}

console.log('\nDESDE LA FECHA LÍMITE (2026-10-06)');
{
  const { e, G } = estado('2026-10-06');
  const gi = pGine();
  const a = G.post({ paciente: gi });
  ver('sin sesión, escribir: rechazado', a.ok === false && /falta la sesión/.test(a.error), a.error);
  const b = G.post({ accion: 'borrar', dni: gi.dni, servicio: 'ginecologia' });
  ver('sin sesión, borrar: rechazado', b.ok === false && /falta la sesión/.test(b.error), b.error);
  ver('y la fila no se tocó', filaDe(e.hojas[ID.antigua], gi.dni));
  const c = G.post({ accion: 'sincronizar' });
  ver('sin sesión, sincronizar: rechazado', c.ok === false && /falta la sesión/.test(c.error), c.error);
  const d = G.post({ jwt: 'jwt-gine', paciente: gi });
  ver('con sesión sigue funcionando igual', d.ok === true, d.error);
  const f = G.post({ accion: 'estado' });
  ver('el indicador de la app (estado) no necesita sesión', f.ok === true && 'ultimaSync' in f);
  const g = G.post({ token: 'otro', accion: 'estado' });
  ver('con un token equivocado, nada', g.ok === false);
}

console.log('\n' + (fallas ? fallas + ' FALLA(S)' : 'Todo en orden.'));
process.exitCode = fallas ? 1 : 0;

// Reparación puntual: PAREDES PELAEZ, YARITZA quedó en 'en_tramite' porque la
// sincronización con la hoja GERESA revirtió su cierre (ver fix qxSyncFromSheet).
// La historia clínica y los campos de cierre dicen que está cerrada sin cirugía.
// Se restaura el estado, se deja constancia en historial_estados y se empuja la
// fila a las dos hojas de Google.
import fs from 'fs';

const SB_URL = 'https://xqphjvppfgwabfruyjae.supabase.co';
const KEY = fs.readFileSync('.env', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/)[1];
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbxH2ZHmkZ9d68nFD7Sww40Shbv0lQ7FibzGfeRze48Powy5qj-ygD8rYPoCZy4qiAxEhw/exec';
const SHEET_TOKEN = 'WZ-GERESA-2026-Kx7mQ2p9';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

const rest = async (path, opts = {}) => {
  const r = await fetch(SB_URL + '/rest/v1/' + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(path + ' → HTTP ' + r.status + ' ' + t);
  return t ? JSON.parse(t) : null;
};

const [antes] = await rest("pacientes?nombre=eq.PAREDES%20PELAEZ,%20YARITZA&select=*");
if (!antes) throw new Error('No se encontró a la paciente');
console.log('ANTES  → estado:', antes.estado, '| motivo_cierre:', antes.motivo_cierre);

if (antes.estado !== 'en_tramite') {
  console.log('La fila ya no está en en_tramite; no se toca nada.');
  process.exit(0);
}

const [despues] = await rest('pacientes?id=eq.' + antes.id, {
  method: 'PATCH',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify({ estado: 'referida' })
});
console.log('DESPUES → estado:', despues.estado);

await rest('historial_estados', {
  method: 'POST',
  body: JSON.stringify({
    paciente_id: antes.id, estado_anterior: 'en_tramite', estado_nuevo: 'referida',
    motivo: 'Corrección de datos: la sincronización con la hoja GERESA había revertido el cierre registrado en la app'
  })
});
console.log('Historial: constancia de la corrección registrada.');

const resp = await fetch(SHEET_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ token: SHEET_TOKEN, paciente: despues })
});
console.log('HOJAS   →', await resp.text());

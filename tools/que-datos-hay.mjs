// ¿Qué preguntas se pueden responder YA con lo que la app lleva capturando?
import fs from 'fs';
const KEY = fs.readFileSync('.env', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/)[1];
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
const q = async p => (await fetch('https://xqphjvppfgwabfruyjae.supabase.co/rest/v1/' + p, { headers: H })).json();

const ps = await q('pacientes?select=*');
const dias = (a, b) => (a && b) ? Math.round((new Date(b) - new Date(a)) / 86400000) : null;

const campos = ['fecha_captacion', 'fecha_primera_evaluacion', 'fecha_examen1', 'fecha_fase2',
  'fecha_cita_cardiologia', 'fecha_cita_anestesiologia', 'fecha_evaluacion_preoperatoria',
  'fecha_fase3', 'fecha_fase4', 'fecha_fase5', 'fecha_cirugia', 'fecha_real_operacion',
  'fecha_cierre', 'fecha_suspension', 'motivo_espera', 'motivo_cierre', 'motivo_suspension'];

console.log('QUÉ TAN LLENOS ESTÁN LOS CAMPOS (' + ps.length + ' pacientes)\n');
for (const c of campos) {
  const n = ps.filter(p => p[c] !== null && p[c] !== '').length;
  const barra = '█'.repeat(n) + '·'.repeat(ps.length - n);
  console.log('  ' + c.padEnd(32) + barra + '  ' + n + '/' + ps.length);
}

console.log('\n\nTIEMPOS DE ESPERA REALES (días)\n');
const tramos = [];
for (const p of ps) {
  const inicio = p.fecha_primera_evaluacion || p.fecha_captacion;
  const fin = p.fecha_real_operacion || p.fecha_cirugia;
  const total = dias(inicio, fin);
  if (total === null) continue;
  tramos.push({ n: p.nombre, total, estado: p.estado,
    aEval: dias(inicio, p.fecha_evaluacion_preoperatoria),
    aCirug: dias(p.fecha_evaluacion_preoperatoria, fin) });
}
tramos.sort((a, b) => b.total - a.total);
tramos.forEach(t => console.log('  ' + String(t.total).padStart(4) + ' d · ' +
  t.n.padEnd(30).slice(0, 30) + ' · ' + t.estado));

if (tramos.length) {
  const v = tramos.map(t => t.total).sort((a, b) => a - b);
  const med = v[Math.floor(v.length / 2)];
  console.log('\n  Mediana: ' + med + ' días · Mínimo: ' + v[0] + ' · Máximo: ' + v[v.length - 1]);
}

console.log('\n\nDESENLACES\n');
const porEstado = {};
ps.forEach(p => { porEstado[p.estado] = (porEstado[p.estado] || 0) + 1; });
Object.entries(porEstado).forEach(([e, n]) => console.log('  ' + e.padEnd(16) + n));

console.log('\nMOTIVOS DE CIERRE Y SUSPENSIÓN registrados\n');
ps.filter(p => p.motivo_cierre || p.motivo_suspension).forEach(p =>
  console.log('  ' + p.nombre.padEnd(30).slice(0, 30) + ' · ' + (p.motivo_cierre || p.motivo_suspension)));

const hist = await q('historial_estados?select=*&order=created_at');
console.log('\n\nHISTORIAL: ' + hist.length + ' cambios de estado registrados');
console.log('  (con quién y cuándo desde hoy; antes solo cuándo)');

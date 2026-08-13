// Diagnóstico del flujo de REGISTRO (por qué falla "guardar usuarios nuevos").
// Reproduce exactamente lo que hace index.html: signUp → INSERT en workers.
// Crea un usuario temporal y lo borra al final (limpia su propia basura).

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach((l) => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
});

const SB_URL = 'https://xqphjvppfgwabfruyjae.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxcGhqdnBwZmd3YWJmcnV5amFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MzgwMzcsImV4cCI6MjA4ODUxNDAzN30.RfRjO72-53ixpT5G-cG5wTA2RIM8ZzEM67ZvA8Q2zOo';
const SR_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const anon = createClient(SB_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(SB_URL, SR_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const folderId = '__diag__' + Math.floor(Math.random() * 100000);

(async () => {
  const email = folderId + '.medicina@wichanzao.local';
  console.log('1) signUp con:', email);

  const signUp = await anon.auth.signUp({ email, password: 'diagnostico123' });
  if (signUp.error) {
    console.log('   signUp ERROR:', signUp.error.message);
    // Si ya existe por un run anterior, intentamos login
    const login = await anon.auth.signInWithPassword({ email, password: 'diagnostico123' });
    if (login.error) {
      console.log('   login ERROR:', login.error.message);
      process.exit(0);
    }
    signUp.data = login.data;
    console.log('   (usuario ya existía, usé login)');
  }
  const session = signUp.data.session;
  if (!session) {
    console.log('   ⚠️  signUp NO devolvió session (probablemente email confirmation ACTIVADO).');
    console.log('   Esto rompe el registro: hay que desactivar "Confirm email" en Dashboard.');
    process.exit(0);
  }
  const userId = session.user.id;
  const token = session.access_token;
  console.log('   ✅ session OK, user.id =', userId);

  console.log('2) INSERT en workers (igual que index.html)...');
  const insertResp = await fetch(SB_URL + '/rest/v1/workers', {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates'
    },
    body: JSON.stringify({
      id: userId,
      folder_id: folderId,
      name: 'Diag Registro',
      servicio: 'medicina',
      area: 'Medico'
    })
  });
  const insertBody = await insertResp.text();
  console.log('   status:', insertResp.status);
  console.log('   body:', insertBody.slice(0, 400));

  if (insertResp.ok) {
    console.log('   ✅ INSERT OK — el registro SÍ funciona. El problema está en otro lado.');
  } else {
    console.log('   ❌ INSERT FALLÓ. Este es el error que ve el usuario.');
  }

  // 3) Probar también subida de carpeta (profile.json)
  console.log('3) Subir profile.json (crea la carpeta en Storage)...');
  const up = await anon.storage.from('documentos').upload(
    'medicina/workers/' + folderId + '/profile.json',
    new Blob([JSON.stringify({ name: 'Diag', folder_id: folderId })]),
    { contentType: 'application/json', upsert: true }
  );
  console.log('   storage upload:', up.error ? 'ERROR ' + up.error.message : '✅ OK');

  // LIMPIEZA: borrar lo que se creó
  console.log('4) Limpieza...');
  if (up.data) await anon.storage.from('documentos').remove(['medicina/workers/' + folderId]);
  const del = await admin.auth.admin.deleteUser(userId);
  console.log('   deleteUser:', del.error ? 'ERROR ' + del.error.message : 'OK');
  if (insertResp.ok) {
    const delW = await admin.from('workers').delete().eq('folder_id', folderId);
    console.log('   delete worker row:', delW.error ? 'ERROR ' + delW.error.message : 'OK');
  }
  console.log('\nListo. Diagnóstico completo.');
})();

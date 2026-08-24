const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Read .env (manual parse, no dotenv needed)
const envPath = 'C:/Proyectos/wichanzao-final/.env';
const envRaw = fs.readFileSync(envPath, 'utf8');
const env = {};
envRaw.split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
});

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('Conectando a Supabase...\n');

  // 1) List all auth users
  console.log('=== USUARIOS (auth.users) ===');
  const { data: users, error: uErr } = await sb.auth.admin.listUsers();
  if (uErr) {
    console.log('Error auth.users:', uErr.message);
  } else {
    users.users.forEach(u => {
      const meta = u.user_metadata || {};
      console.log('-------------------------------------------');
      console.log('Email:     ', u.email);
      console.log('ID:        ', u.id);
      console.log('Creado:    ', new Date(u.created_at).toLocaleString('es-PE'));
      console.log('Ult login: ', u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('es-PE') : 'nunca');
      console.log('Meta:      ', JSON.stringify(meta));
    });
    console.log('-------------------------------------------');
    console.log('Total: ' + users.users.length + ' usuarios');
  }

  // 2) List workers table
  console.log('\n=== TRABAJADORES (workers) ===');
  const { data: workers, error: wErr } = await sb
    .from('workers')
    .select('*')
    .order('created_at', { ascending: false });
  if (wErr) {
    console.log('Error workers:', wErr.message);
  } else {
    workers.forEach(w => {
      const adminBadge = w.is_admin ? ' 👑 ADMIN' : '';
      console.log('-------------------------------------------');
      console.log('Name:      ', w.name);
      console.log('Folder:    ', w.folder_id);
      console.log('ID:        ', w.id);
      console.log('Admin:     ', w.is_admin ? 'SI' : 'no');
      console.log('Creado:    ', w.created_at ? new Date(w.created_at).toLocaleString('es-PE') : 'n/a');
    });
    console.log('-------------------------------------------');
    console.log('Total: ' + workers.length + ' trabajadores');
  }
}

main().catch(e => console.error('Error:', e.message));

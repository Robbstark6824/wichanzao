// Borra la cuenta de PRUEBA "Test Gineco" (testgineco):
//   - el usuario en auth.users (email testgineco.obstetricia@wichanzao.local)
//   - su fila en la tabla `workers`
// No tiene carpeta en Storage, así que no hay nada que borrar ahí.
//
// Uso:
//   node tools/delete-testgineco.js            -> solo muestra lo que borraría (dry-run)
//   node tools/delete-testgineco.js --delete   -> borra de verdad (irreversible)

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach((l) => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
});
const DO_DELETE = process.argv.includes('--delete');

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const FOLDER = 'testgineco';

(async () => {
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 100 });
  const target = (users?.users || []).find((u) => (u.email || '').startsWith(FOLDER + '.'));

  const { data: worker } = await sb.from('workers').select('id,name,folder_id').eq('folder_id', FOLDER).maybeSingle();

  console.log((DO_DELETE ? 'BORRANDO' : 'DRY-RUN (no se borra nada)') + ' — cuenta testgineco\n');
  console.log('  auth.user: ' + (target ? target.email : '(no encontrado)'));
  console.log('  workers:   ' + (worker ? worker.folder_id + ' (' + worker.name + ')' : '(no encontrado)'));

  if (DO_DELETE) {
    if (target) {
      const r = await sb.auth.admin.deleteUser(target.id);
      console.log('  -> auth delete: ' + (r.error ? 'ERROR ' + r.error.message : 'OK'));
    }
    if (worker) {
      const w = await sb.from('workers').delete().eq('id', worker.id);
      console.log('  -> workers delete: ' + (w.error ? 'ERROR ' + w.error.message : 'OK'));
    }
  }

  const { data: after } = await sb.auth.admin.listUsers({ perPage: 100 });
  const { data: afterW } = await sb.from('workers').select('folder_id,name');
  console.log('\nUsuarios restantes: ' + (after?.users?.length || 0) + ' -> ' + (after?.users || []).map((u) => u.email).join(', '));
  console.log('Workers restantes: ' + (afterW || []).map((x) => x.folder_id + ' (' + x.name + ')').join(', '));
})();

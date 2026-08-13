// Borra usuarios HUÉRFANOS de auth.users:
//   - no tienen fila en la tabla `workers`
//   - no tienen carpeta en Storage (`medicina/workers/…`, etc.)
// NO toca nunca a los usuarios reales: robert-macedo, jorge-tepetongo, testgineco.
//
// Uso:
//   node tools/delete-orphans.js            -> solo muestra lo que borraría (dry-run)
//   node tools/delete-orphans.js --delete   -> borra de verdad (irreversible)

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

// Lista blanca: NUNCA borrar
const KEEP_FOLDERS = new Set(['robert-macedo', 'jorge-tepetongo', 'testgineco']);

const PREFIXES = [
  'medicina/workers/', 'enfermeria/workers/', 'obstetricia/workers/',
  'psicologia/workers/', 'odontologia/workers/', 'nutricion/workers/',
  'administrativos/workers/', 'tar/workers/', 'ginecologia/workers/', 'workers/'
];

(async () => {
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 100 });
  const { data: workers } = await sb.from('workers').select('folder_id');
  const workerFolders = new Set((workers || []).map((w) => w.folder_id));

  const storageFolders = new Set();
  for (const p of PREFIXES) {
    const r = await sb.storage.from('documentos').list(p);
    (r.data || []).filter((i) => i.id === null).forEach((i) => storageFolders.add(i.name));
  }

  const toDelete = [];
  for (const u of users?.users || []) {
    const folder = (u.email || '').split('@')[0].split('.')[0];
    if (KEEP_FOLDERS.has(folder)) continue;
    if (workerFolders.has(folder)) continue;
    if (storageFolders.has(folder)) continue;
    toDelete.push({ id: u.id, email: u.email, folder });
  }

  console.log((DO_DELETE ? 'BORRANDO' : 'DRY-RUN (no se borra nada)') + ' — huérfanos: ' + toDelete.length + '\n');
  for (const t of toDelete) {
    if (DO_DELETE) {
      const r = await sb.auth.admin.deleteUser(t.id);
      console.log('  ' + (r.error ? 'ERROR ' + r.error.message : '✓ borrado') + '  ' + t.email);
    } else {
      console.log('  [borraría] ' + t.folder + '  -> ' + t.email);
    }
  }

  const { data: after } = await sb.auth.admin.listUsers({ perPage: 100 });
  console.log('\nUsuarios restantes: ' + (after?.users?.length || 0));
})();

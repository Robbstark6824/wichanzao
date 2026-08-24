const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach((l) => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
});
const SB_URL = 'https://xqphjvppfgwabfruyjae.supabase.co';
const admin = createClient(SB_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function walk(prefix, depth) {
  const { data, error } = await admin.storage.from('documentos').list(prefix, { limit: 1000 });
  if (error) { console.log('  '.repeat(depth) + prefix + ' -> ERROR ' + error.message); return; }
  for (const d of data) {
    if (d.id === null) {
      // folder
      console.log('  '.repeat(depth) + '[' + d.name + ']/');
      await walk(prefix + '/' + d.name, depth + 1);
    } else {
      console.log('  '.repeat(depth) + d.name + '  (' + d.metadata?.size + ' bytes)');
    }
  }
}
(async () => {
  await walk('medicina/workers/robert-macedo', 0);
  console.log('---');
  await walk('ginecologia/workers/robert-macedo', 0);
  console.log('---');
  await walk('medicina/workers/jorge-tepetongo', 0);
  console.log('---');
  await walk('ginecologia/workers/janice-rios', 0);
})();

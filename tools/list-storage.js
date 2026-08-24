const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach((l) => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
});
const SB_URL = 'https://xqphjvppfgwabfruyjae.supabase.co';
const admin = createClient(SB_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
(async () => {
  const prefixes = ['medicina/workers/', 'ginecologia/workers/'];
  for (const p of prefixes) {
    console.log('=== ' + p + ' ===');
    const { data, error } = await admin.storage.from('documentos').list(p, { limit: 1000 });
    if (error) { console.log('  ERROR', error.message); continue; }
    for (const d of data) console.log('  ' + d.name + ' (id=' + d.id + ')');
  }
})();

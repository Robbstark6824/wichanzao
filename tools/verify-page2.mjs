import puppeteer from 'puppeteer';
import http from 'http';
import fs from 'fs';
import path from 'path';

const BASE = 'C:/Proyectos/wichanzao-final';
const PORT = 9877;

const server = http.createServer((req, res) => {
  let filePath = path.join(BASE, req.url === '/' ? 'index.html' : req.url.replace(/^\//, ''));
  try {
    const content = fs.readFileSync(filePath);
    const mime = {'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.css':'text/css','.webmanifest':'application/manifest+json'};
    res.writeHead(200, {'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream'});
    res.end(content);
  } catch(e) { res.writeHead(404); res.end('Not found'); }
});

server.listen(PORT, '127.0.0.1');
console.log('Server on http://127.0.0.1:' + PORT);

try {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Capture ALL console
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => consoleLogs.push({ type: 'pageerror', text: err.message }));

  await page.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // Check if sb (Supabase client) exists and check auth
  const supabaseStatus = await page.evaluate(async () => {
    try {
      if (typeof sb === 'undefined') return { error: 'sb is undefined - Supabase not loaded!' };
      const { data } = await sb.auth.getSession();
      return { sbExists: true, hasSession: !!data.session, userId: data.session?.user?.id || null };
    } catch(e) {
      return { error: e.message };
    }
  });
  console.log('\n=== Supabase status ===');
  console.log(JSON.stringify(supabaseStatus, null, 2));

  // Check what views exist and their state
  const viewState = await page.evaluate(() => {
    const views = document.querySelectorAll('.V');
    const result = [];
    views.forEach(v => {
      result.push({ id: v.id, visible: v.classList.contains('on'), hasContent: v.innerHTML.length > 20 });
    });
    return result;
  });
  console.log('\n=== Views ===');
  viewState.forEach(v => console.log(`  ${v.id}: visible=${v.visible}, hasContent=${v.hasContent}`));

  // Check if showModule works
  const moduleTest = await page.evaluate(() => {
    try {
      if (typeof showModule !== 'function') return 'showModule is not a function!';
      if (typeof showView !== 'function') return 'showView is not a function!';
      return 'showModule and showView exist';
    } catch(e) { return e.message; }
  });
  console.log('\n=== Module functions ===');
  console.log(moduleTest);

  // Check for any uncaught errors in the page
  const pageErrors = consoleLogs.filter(l => l.type === 'error' || l.type === 'pageerror');
  const pageWarnings = consoleLogs.filter(l => l.type === 'warning');

  console.log('\n=== JS Errors: ' + pageErrors.length + ' ===');
  pageErrors.forEach(e => console.log('  ❌', e.text));

  console.log('\n=== JS Warnings: ' + pageWarnings.length + ' ===');
  pageWarnings.forEach(w => console.log('  ⚠️', w.text));

  // Check if specific global functions exist
  const globals = ['showModule','showView','hospiCropImage','hospiRenderPreviews','hospiInit','hospiNuevaEvolucion','hospiGuardarEvolucion','hospiRemovePhoto','hospiTakePhoto','hospiHandleFiles'];
  const globalCheck = await page.evaluate((names) => {
    const result = {};
    names.forEach(n => { result[n] = typeof window[n] === 'function' ? 'function' : typeof window[n] === 'undefined' ? 'MISSING' : typeof window[n]; });
    return result;
  }, globals);
  console.log('\n=== Global functions ===');
  Object.entries(globalCheck).forEach(([k,v]) => {
    console.log('  ' + k + ': ' + (v === 'function' ? '✅' : v === 'MISSING' ? '❌ MISSING!' : '⚠️ ' + v));
  });

  await browser.close();
} catch(e) {
  console.error('FATAL:', e.message);
} finally {
  server.close();
  process.exit(0);
}

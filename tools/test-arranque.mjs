// Prueba de arranque: comprueba que la app abre aunque los CDN fallen.
//
//   python -m http.server 8777      (desde la raiz del proyecto)
//   node tools/test-arranque.mjs                  CDN normales
//   node tools/test-arranque.mjs --sin-cdn-primario   cae al de repuesto
//   node tools/test-arranque.mjs --sin-cdn            pantalla de reintentar
const puppeteer = (await import('puppeteer')).default;

const URL = 'http://localhost:8777/index.html';
const BLOQUEAR_CDN = process.argv.includes('--sin-cdn');
const BLOQUEAR_SOLO_PRIMARIO = process.argv.includes('--sin-cdn-primario');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });

  const errores = [];
  const consola = [];
  page.on('console', m => {
    consola.push(`[${m.type()}] ${m.text()}`);
    if (m.type() === 'error') errores.push(m.text());
  });
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));

  if (BLOQUEAR_CDN || BLOQUEAR_SOLO_PRIMARIO) {
    await page.setRequestInterception(true);
    page.on('request', req => {
      const u = req.url();
      const esPrimario = u.includes('cdn.jsdelivr.net/npm/@supabase');
      const esRepuesto = u.includes('unpkg.com');
      if (BLOQUEAR_CDN && (esPrimario || esRepuesto)) return req.abort();
      if (BLOQUEAR_SOLO_PRIMARIO && esPrimario) return req.abort();
      req.continue();
    });
  }

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, BLOQUEAR_CDN ? 6000 : 3500));

  const estado = await page.evaluate(() => {
    const vis = id => {
      const e = document.getElementById(id);
      return !!(e && e.classList.contains('on'));
    };
    const fns = ['toast', 'showView', 'showModule', 'doLogin', 'doRegister', 'qxLoad',
                 'qxRefrescar', 'valorDe', 'obtenerJsPDF', 'asegurarJsPdf', 'mensajeDeError',
                 'registrarFalla', 'loadPreviousDates', 'startCamera', 'generatePdf',
                 'mensajeDeCamara', 'fetchConTiempo', 'saveTodayFiles', 'dataUrlToBlob'];
    return {
      titulo: document.title,
      sbCreado: !!window.sb,
      haySupabase: typeof haySupabase === 'function' ? haySupabase() : null,
      hayJsPdf: typeof hayJsPdf === 'function' ? hayJsPdf() : null,
      pantallaFallo: !!document.getElementById('btnReintentarCarga'),
      vistaWelcome: vis('vWelcome'),
      vistaMain: vis('vMain'),
      faltantes: fns.filter(f => typeof window[f] !== 'function'),
      fallas: (window._fallasRecientes || []).map(f => f.origen + ': ' + f.detalle),
    };
  });

  console.log('--- estado ---');
  console.log(JSON.stringify(estado, null, 2));
  if (errores.length) {
    console.log('--- errores de consola (' + errores.length + ') ---');
    errores.slice(0, 15).forEach(e => console.log('  ' + e.slice(0, 220)));
  } else {
    console.log('--- sin errores de consola ---');
  }

  await page.screenshot({ path: process.env.SHOT || 'humo.png' });
  await browser.close();

  const ok = estado.faltantes.length === 0;
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FALLO:', e); process.exit(2); });

// Prueba de robustez: abre index.html en un Chrome de verdad y comprueba que
// los fallos conocidos de la app salen como mensajes entendibles en vez de
// matar el boton en silencio.
//
//   python -m http.server 8777      (desde la raiz del proyecto)
//   node tools/test-robustez.mjs
const puppeteer = (await import('puppeteer')).default;
const URL = 'http://localhost:8777/index.html';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2500));

  const r = await page.evaluate(async () => {
    const out = [];
    const t = (nombre, cond, extra) => out.push({ nombre, ok: !!cond, extra: extra === undefined ? '' : String(extra) });

    // --- valorDe con un campo que no existe (panel ya cerrado) ---
    let lanzo = false;
    let v;
    try { v = valorDe('campo-que-no-existe-jamas'); } catch (e) { lanzo = true; }
    t('valorDe de un campo inexistente devuelve "" y no lanza', !lanzo && v === '', JSON.stringify(v));
    t('valorDe(...).trim() encadena sin romper', valorDe('nada').trim() === '');

    // --- traduccion de errores ---
    t('"Failed to fetch" -> mensaje de conexion',
      /Sin conexión con el servidor/.test(mensajeDeError(new Error('Failed to fetch'))),
      mensajeDeError(new Error('Failed to fetch')));
    t('QuotaExceeded -> mensaje de espacio',
      /sin espacio/.test(mensajeDeError(new Error('QuotaExceededError'))),
      mensajeDeError(new Error('QuotaExceededError')));
    t('JWT expirado -> mensaje de sesion',
      /sesión venció/.test(mensajeDeError(new Error('JWT expired'))),
      mensajeDeError(new Error('JWT expired')));
    t('error sin mensaje no devuelve "undefined"',
      mensajeDeError(null) === 'Ocurrió un error inesperado.', mensajeDeError(null));

    // --- toast: dedupe, tipos, y no lanza sin contenedor ---
    document.getElementById('toastContainer').innerHTML = '';
    toast('mensaje repetido', 'error');
    toast('mensaje repetido', 'error');
    toast('mensaje repetido', 'error');
    const n1 = document.querySelectorAll('#toastContainer .toast').length;
    t('tres toasts iguales seguidos muestran uno solo', n1 === 1, n1 + ' visibles');

    toast('otro distinto', 'warn');
    const warn = document.querySelector('#toastContainer .toast.warn');
    const bg = warn ? getComputedStyle(warn).backgroundColor : '';
    t('el toast "warn" tiene fondo propio (antes era invisible)',
      warn && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent', bg);

    let lanzoToast = false;
    const cont = document.getElementById('toastContainer');
    const padre = cont.parentNode; padre.removeChild(cont);
    try { toast('sin contenedor', 'error'); } catch (e) { lanzoToast = true; }
    padre.appendChild(cont);
    t('toast sin contenedor no lanza', !lanzoToast);

    // --- dataUrlToBlob con basura ---
    let msgBlob = '';
    try { dataUrlToBlob('esto no es un dataURL'); } catch (e) { msgBlob = e.message; }
    t('dataUrlToBlob con basura da un mensaje legible, no un InvalidCharacterError',
      /dañada/.test(msgBlob), msgBlob);
    let msgBlob2 = '';
    try { dataUrlToBlob(null); } catch (e) { msgBlob2 = e.message; }
    t('dataUrlToBlob(null) tampoco revienta feo', /dañada/.test(msgBlob2), msgBlob2);

    // --- saveTodayFiles tolera quedarse sin espacio ---
    const real = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function () { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; };
    let lanzoSave = false, res;
    try { res = saveTodayFiles(); } catch (e) { lanzoSave = true; }
    localStorage.setItem = real;
    t('saveTodayFiles sin espacio avisa y devuelve false, no lanza', !lanzoSave && res === false, 'lanzo=' + lanzoSave + ' res=' + res);

    // --- obtenerJsPDF da un mensaje entendible cuando falta la libreria ---
    const jspdfReal = window.jspdf;
    window.jspdf = undefined;
    let msgPdf = '';
    try { obtenerJsPDF(); } catch (e) { msgPdf = e.message; }
    window.jspdf = jspdfReal;
    t('sin jsPDF el error se entiende (no "reading \'jsPDF\'")',
      /generador de PDF/.test(msgPdf), msgPdf);

    // --- fetchConTiempo corta ---
    const t0 = Date.now();
    let abortado = false;
    try { await fetchConTiempo('http://localhost:9/colgado', {}, 400); }
    catch (e) { abortado = (e.name === 'AbortError') || /fetch/i.test(e.message); }
    t('fetchConTiempo corta y no queda colgado', abortado && Date.now() - t0 < 4000, (Date.now() - t0) + 'ms');

    // --- guarda contra doble envio ---
    t('existe la guarda de doble envio en login/registro', typeof _authEnCurso === 'boolean');

    // --- qxRefrescar existe y no bloquea ---
    t('qxRefrescar existe (refresco local en vez de recarga completa)', typeof qxRefrescar === 'function');
    t('qxLoad acepta modo silencioso', /silencioso/.test(qxLoad.toString()));

    // --- registro de fallas ---
    registrarFalla('prueba', new Error('algo'));
    t('las fallas quedan registradas para diagnostico', (window._fallasRecientes || []).some(f => f.origen === 'prueba'));

    // --- mensajes de camara ---
    t('permiso de camara denegado da su propio mensaje',
      /permiso/i.test(mensajeDeCamara({ name: 'NotAllowedError' })), mensajeDeCamara({ name: 'NotAllowedError' }));
    t('camara ocupada por otra app da su propio mensaje',
      /ocupada/i.test(mensajeDeCamara({ name: 'NotReadableError' })), mensajeDeCamara({ name: 'NotReadableError' }));

    return out;
  });

  let fallos = 0;
  console.log('');
  for (const c of r) {
    if (!c.ok) fallos++;
    console.log(`${c.ok ? '  OK  ' : ' FALLA'}  ${c.nombre}${c.extra ? '   ->  ' + c.extra : ''}`);
  }

  // --- red de seguridad global ---
  // Los errores lanzados desde page.evaluate no llegan a los oyentes de la
  // pagina: hay que inyectarlos como un <script> de verdad.
  await page.evaluate(() => { document.getElementById('toastContainer').innerHTML = ''; window._toastUltimo = { msg: '', t: 0 }; });
  await page.addScriptTag({ content: 'setTimeout(function(){ null.x; }, 10);' });
  await new Promise(r2 => setTimeout(r2, 700));
  const visible = await page.evaluate(() => {
    const el = document.querySelector('#toastContainer .toast.error');
    return el ? el.textContent.trim() : null;
  });
  const okRed = !!visible && !/Cannot read|undefined|null/.test(visible);
  if (!okRed) fallos++;
  console.log(`${okRed ? '  OK  ' : ' FALLA'}  un error interno sale como mensaje entendible, sin jerga${visible ? '   ->  "' + visible + '"' : ''}`);

  // --- una promesa rechazada por red sale traducida ---
  await page.evaluate(() => { document.getElementById('toastContainer').innerHTML = ''; window._toastUltimo = { msg: '', t: 0 }; });
  await page.addScriptTag({ content: 'Promise.reject(new Error("Failed to fetch"));' });
  await new Promise(r2 => setTimeout(r2, 700));
  const visible2 = await page.evaluate(() => {
    const el = document.querySelector('#toastContainer .toast.error');
    return el ? el.textContent.trim() : null;
  });
  const okRed2 = !!visible2 && /conexión/.test(visible2);
  if (!okRed2) fallos++;
  console.log(`${okRed2 ? '  OK  ' : ' FALLA'}  una promesa rechazada por red sale traducida${visible2 ? '   ->  "' + visible2 + '"' : ''}`);

  // --- una promesa abortada a proposito NO molesta al usuario ---
  await page.evaluate(() => { document.getElementById('toastContainer').innerHTML = ''; window._toastUltimo = { msg: '', t: 0 }; });
  await page.addScriptTag({ content: 'var e=new Error("AbortError"); e.name="AbortError"; Promise.reject(e);' });
  await new Promise(r2 => setTimeout(r2, 700));
  const nAbort = await page.evaluate(() => document.querySelectorAll('#toastContainer .toast').length);
  const okAbort = nAbort === 0;
  if (!okAbort) fallos++;
  console.log(`${okAbort ? '  OK  ' : ' FALLA'}  cancelar algo a proposito no muestra un error (${nAbort} mensajes)`);

  console.log('');
  console.log(`${r.length + 3} pruebas, ${fallos} fallas`);
  if (errores.length) { console.log('errores de pagina:'); errores.forEach(e => console.log('  ' + e)); }
  await browser.close();
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('FALLO:', e); process.exit(2); });

// Prueba la pantalla de "Cuenta en revisión" en un Chrome de verdad, sin
// tocar la base: se reemplaza leerAprobacion() por una respuesta fija.
//
//   python -m http.server 8777      (desde la raiz del proyecto)
//   node tools/test-aprobacion.mjs
const puppeteer = (await import('puppeteer')).default;
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true });
const errores = [];
page.on('pageerror', e => errores.push(e.message));
await page.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle2' });
await page.waitForFunction(() => typeof showView === 'function' && typeof comprobarAprobacion === 'function');

let fallas = 0;
const ver = (d, ok, x) => { if (!ok) fallas++; console.log((ok ? '  OK    ' : '  FALLA ') + d + (x !== undefined ? '   ->  ' + x : '')); };
const vista = () => page.evaluate(() => (document.querySelector('.V.on') || {}).id);
const espera = ms => new Promise(r => setTimeout(r, ms));

// Cuenta pendiente: entrar a vMain la manda a vPendiente
await page.evaluate(() => {
  window.__respuesta = { aprobado: false, is_admin: false };
  leerAprobacion = async () => window.__respuesta;
  worker = { id: 'prueba-pendiente', name: 'Persona De Prueba', servicio: 'ginecologia', area: 'Interno de Medicina' };
  _aprobacionOk = false;
  showView('vMain');
});
await espera(300);
ver('una cuenta pendiente termina en "Cuenta en revisión"', await vista() === 'vPendiente', await vista());
ver('muestra quién es', (await page.$eval('#pendienteQuien', e => e.textContent)).includes('prueba-pendiente'));

// Sigue pendiente y toca "Ya me aprobaron"
await page.evaluate(() => reintentarAprobacion());
await espera(300);
ver('si sigue pendiente, se queda en la pantalla de espera', await vista() === 'vPendiente', await vista());

// La aprueban
await page.evaluate(() => { window.__respuesta = { aprobado: true, is_admin: false }; reintentarAprobacion(); });
await espera(500);
ver('aprobada, entra a la app', await vista() === 'vMain', await vista());

// Cuenta aprobada desde el principio: no se desvía
await page.evaluate(() => { _aprobacionOk = false; window.__respuesta = { aprobado: true, is_admin: false }; showView('vMain'); });
await espera(300);
ver('una cuenta aprobada entra directo', await vista() === 'vMain', await vista());

// Sin red (leerAprobacion devuelve null): no bloquea
await page.evaluate(() => { _aprobacionOk = false; leerAprobacion = async () => null; showView('vMain'); });
await espera(300);
ver('sin poder comprobar (sin red) no se bloquea', await vista() === 'vMain', await vista());

ver('sin errores de página', errores.length === 0, errores.join(' | '));
await browser.close();
console.log('\n' + (fallas ? fallas + ' FALLA(S)' : 'Todo en orden.'));
process.exitCode = fallas ? 1 : 0;

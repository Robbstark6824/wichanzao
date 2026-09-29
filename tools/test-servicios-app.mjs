// Prueba la Fase 3 (la app según el servicio) en un Chrome de verdad, sin
// tocar la base: se simula el usuario en memoria.
//
//   python -m http.server 8777      (desde la raiz del proyecto)
//   node tools/test-servicios-app.mjs
const puppeteer = (await import('puppeteer')).default;
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true });
const errores = [];
page.on('pageerror', e => errores.push(e.message));
await page.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle2' });
await page.waitForFunction(() => typeof aplicarServicio === 'function' && typeof qxFormulario === 'function');

let fallas = 0;
const ver = (d, ok, x) => { if (!ok) fallas++; console.log((ok ? '  OK    ' : '  FALLA ') + d + (x !== undefined ? '   ->  ' + x : '')); };
const espera = ms => new Promise(r => setTimeout(r, ms));

async function como(servicio) {
  return page.evaluate(async (servicio) => {
    leerAprobacion = async () => ({ aprobado: true, is_admin: false });
    worker = { id: 'prueba', name: 'Persona Prueba', servicio: servicio, area: 'Interno de Medicina' };
    populateMain();
    await qxFormulario(null);
    await new Promise(r => setTimeout(r, 200));
    const sexo = [...document.querySelectorAll('#qxW_sexo option')].map(o => o.value);
    const det = document.querySelector('#qxWizBody details');
    const r = {
      menu: document.getElementById('sidebarServicio').textContent,
      calcNav: getComputedStyle(document.getElementById('navCalculadora')).display,
      calcCard: getComputedStyle(document.getElementById('cardCalculadora')).display,
      recetas: QX_RECETA_TIPOS.length,
      especialidad: QX_WIZ_DATOS.especialidad,
      sexo: sexo.join('|'),
      gestanteVisible: !!det && getComputedStyle(det).display !== 'none',
      titulo: qxTituloServicio([{ servicio: servicio }]),
      whatsapp: qxUtilesMensaje({ servicio: servicio, nombre: 'X', tipo_receta: null }).split('\n').pop()
    };
    const ov = document.querySelector('.qx-overlay'); if (ov) ov.remove();
    return r;
  }, servicio);
}

console.log('GINECOLOGÍA (debe quedar como siempre)');
const g = await como('ginecologia');
ver('menú dice Ginecología', g.menu === 'Ginecología', g.menu);
ver('calculadora obstétrica visible', g.calcNav !== 'none' && g.calcCard !== 'none');
ver('tiene sus recetas', g.recetas > 0, g.recetas);
ver('especialidad GINECOLOGIA', g.especialidad === 'GINECOLOGIA', g.especialidad);
ver('sexo: solo Femenino (como antes)', g.sexo === 'Femenino', g.sexo);
ver('sección de gestante visible', g.gestanteVisible);
ver('PDF: Servicio de Ginecología y Obstetricia', g.titulo === 'Servicio de Ginecología y Obstetricia', g.titulo);
ver('WhatsApp firma igual que antes', g.whatsapp === 'Servicio de Ginecología y Obstetricia', g.whatsapp);

console.log('\nCIRUGÍA GENERAL');
const c = await como('cirugia_general');
ver('menú dice Cirugía General', c.menu === 'Cirugía General', c.menu);
ver('sin calculadora obstétrica', c.calcNav === 'none' && c.calcCard === 'none');
ver('no hereda las recetas de gineco', c.recetas === 0, c.recetas);
ver('especialidad CIRUGIA GENERAL', c.especialidad === 'CIRUGIA GENERAL', c.especialidad);
ver('sexo: en blanco, Femenino o Masculino', c.sexo === '|Femenino|Masculino', c.sexo);
ver('sin sección de gestante', !c.gestanteVisible);
ver('PDF: Servicio de Cirugía General', c.titulo === 'Servicio de Cirugía General', c.titulo);
ver('WhatsApp firma Cirugía General', c.whatsapp === 'Servicio de Cirugía General', c.whatsapp);

console.log('\nOTRA VEZ GINECOLOGÍA en el mismo equipo');
const g2 = await como('ginecologia');
ver('recupera sus recetas', g2.recetas > 0, g2.recetas);
ver('recupera la calculadora', g2.calcNav !== 'none');

console.log('\n"NA" (no aplica) en exámenes y riesgo');
const na = await page.evaluate(async () => {
  const opciones = async (servicio) => {
    worker = { id: 'prueba', name: 'Persona Prueba', servicio: servicio, area: 'Interno de Medicina' };
    await qxFormulario(null);
    QX_WIZ_PASO = 4; qxWizRender && qxWizRender();
    const r = {
      lab: [...document.querySelectorAll('#qxW_laboratorio_completo option')].map(o => o.value).join('|'),
      labHtml: (document.getElementById('qxW_laboratorio_completo') || {}).innerHTML
    };
    const ov = document.querySelector('.qx-overlay'); if (ov) ov.remove();
    return r;
  };
  const g = await opciones('ginecologia');
  const c = await opciones('cirugia_general');
  const pNA = { laboratorio_completo: false, laboratorio_na: true, ekg: false, ekg_na: true,
                fecha_cita_anestesiologia: '2026-09-01', riesgo_qx: false, riesgo_qx_na: true, riesgo_anestesiologico: true };
  const pGin = { laboratorio_completo: true, ekg: false };
  return {
    g, c,
    fase2NA: !!qxFase2Completa(pNA), fase3NA: !!qxFase3Completa(pNA),
    etiqueta: qxNAEt(pNA, 'laboratorio_completo'),
    fase2Gin: !!qxFase2Completa(pGin),
    siMarcoHecho: qxNoAplica({ laboratorio_completo: true, laboratorio_na: true }, 'laboratorio_completo')
  };
});
ver('gineco: Laboratorio solo Sí/No (como antes)', na.g.lab === 'true|false', na.g.lab);
ver('gineco: mismo HTML de siempre', na.g.labHtml === '<option value="true">Sí</option><option value="false" selected="">No</option>', na.g.labHtml);
ver('cirugía: Laboratorio Sí/No/NA', na.c.lab === 'true|false|na', na.c.lab);
ver('NA en laboratorio y EKG completa la fase 2', na.fase2NA);
ver('NA en riesgo quirúrgico (sin cita cardiología) completa la fase 3', na.fase3NA);
ver('en el recorrido se ve "(NA)"', na.etiqueta === ' (NA)', na.etiqueta);
ver('gineco sin EKG sigue sin fase 2', na.fase2Gin === false);
ver('si después se marca Sí, deja de contar como NA', na.siMarcoHecho === false);

console.log('\nVISTA DE LA LISTA Qx');
const vista = await page.evaluate(() => {
  const r = {};
  isAdmin = false; QX_SERVICIO_VISTA = null;
  worker = { id: 'x', name: 'X', servicio: 'cirugia_general', area: 'Interno de Medicina' };
  r.cgComun = qxServicioVista();
  qxServicioVistaPintar(); r.selectorComun = document.getElementById('qxServicioVistaWrap').style.display;
  worker = { id: 'r', name: 'Admin', servicio: 'ginecologia', area: 'Interno de Medicina', is_admin: true };
  try { localStorage.removeItem('qx_servicio_vista'); } catch (e) {}
  QX_SERVICIO_VISTA = null;
  r.adminInicio = qxServicioVista();
  qxServicioVistaPintar();
  r.selectorAdmin = document.getElementById('qxServicioVistaWrap').style.display;
  r.opciones = [...document.querySelectorAll('#qxServicioVista option')].map(o => o.value).join('|');
  QX_SERVICIO_VISTA = 'cirugia_general';
  r.adminCG = qxServicioVista();
  QX_SERVICIO_VISTA = null;
  return r;
});
ver('un usuario común ve siempre su servicio', vista.cgComun === 'cirugia_general', vista.cgComun);
ver('un usuario común no ve el selector', vista.selectorComun === 'none');
ver('el admin empieza en su propio servicio', vista.adminInicio === 'ginecologia', vista.adminInicio);
ver('el admin ve el selector con los dos servicios', vista.selectorAdmin !== 'none' && vista.opciones === 'ginecologia|cirugia_general', vista.opciones);
ver('el admin puede pasar a Cirugía General', vista.adminCG === 'cirugia_general');

console.log('\nJEFE DE INFORMACIÓN Y EXPORTAR');
const jefe = await page.evaluate(async () => {
  const r = {};
  const vis = id => getComputedStyle(document.getElementById(id)).display !== 'none';
  isAdmin = false;
  worker = { id: 'x', name: 'Interno', servicio: 'ginecologia', area: 'Interno de Medicina', rol: 'medico' };
  aplicarServicio(); r.comunVe = vis('navExportar') || vis('cardExportar');
  r.comunEdita = !qxSoloLectura();
  worker = { id: 'j', name: 'Anestesióloga', servicio: 'ginecologia', area: 'Interno de Medicina', rol: 'jefe_info' };
  aplicarServicio(); r.jefeVe = vis('navExportar') && vis('cardExportar');
  let aviso = ''; const t0 = window.toast; window.toast = m => { aviso = m; };
  r.jefeSoloLectura = qxSoloLectura(); r.aviso = aviso;
  await qxFormulario(null); r.jefeNoAbreFormulario = !document.querySelector('.qx-overlay');
  window.toast = t0;
  qxServicioVistaPintar(); r.jefeSelector = document.getElementById('qxServicioVistaWrap').style.display !== 'none';
  r.jefeMarca = (document.querySelector('#qxServicioVista option') || {}).textContent || '';
  worker = { id: 'r', name: 'Admin', servicio: 'ginecologia', area: 'Interno de Medicina', rol: 'medico', is_admin: true };
  aplicarServicio(); r.adminVe = vis('navExportar'); r.adminEdita = !qxSoloLectura();
  showModule('exportar');
  r.panel = document.getElementById('moduleExportar').classList.contains('active');
  expRango('mesPasado'); r.mesPasado = document.getElementById('expDesde').value + ' a ' + document.getElementById('expHasta').value;
  document.querySelector('input[name="expSalida"][value="archivo"]').checked = true; expSalidaCambio();
  r.correoOculto = document.getElementById('expCorreoWrap').style.display === 'none';
  r.fechaReg = [expFechaRegistro({ fecha_captacion: '2026-03-01' }), expFechaRegistro({ fecha_primera_evaluacion: '2026-04-02' }), expFechaRegistro({})].join('|');
  showModule('dashboard');
  return r;
});
const hoy = new Date(), mp = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1), mpFin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
ver('un médico/interno no ve Exportar', !jefe.comunVe);
ver('un médico/interno edita como siempre', jefe.comunEdita);
ver('el jefe ve Exportar (menú e inicio)', jefe.jefeVe);
ver('el jefe es solo lectura y se le avisa', jefe.jefeSoloLectura && /Solo lectura/.test(jefe.aviso), jefe.aviso);
ver('el jefe no abre el formulario de paciente', jefe.jefeNoAbreFormulario);
ver('el jefe elige qué servicio mira (📊)', jefe.jefeSelector && jefe.jefeMarca.indexOf('📊') === 0, jefe.jefeMarca);
ver('el admin ve Exportar y sigue editando', jefe.adminVe && jefe.adminEdita);
ver('se abre el módulo', jefe.panel);
ver('"Mes pasado" pone el mes anterior completo', jefe.mesPasado === iso(mp) + ' a ' + iso(mpFin), jefe.mesPasado);
ver('con "archivo" no pide correo', jefe.correoOculto);
ver('fecha de registro = captación, si no 1.ª evaluación (igual que el Apps Script)', jefe.fechaReg === '2026-03-01|2026-04-02|', jefe.fechaReg);

console.log('\nRECETAS SEGÚN LA LISTA QUE SE MIRA (admin de gineco mirando Cirugía General)');
const rx = await page.evaluate(async () => {
  const r = {};
  isAdmin = true;
  worker = { id: 'r', name: 'Admin', servicio: 'ginecologia', area: 'Interno de Medicina', rol: 'medico', is_admin: true };
  QX_SERVICIO_VISTA = null; try { localStorage.removeItem('qx_servicio_vista'); } catch (e) {}
  QX_RECETAS_SERVICIO = null;
  qxRecetasSegunServicio();
  r.ginecoAntes = QX_RECETA_TIPOS.length;
  QX_SERVICIO_VISTA = 'cirugia_general';
  qxRecetasSegunServicio();
  r.cgTipos = QX_RECETA_TIPOS.length;
  r.cgFilas = qxRxFilas().length;
  let el = document.getElementById('qxRecetasVista');
  if (!el) { el = document.createElement('div'); el.id = 'qxRecetasVista'; document.body.appendChild(el); }
  qxRecetasVistaRender();
  r.cgMensaje = el.textContent;
  r.clave = qxRxClaveNueva('Legrado');
  QX_SERVICIO_VISTA = 'ginecologia';
  qxRecetasSegunServicio();
  r.ginecoDespues = QX_RECETA_TIPOS.length;
  r.claveGineco = qxRxClaveNueva('Algo nuevo');
  isAdmin = false; QX_SERVICIO_VISTA = null;
  return r;
});
ver('en la lista de gineco: sus recetas', rx.ginecoAntes > 0, rx.ginecoAntes);
ver('en la lista de Cirugía General: NINGUNA receta de gineco', rx.cgTipos === 0 && rx.cgFilas === 0, rx.cgTipos + '/' + rx.cgFilas);
ver('dice que todavía no hay recetas de Cirugía General', /Todavía no hay recetas de Cirugía General/.test(rx.cgMensaje), rx.cgMensaje.slice(0, 80));
ver('una receta nueva de Cirugía General no choca con las de gineco (cg_…)', rx.clave === 'cg_legrado', rx.clave);
ver('al volver a gineco, vuelven sus recetas', rx.ginecoDespues === rx.ginecoAntes, rx.ginecoDespues);
ver('en gineco las claves nuevas siguen igual que antes', rx.claveGineco.indexOf('cg_') !== 0, rx.claveGineco);

console.log('\nREGISTRO');
const reg = await page.evaluate(() => {
  SERVICIOS_ACTIVOS = ['ginecologia']; populateServicioSelects();
  const uno = getComputedStyle(document.getElementById('regServicioField')).display;
  SERVICIOS_ACTIVOS = ['ginecologia', 'cirugia_general']; populateServicioSelects();
  const dos = getComputedStyle(document.getElementById('regServicioField')).display;
  document.getElementById('regServicio').value = 'cirugia_general'; populateServicioSelects();
  const areas = [...document.querySelectorAll('#regArea option')].map(o => o.value).filter(Boolean).join('|');
  SERVICIOS_ACTIVOS = ['ginecologia']; populateServicioSelects();
  return { uno, dos, areas };
});
ver('con un solo servicio activo no se muestra el selector', reg.uno === 'none', reg.uno);
ver('con dos servicios activos sí se muestra', reg.dos !== 'none', reg.dos);
ver('los roles cambian según el servicio', reg.areas === 'Interno de Medicina|Cirujano General', reg.areas);
const activos = await page.evaluate(async () => { await cargarServiciosActivos(); return SERVICIOS_ACTIVOS.join('|'); });
ver('la base dice que aceptan cuentas gineco y Cirugía General (encendida el 29/09)', activos === 'ginecologia|cirugia_general', activos);

ver('\nsin errores de página', errores.length === 0, errores.join(' | '));
await browser.close();
console.log('\n' + (fallas ? fallas + ' FALLA(S)' : 'Todo en orden.'));
process.exitCode = fallas ? 1 : 0;

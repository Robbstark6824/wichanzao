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
ver('la base dice que hoy solo gineco acepta cuentas', activos === 'ginecologia', activos);

ver('\nsin errores de página', errores.length === 0, errores.join(' | '));
await browser.close();
console.log('\n' + (fallas ? fallas + ' FALLA(S)' : 'Todo en orden.'));
process.exitCode = fallas ? 1 : 0;

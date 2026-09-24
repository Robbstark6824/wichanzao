// Vista Recetas del panel PC: pestañas Activas/Historial, orden y buscador.
// Levantar antes: python -m http.server 8777
const puppeteer = (await import('puppeteer')).default;
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
const p=await b.newPage();
await p.setViewport({width:1280,height:900});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8777/pc.html',{waitUntil:'networkidle2',timeout:45000});
const r=await p.evaluate(()=>{
  const hoy=pcRxHoy(), mas=n=>{const d=new Date(hoy+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
  const rows=[
    {id:1,nombre:'María Pérez Gómez',dni:'40111222',hcl:'1001',tipo_receta:'cst',fecha_cirugia:mas(3),turno:'tarde',estado:'programada',receta_generada_at:new Date().toISOString()},
    {id:2,nombre:'Ana Ruiz',dni:'40999888',hcl:'1002',tipo_receta:'aqv',fecha_cirugia:hoy,turno:'manana',estado:'hospitalizada',receta_generada_at:null},
    {id:3,nombre:'Rosa Díaz',dni:'41000111',hcl:'1003',tipo_receta:'legrado',fecha_cirugia:null,estado:'en_tramite'},
    {id:4,nombre:'Lucía Pérez',dni:'42000111',hcl:'1004',tipo_receta:'cst',fecha_cirugia:mas(-40),estado:'operada',fecha_resolucion:mas(-40),receta_generada_at:new Date().toISOString()},
    {id:5,nombre:'Elena Torres',dni:'43000111',hcl:'1005',tipo_receta:'histerectomia',fecha_cirugia:mas(-2),estado:'suspendida',fecha_resolucion:mas(-2)},
  ];
  document.getElementById('viewDirectory').classList.add('hidden');
  document.getElementById('viewRecetas').style.display='block'; pcView='recetas';
  pcRenderRecetas(rows);
  const grupos=()=>[...document.querySelectorAll('#rxLista .rx-group h3 span')].map(e=>e.textContent);
  const nombres=()=>[...document.querySelectorAll('#rxLista .rx-name')].map(e=>e.childNodes[0].textContent||e.firstChild.textContent);
  const out={};
  out.tabs=document.getElementById('rxTabs').textContent;
  out.actGrupos=grupos(); out.actNombres=nombres();
  pcRxSetTab('historial'); out.histGrupos=grupos(); out.histNombres=[...document.querySelectorAll('#rxLista .rx-name')].map(e=>e.textContent);
  const inp=document.getElementById('rxSearch'); inp.value='perez'; PC_RX.q='perez'; pcRxPintar();
  out.busqTabs=document.getElementById('rxTabs').textContent; out.busqMarks=document.querySelectorAll('#rxLista mark').length;
  pcRxSetTab('activas'); PC_RX.q='40999'; pcRxPintar(); out.dni=[...document.querySelectorAll('#rxLista .rx-name')].map(e=>e.textContent);
  PC_RX.q=''; pcRxPintar(); pcRxTogglePend(); out.pend=[...document.querySelectorAll('#rxLista .rx-name')].map(e=>e.textContent);
  pcRxTogglePend();
  return out;
});
console.log(JSON.stringify(r,null,1));
await p.evaluate(()=>{document.querySelectorAll('body > div').forEach(d=>{if(getComputedStyle(d).position==='fixed'&&d.offsetHeight>500)d.style.display='none'}); PC_RX.q='perez'; document.getElementById('rxSearch').value='perez'; pcRxPintar();});
await p.screenshot({path:process.env.SHOT||'rx.png',fullPage:true});
if(errs.length) console.log('errores de pagina:', errs);
await b.close();

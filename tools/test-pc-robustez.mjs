// Prueba de robustez del panel de PC. Levantar antes: python -m http.server 8777
const puppeteer = (await import('puppeteer')).default;
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
  const p=await b.newPage();
  await p.setViewport({width:1280,height:800});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8777/pc.html',{waitUntil:'networkidle2',timeout:45000});
  await new Promise(r=>setTimeout(r,3000));

  const res=[];
  const t=(n,ok,x)=>res.push({n,ok:!!ok,x:x===undefined?'':String(x)});

  const d=await p.evaluate(()=>{
    const out=[];
    const t=(n,ok,x)=>out.push({n,ok:!!ok,x:x===undefined?'':String(x)});
    t('el panel arranca y crea el cliente', !!window.sb);
    t('showToast sin contenedor no lanza', (()=>{
      const el=document.getElementById('toast'); const pa=el.parentNode; pa.removeChild(el);
      let lanzo=false; try{ showToast('x','error'); }catch(e){ lanzo=true; }
      pa.appendChild(el); return !lanzo;
    })());
    t('"Failed to fetch" se traduce', /Sin conexion con el servidor/.test(pcMensajeDeError(new Error('Failed to fetch'))), pcMensajeDeError(new Error('Failed to fetch')));
    t('un error interno no muestra jerga', /No se pudo completar/.test(pcMensajeDeError(new Error("Cannot read properties of null"), true)), pcMensajeDeError(new Error("Cannot read properties of null"), true));
    window._toastUltimo=null;
    showToast('repetido','error'); const antes=document.getElementById('toast').textContent;
    t('el toast sigue mostrando el texto', antes==='repetido', antes);
    return out;
  });
  d.forEach(c=>res.push(c));

  // red de seguridad con un error real
  await p.addScriptTag({content:'setTimeout(function(){ null.y; },10);'});
  await new Promise(r=>setTimeout(r,700));
  const txt=await p.evaluate(()=>{const e=document.getElementById('toast');return e&&e.classList.contains('show')?e.textContent:null;});
  t('un error suelto sale como mensaje', !!txt && /No se pudo completar/.test(txt), txt);

  // pantalla de fallo de carga
  await p.evaluate(()=>pcFalloDeCarga());
  const hay=await p.evaluate(()=>!!document.getElementById('pcBtnReintentar'));
  t('la pantalla de "no cargo" se dibuja', hay);
  await p.screenshot({path: process.env.SHOT||'/tmp/pcfallo.png'});

  let f=0;
  res.forEach(c=>{ if(!c.ok) f++; console.log(`${c.ok?'  OK  ':' FALLA'}  ${c.n}${c.x?'   ->  '+c.x:''}`); });
  console.log(`\n${res.length} pruebas, ${f} fallas`);
  if(errs.length) console.log('errores de pagina:', errs.slice(0,3));
  await b.close();
  process.exit(f?1:0);
})();

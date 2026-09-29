// Google Sheets y Supabase de mentira, en memoria, para correr el Apps Script
// (google/apps-script-sync.gs) en Node sin tocar nada real.
//   cargar(textoDelGs, estado) -> funciones del .gs + ops (altas/rellenos) + post(body)
//   estado = { hojas: { "<ssId>|<pestaña>": new Hoja(filas) }, db: [pacientes], activos: [servicios] }
// Lo usan tools/test-sync-servicios.mjs y tools/simular-importacion-cg.mjs.

// ---------- Google Sheets de mentira ----------------------------------------
export class Hoja {
  constructor(filas) { this.f = filas.map(r => r.slice()); this.dv = {}; this.formatos = {}; }
  getLastRow() { for (let i = this.f.length - 1; i >= 0; i--) if (this.f[i].some(v => v !== '' && v != null)) return i + 1; return 0; }
  getLastColumn() { let m = 0; this.f.forEach(r => { for (let j = r.length - 1; j >= 0; j--) if (r[j] !== '' && r[j] != null) { m = Math.max(m, j + 1); break; } }); return m; }
  celda(r, c) { return (this.f[r - 1] || [])[c - 1] ?? ''; }
  poner(r, c, v) { while (this.f.length < r) this.f.push([]); const row = this.f[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
  getRange(r, c, nr = 1, nc = 1) { return new Rango(this, r, c, nr, nc); }
  deleteRow(r) { this.f.splice(r - 1, 1); }
}
export class Rango {
  constructor(h, r, c, nr, nc) { Object.assign(this, { h, r, c, nr, nc }); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.h.celda(this.r + i, this.c + j)); out.push(row); } return out; }
  setValue(v) { this.h.poner(this.r, this.c, v); return this; }
  setNumberFormat(f) { this.h.formatos[this.r + ',' + this.c] = f; return this; }
  setHorizontalAlignment() { return this; }
  setDataValidation(regla) { for (let i = 0; i < this.nr; i++) this.h.dv[(this.r + i) + ',' + this.c] = regla; return this; }
  getDataValidation() { return this.h.dv[this.r + ',' + this.c] || null; }
}
export function cargar(gsTexto, estado) {
  const props = Object.assign({ SUPABASE_KEY: 'x' }, estado.props || {});
  const ops = [];
  const G = new Function('ENTORNO', `
    var SpreadsheetApp = ENTORNO.SpreadsheetApp, UrlFetchApp = ENTORNO.UrlFetchApp,
        PropertiesService = ENTORNO.PropertiesService, LockService = ENTORNO.LockService,
        ContentService = ENTORNO.ContentService, Logger = { log: function(){} },
        Utilities = ENTORNO.Utilities, Session = { getScriptTimeZone: function(){ return 'America/Lima'; } },
        ScriptApp = {};
    ${gsTexto}
    hoyStr_ = function(){ return '2026-09-29'; };
    return { doPost: doPost, reconciliar_: reconciliar_, buildValuesNew: buildValuesNew, buildValuesOld: buildValuesOld,
             desplegables_: typeof desplegables_ === 'function' ? desplegables_ : null,
             SS_ID: SS_ID, SS_ID_2: SS_ID_2, SS_ID_CG: typeof SS_ID_CG === 'undefined' ? null : SS_ID_CG, TOKEN: TOKEN };`)({
    SpreadsheetApp: {
      openById: id => ({ getSheetByName: n => estado.hojas[id + '|' + n] || null }),
      flush() {},
      newDataValidation() { const r = {}; const b = { requireValueInList(l) { r.lista = l; return b; }, setAllowInvalid(x) { r.invalido = x; return b; }, build() { return r; } }; return b; },
      DataValidationCriteria: {}
    },
    UrlFetchApp: {
      fetch(url, o) {
        const p = url.split('/rest/v1/')[1];
        const cuerpo = o.payload ? JSON.parse(o.payload) : null;
        let res = null;
        if (o.method === 'get' && p.startsWith('pacientes?select=*&updated_at=gt.')) {
          const desde = decodeURIComponent(p.split('updated_at=gt.')[1]);
          res = estado.db.filter(x => String(x.updated_at) > desde);
        } else if (o.method === 'get' && p.startsWith('pacientes?select=*')) res = estado.db;
        else if (o.method === 'get' && p.startsWith('servicios?')) res = estado.activos.map(c => ({ clave: c }));
        else if (o.method === 'post' && p === 'pacientes') { ops.push(['alta', cuerpo]); estado.db.push(Object.assign({ id: 'nuevo-' + ops.length, updated_at: new Date().toISOString() }, cuerpo)); }
        else if (o.method === 'patch') { const id = p.split('id=eq.')[1]; ops.push(['relleno', id, cuerpo]); Object.assign(estado.db.find(x => x.id === id) || {}, cuerpo); }
        else throw new Error('Supabase de mentira: no sé responder ' + o.method + ' ' + p);
        const txt = res == null ? '' : JSON.stringify(res);
        return { getResponseCode: () => 200, getContentText: () => txt };
      }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    Utilities: { formatDate: d => d.toISOString().slice(0, 10) }
  });
  G.ops = ops;
  G.post = body => JSON.parse(G.doPost({ postData: { contents: JSON.stringify(Object.assign({ token: G.TOKEN }, body)) } }).s);
  return G;
}

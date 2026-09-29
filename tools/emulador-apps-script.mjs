// Google Sheets, Drive y Supabase de mentira, en memoria, para correr el Apps
// Script (google/apps-script-sync.gs) en Node sin tocar nada real.
//
//   cargar(textoDelGs, estado) -> funciones del .gs + ops (altas/rellenos) + post(body)
//   estado = {
//     hojas:    { "<ssId>|<pestaña>": new Hoja(filas) },   // los archivos reales
//     db:       [pacientes], activos: [servicios],
//     sesiones: { <jwt>: <uid> }, workers: [{ id, name, rol, is_admin, aprobado }],
//     props:    { ULTIMA_SYNC, … }                           // Propiedades del script
//   }
//   Las copias que hace la exportación quedan en estado.copias.
//
// Lo usan tools/test-sync-servicios.mjs, tools/test-exportar.mjs y
// tools/simular-importacion-cg.mjs.

export class Hoja {
  constructor(filas, maxRows) {
    this.f = filas.map(r => r.slice());
    this.dv = {}; this.formatos = {}; this.fx = {};
    this.maxRows = Math.max(maxRows || 0, this.f.length);
  }
  getLastRow() { for (let i = this.f.length - 1; i >= 0; i--) if (this.f[i].some(v => v !== '' && v != null)) return i + 1; return 0; }
  getLastColumn() { let m = 0; this.f.forEach(r => { for (let j = r.length - 1; j >= 0; j--) if (r[j] !== '' && r[j] != null) { m = Math.max(m, j + 1); break; } }); return m; }
  getMaxRows() { return Math.max(this.maxRows, this.f.length); }
  insertRowsAfter(r, n) { this.maxRows = this.getMaxRows() + n; }
  celda(r, c) { return (this.f[r - 1] || [])[c - 1] ?? ''; }
  poner(r, c, v) { while (this.f.length < r) this.f.push([]); const row = this.f[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
  getRange(r, c, nr = 1, nc = 1) { return new Rango(this, r, c, nr, nc); }
  deleteRow(r) { this.f.splice(r - 1, 1); }
  setName(n) { this.nombre = n; return this; }
  setFrozenRows(n) { this.congeladas = n; return this; }
  autoResizeColumns() { return this; }
  copiar() { const h = new Hoja(this.f, this.maxRows); h.dv = { ...this.dv }; h.formatos = { ...this.formatos }; h.fx = { ...this.fx }; h.nombre = this.nombre; h.tipada = this.tipada; h.rechaza = this.rechaza; return h; }
}

export class Rango {
  constructor(h, r, c, nr, nc) { Object.assign(this, { h, r, c, nr, nc }); }
  cada(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r + i, this.c + j, i, j); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.h.celda(this.r + i, this.c + j)); out.push(row); } return out; }
  getFormulas() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.h.fx[(this.r + i) + ',' + (this.c + j)] || ''); out.push(row); } return out; }
  setValue(v) { if (this.h.rechaza && this.h.rechaza(this.c, v)) throw new Error('valor no válido para la columna'); this.h.poner(this.r, this.c, v); delete this.h.fx[this.r + ',' + this.c]; return this; }
  setValues(m) {
    if (this.h.rechaza && m.some((row, i) => row.some((v, j) => this.h.rechaza(this.c + j, v)))) throw new Error('valor no válido para la columna');
    m.forEach((row, i) => row.forEach((v, j) => { this.h.poner(this.r + i, this.c + j, v); delete this.h.fx[(this.r + i) + ',' + (this.c + j)]; })); return this;
  }
  setFormulas(m) { m.forEach((row, i) => row.forEach((f, j) => { if (f) this.h.fx[(this.r + i) + ',' + (this.c + j)] = f; })); return this; }
  clearContent() { this.cada((r, c) => { if (this.h.f[r - 1] && this.h.f[r - 1].length >= c) this.h.f[r - 1][c - 1] = ''; delete this.h.fx[r + ',' + c]; }); return this; }
  // Tabla con columnas tipadas (como LISTA_ESPERA_QX): h.tipada = true hace
  // fallar setNumberFormat como Google; h.rechaza(col, valor) rechaza valores.
  setNumberFormat(f) {
    if (this.h.tipada) throw new Error('No puedes establecer el formato de los números de las celdas en una columna escrita.');
    this.cada((r, c) => { this.h.formatos[r + ',' + c] = f; }); return this;
  }
  setHorizontalAlignment() { return this; }
  setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
  setWrap() { return this; } setVerticalAlignment() { return this; }
  setDataValidation(regla) { for (let i = 0; i < this.nr; i++) this.h.dv[(this.r + i) + ',' + this.c] = regla; return this; }
  getDataValidation() { return this.h.dv[this.r + ',' + this.c] || null; }
}

export function cargar(gsTexto, estado) {
  const props = Object.assign({ SUPABASE_KEY: 'x' }, estado.props || {});
  const ops = [];
  estado.copias = estado.copias || [];

  // Un "libro" (archivo) a partir de las pestañas de estado.hojas con ese id.
  const libroDe = id => ({
    getSheetByName: n => estado.hojas[id + '|' + n] || null,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
    getId: () => id
  });
  const archivoDe = id => {
    const copia = estado.copias.find(c => c.id === id);
    return {
      makeCopy(nombre, carpeta) {
        const nid = 'copia-' + (estado.copias.length + 1);
        Object.keys(estado.hojas).filter(k => k.startsWith(id + '|')).forEach(k => {
          estado.hojas[nid + '|' + k.split('|')[1]] = estado.hojas[k].copiar();
        });
        estado.copias.push({ id: nid, nombre, carpeta: carpeta && carpeta.nombre, editores: [] });
        return archivoDe(nid);
      },
      getId: () => id,
      setDescription(d) { copia.descripcion = d; },
      setSharing(a) { copia.acceso = a; },
      addEditor(e) { if (/no-es-google/.test(e)) throw new Error('Invalid argument'); copia.editores.push(e); },
      setTrashed(t) { copia.papelera = t; },
      getBlob: () => ({ getBytes: () => Array.from(Buffer.from('XLSX:' + id)) })
    };
  };

  const G = new Function('ENTORNO', `
    var SpreadsheetApp = ENTORNO.SpreadsheetApp, UrlFetchApp = ENTORNO.UrlFetchApp,
        PropertiesService = ENTORNO.PropertiesService, LockService = ENTORNO.LockService,
        ContentService = ENTORNO.ContentService, Logger = { log: function(){} },
        Utilities = ENTORNO.Utilities, Session = { getScriptTimeZone: function(){ return 'America/Lima'; } },
        ScriptApp = {}, DriveApp = ENTORNO.DriveApp;
    ${gsTexto}
    hoyStr_ = function(){ return '2026-09-29'; };
    return { doPost: doPost, reconciliar_: reconciliar_, buildValuesNew: buildValuesNew, buildValuesOld: buildValuesOld,
             desplegables_: typeof desplegables_ === 'function' ? desplegables_ : null,
             SS_ID: SS_ID, SS_ID_2: SS_ID_2, SS_ID_CG: typeof SS_ID_CG === 'undefined' ? null : SS_ID_CG, TOKEN: TOKEN };`)({
    SpreadsheetApp: {
      openById: libroDe,
      flush() {},
      newDataValidation() { const r = {}; const b = { requireValueInList(l) { r.lista = l; return b; }, setAllowInvalid(x) { r.invalido = x; return b; }, build() { return r; } }; return b; },
      DataValidationCriteria: {}
    },
    UrlFetchApp: {
      fetch(url, o) {
        if (url.indexOf('/auth/v1/user') >= 0) {
          const jwt = String((o.headers || {}).Authorization || '').replace('Bearer ', '');
          const uid = (estado.sesiones || {})[jwt];
          return { getResponseCode: () => uid ? 200 : 401, getContentText: () => uid ? JSON.stringify({ id: uid }) : '{}' };
        }
        const p = url.split('/rest/v1/')[1];
        const cuerpo = o.payload ? JSON.parse(o.payload) : null;
        let res = null;
        if (o.method === 'get' && p.startsWith('pacientes?select=*&updated_at=gt.')) {
          const desde = decodeURIComponent(p.split('updated_at=gt.')[1]);
          res = estado.db.filter(x => String(x.updated_at) > desde);
        } else if (o.method === 'get' && p.startsWith('pacientes?select=*&servicio=in.(')) {
          const lista = decodeURIComponent(p).split('in.(')[1].split(')')[0].split(',');
          res = estado.db.filter(x => lista.indexOf(x.servicio || 'ginecologia') >= 0);
        } else if (o.method === 'get' && p.startsWith('pacientes?select=*')) res = estado.db;
        else if (o.method === 'get' && p.startsWith('servicios?')) res = estado.activos.map(c => ({ clave: c }));
        else if (o.method === 'get' && p.startsWith('workers?')) { const id = decodeURIComponent(p.split('id=eq.')[1]); res = (estado.workers || []).filter(w => w.id === id); }
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
    Utilities: { formatDate: d => d.toISOString().slice(0, 10), base64Encode: b => Buffer.from(b).toString('base64') },
    DriveApp: {
      Access: { PRIVATE: 'PRIVATE' }, Permission: { NONE: 'NONE' },
      getFoldersByName: () => ({ hasNext: () => false }),
      createFolder: n => ({ getName: () => n, nombre: n }),
      getFileById: archivoDe
    }
  });
  G.ops = ops;
  G.post = body => JSON.parse(G.doPost({ postData: { contents: JSON.stringify(Object.assign({ token: G.TOKEN }, body)) } }).s);
  return G;
}

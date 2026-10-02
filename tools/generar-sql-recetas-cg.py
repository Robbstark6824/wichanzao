# Genera sql/038-recetas-cirugia-general.sql desde el Excel de recetas de Cirugía General.
import openpyxl, glob, json, re, sys
SRC = glob.glob(r'C:/Proyectos/NEURO-ARSENAL WEB/backend/docs/_inbox/CIRUGIA GENERAL*.xlsx')[0]
OUT = r'C:/Proyectos/wichanzao-final/sql/038-recetas-cirugia-general.sql'
wb = openpyxl.load_workbook(SRC, data_only=True)

def s(v): return '' if v is None else re.sub(r'\s+', ' ', str(v).replace('\ufffd', '°')).strip()
ARREGLOS = {'TUBO ASPIRACI°N': 'TUBO ASPIRACIÓN', 'GASAS QUIRURGICASO 25X42CM': 'GASAS QUIRURGICAS 25X42CM',
            'CATGUT CROMICO 3/0MMR 25': 'CATGUT CROMICO 3/0 MR 25'}
def nombre(t):
    n = s(t).upper()
    return ARREGLOS.get(n, n)
def cant(t):
    t = s(t).upper()
    m = re.match(r'^0*(\d+)\s*(UNI|UND|AMP|PAR|PARES|FCO|PAQ|TAB)?$', t)
    if not m: return t
    u = {'UND': 'UNI', 'PARES': 'PAR', None: 'UNI'}.get(m.group(2), m.group(2))
    return '%02d %s' % (int(m.group(1)), u)
def dosis(t):
    t = s(t).upper()
    t = re.sub(r'^N\s*[°º]?\s*(\d)', r'N° \1', t)
    t = re.sub(r'^(\d+)\s*GR?$', r'\1 G', t)
    t = re.sub(r'^(\d+)\s*(MG|ML)$', r'\1 \2', t)
    return {'7 1/2': '7.5'}.get(t, t)

def leer(ws):
    filas = [[c for c in r] for r in ws.iter_rows(values_only=True)]
    cr = next(c for r in filas for c, v in enumerate(r) if v and 'AGUJA DE PUNCION' in str(v).upper())
    ini = next(i for i, r in enumerate(filas) if s(r[0]).upper().startswith('CLORURO'))
    ins, ane = [], []
    for r in filas[ini:]:
        a = s(r[0]).upper()
        if a.startswith('FIRMA') or a.startswith('FECHA'):
            if not ins or a.startswith('FIRMA') and len(ins) > 5 and False: pass
        izq = {'n': nombre(r[0]), 'd': dosis(r[1]), 'c': cant(r[2])}
        if izq['n'] and not izq['n'].startswith(('FIRMA', 'FECHA')) and izq['c']:
            ins.append(izq)
        n = nombre(r[cr]) if len(r) > cr else ''
        if n and not n.startswith(('FIRMA', 'FECHA')):
            ane.append({'n': n, 'd': dosis(r[cr + 2]), 'c': cant(r[cr + 3])})
    # quitar repetidos exactos (la hoja de hemorroides repite botas, gorro, gasas…)
    def uniq(l):
        v, o = set(), []
        for x in l:
            k = x['n'] if x['n'].startswith('ACIDO TRANEXAMICO') else (x['n'], x['d'])
            if k in v: continue
            v.add(k); o.append(x)
        return o
    return uniq(ins), uniq(ane)

hojas = {ws.title: ws for ws in wb}
def hoja(prefijo): return next(w for t, w in hojas.items() if t.upper().startswith(prefijo))
RECS = [
  ('hernia', 'HERNIA', 'Hernia — Hernioplastía', 'HERNIA', 10),
  ('hemorroides', 'HEMORROIDES', 'Hemorroides, fisuras y fístulas', 'HEMORROIDES', 20),
  ('colecistectomia', 'COLECIST', 'Colecistectomía abierta', 'COLECISTECTOMIA', 30),
  ('anquiloglosia', 'ANQUILOGLOSIA', 'Anquiloglosia — Frenotomía lingual', 'ANQUILOGLOSIA', 40),
  ('lipoma', 'LIPOMA', 'Lipoma — Exéresis', 'LIPOMA', 50),
]
q = lambda t: "'" + t.replace("'", "''") + "'"
sql = ["""-- ============================================================
-- 038 · Recetas de Cirugía General (hernia, hemorroides, colecistectomía,
--       anquiloglosia, lipoma)
-- ============================================================
-- Fuente: Excel "CIRUGIA GENERAL HERNIA-HEMORROIDES-COLECISTECTOMIA-
-- ANQUILOGLOSIA-LIPOMA.xlsx" (Hospital Distrital Laredo). Generado con
-- tools/generar-sql-recetas-cg.py. Una fila por receta, servicio
-- 'cirugia_general' (cada servicio ve solo las suyas, sql/032).
-- Anquiloglosia y lipoma van SEPARADAS. La hoja de anquiloglosia del Excel venía
-- titulada "LIPOMA" y con los mismos útiles: se carga con su título correcto y
-- el cirujano debe revisar su lista desde 💊 Recetas (admin la edita en la app).
-- Se puede repetir: ON CONFLICT no pisa lo que ya se editó en la app.
-- ============================================================
"""]
resumen = {}
for clave, pref, nl, tit, orden in RECS:
    ins, ane = leer(hoja(pref))
    resumen[clave] = (len(ins), len(ane))
    sql.append("INSERT INTO public.recetas_plantillas (clave, servicio, titulo, nombre_largo, insumos, anestesia, es_parto, activa, orden)\nVALUES (%s, 'cirugia_general', %s, %s,\n  %s::jsonb,\n  %s::jsonb,\n  false, true, %d)\nON CONFLICT (clave) DO NOTHING;\n" % (
        q(clave), q(tit), q(nl), q(json.dumps(ins, ensure_ascii=False)), q(json.dumps(ane, ensure_ascii=False)), orden))
sql.append("SELECT clave, servicio, titulo, jsonb_array_length(insumos) AS insumos, jsonb_array_length(anestesia) AS anestesia, activa FROM public.recetas_plantillas WHERE servicio = 'cirugia_general' ORDER BY orden;\n")
open(OUT, 'w', encoding='utf-8').write('\n'.join(sql))
print(resumen)

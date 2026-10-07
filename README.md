# Wichanzao — Centro de Salud (PWA)

Aplicación web instalable (PWA) para digitalizar el trabajo del servicio de
Ginecología del Hospital Distrital de Laredo y, desde 2026-09, también de
Cirugía General: referencias, contrarreferencias, programación quirúrgica,
recetas, lista de espera y sincronización con las hojas de GERESA.

Está pensada para usarse desde el celular, con poca señal y sin instalar nada.

## Piezas

| Pieza | Qué es | Dónde vive |
|---|---|---|
| `index.html` | App móvil (un solo archivo: HTML + CSS + JS) | GitHub Pages |
| `pc.html` | Panel de escritorio | GitHub Pages |
| `sw.js` | Service worker (modo sin conexión). **Subir `CACHE_NAME` en cada cambio** o los usuarios no verán la versión nueva | GitHub Pages |
| `agente.html` | Página auxiliar del agente de impresión | GitHub Pages |
| Base de datos | Supabase (Postgres + Auth + Storage), con RLS | Proyecto `xqphjvppfgwabfruyjae` |
| `google/apps-script-sync.gs` | Apps Script "Sync GERESA": escribe y lee las hojas de Excel/Google Sheets | Cuenta de Google dueña de las hojas |
| `tools/impresora/` | Agente de Windows que imprime recetas de forma remota | PC del servicio |
| `tools/respaldo-bd.mjs` | Respaldo nocturno de la base, los archivos y las hojas | PC con tarea programada |
| `sql/` | Migraciones numeradas de la base | — |
| `RECETAS/` | Plantillas de recetas (xlsx) y logos | — |

Stack: HTML/CSS/JS sin frameworks, `@supabase/supabase-js` desde CDN, jsPDF,
JSZip (en `pc.html`), Google Fonts. Las dependencias de `package.json` son solo
de las herramientas y pruebas (`tools/`), no de la app.

## Puesta en marcha

1. **Variables locales.** Copiar `.env.example` a `.env` y completar. El `.env`
   nunca se sube a git.
2. **Base de datos.** Aplicar `sql/` en orden numérico desde el SQL Editor de
   Supabase. Ver la nota de abajo: **parte de la seguridad vive en el panel**.
3. **App.** Se publica con GitHub Pages desde la rama `main`. La URL y la clave
   pública de Supabase están en `index.html` y `pc.html` (`SB_URL`, `SB_KEY`).
4. **Apps Script.** Ver `google/DESPLEGUE-geresa-oficial.md`. Para publicar:
   `node tools/publicar-apps-script.mjs` (necesita `clasp login` con la cuenta
   dueña del script y la API de Apps Script activada).
5. **Agente de impresión.** Ver `tools/impresora/LEEME.md`.

## Pruebas

Son scripts de Node en `tools/test-*.mjs`. Las que abren la app en un navegador
necesitan un servidor local en el puerto 8777:

```
python -m http.server 8777
node tools/test-servicios-app.mjs
node tools/test-sync-servicios.mjs
node tools/test-sesion-apps-script.mjs
node tools/test-exportar.mjs
node tools/referencia-geresa.mjs
```

Antes de publicar el Apps Script, `publicar-apps-script.mjs` corre las pruebas
y no sube nada si alguna falla.

## Lo que NO está en este repositorio (importante para quien lo reciba)

- **Las políticas RLS y funciones como `is_admin()` se crearon desde el panel de
  Supabase**, no desde los archivos de `sql/`. Para reconstruir la base entera
  hace falta además el volcado de esquema. `tools/respaldo-bd.mjs` genera
  `esquema.json` (columnas, políticas, permisos, funciones y disparadores):
  úsese como fuente de verdad y, mejor aún, conviértase en migraciones.
- **Los secretos** (`.env`, claves del Apps Script, contraseña del agente de
  impresión). Ver `SEGURIDAD.md`, apartado "Rotar claves".
- **Los datos.** El repo no contiene pacientes. Los respaldos sí, y se guardan
  fuera del repositorio.

## Cuentas y propiedad (completar al entregar)

La app depende de servicios que hoy están a nombre de una cuenta personal.
Al entregar el proyecto hay que traspasar o duplicar el control de:

| Servicio | Para qué | Responsable actual | Nuevo responsable |
|---|---|---|---|
| Supabase (proyecto `xqphjvppfgwabfruyjae`) | Base de datos, cuentas de usuarios, archivos | | |
| GitHub (repo y Pages) | Código y hosting | | |
| Google (Apps Script + hojas GERESA) | Sincronización con las hojas | | |
| PC del agente de impresión | Impresión remota de recetas | | |
| Tarea de respaldo nocturno | Copia de seguridad | | |

Sin este cuadro lleno, el proyecto depende de una sola persona.

## Convenciones del código

- Todo está en español: textos, nombres de variables de dominio y comentarios.
- `index.html` es grande (~570 KB) a propósito: un solo archivo facilita el
  modo sin conexión. Está organizado por secciones comentadas con `/* ===== … ===== */`.
- `sb` (el cliente de Supabase) **nunca** se crea en el nivel superior del script:
  si el CDN está caído, la app no debe morir. Se crea en `arrancarApp()`.
- Nada que cambie lo que se escribe en las hojas GERESA debe tocarse sin avisar
  al servicio: esos datos van a GERESA.

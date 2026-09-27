# Recetas — archivo histórico

**Estos archivos ya no se usan para nada.** Editarlos no cambia ninguna receta.

Desde el 27/09/2026 las recetas quirúrgicas viven en la tabla
`recetas_plantillas` de Supabase (`sql/030-recetas-plantillas.sql`). El
administrador las crea, edita y archiva desde la app: **Programación Qx →
💊 Recetas**. Cada cambio queda en el historial (`recetas_plantillas_historial`).

- `recetas-carga-inicial-2026-09.json` — transcripción de los Excel de la
  carpeta `RECETAS/` con el vocabulario unificado (UNI · AMP · PAR · FCO · PAQ ·
  TAB; MG · ML · G · UI). Es exactamente lo que cargó `sql/030` y lo que la app
  trae adentro como respaldo (`QX_RECETAS` en `index.html`, solo se usa si un
  equipo nunca pudo leer la base).
- Los `.xlsx` de `RECETAS/` son las recetas originales del servicio.

Para una copia actual de las recetas: en la app, 💊 Recetas → **⬇ Respaldo**
(Excel/CSV o JSON).

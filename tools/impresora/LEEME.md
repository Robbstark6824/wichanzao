# Agente de impresión de recetas

Sirve para mandar a imprimir una receta **desde la app del celular, estando lejos
del hospital**. El PDF sale por la impresora de la PC del servicio.

```
  App (celular)                  Supabase                 PC del servicio
  ─────────────                  ────────                 ───────────────
  Generar receta  ──► PDF en documentos/recetas/
  «Enviar a imprimir» ─► fila en la tabla `impresiones` (pendiente)
                                     │
                                     └──► el agente la ve en ~2 segundos,
                                          baja el PDF y lo imprime
                                     ┌──── marca «impresa» (o «error»)
  La app muestra: En cola → Imprimiendo… → ✓ Impresa
```

Ningún dato sale hacia terceros: todo pasa por el mismo Supabase del proyecto.

---

## Instalación (una sola vez, en la PC del servicio)

**Descomprimir esta carpeta** en algún lado fijo de la PC (por ejemplo
`C:\AgenteImpresion`; sirve el Escritorio, pero no la carpeta de Descargas,
porque después se borra).

**Doble clic en `INSTALAR.bat`.** Eso hace todo:

1. Deja listo SumatraPDF (viene incluido; es lo que imprime sin abrir ventanas).
2. Pide el **email y la contraseña** de una cuenta de la app. Conviene una cuenta
   dedicada para esto, no la personal.
3. Muestra la **lista de impresoras** de la PC para elegir con un número por cuál
   salen las recetas.
4. Prueba que entre bien y que la cola responda.
5. Pregunta si querés que arranque solo cada vez que se prende la PC (decí que sí).

Al terminar se abre la ventana del agente. **Esa ventana tiene que quedar abierta**
(se puede minimizar, no cerrar).

Si Windows muestra un cartel azul de *SmartScreen*: **Más información → Ejecutar de
todas formas**. Pasa porque los `.bat` bajados de internet no están firmados.

---

## Uso diario

En la app, en la ficha de la paciente o en el panel que aparece al generar la
receta, hay un botón **🖨️ Enviar a imprimir**: uno para la **receta completa** y
otro para la **complementaria**. Generar la receta no imprime nada por sí solo.

Desde que tocás el botón hasta que sale el papel pasan unos **3 a 5 segundos**.

| Estado en la app | Qué significa |
|---|---|
| ⏳ En cola para imprimir | Encolada. Se puede **cancelar** mientras siga así. |
| 🖨️ Imprimiendo… | El agente la tomó y la mandó a la impresora. |
| ✓ Impresa en el servicio | Salió el papel. Queda «Volver a imprimir». |
| ⚠️ No se pudo imprimir | Falló algo; el detalle se ve en la app y en `impresion.log`. |

Si la PC está apagada, el trabajo **queda esperando** y sale apenas se prenda.

---

## Problemas frecuentes

**Todo queda «En cola» y nunca avanza** — la PC está apagada, sin internet, o se
cerró la ventana negra del agente. Volver a abrir `iniciar.bat`.

**Sale en la impresora equivocada** — volver a correr `INSTALAR.bat` y elegir otra,
o editar `impresora` en `config.json`.

**Se cierra apenas abre** — abrir `impresion.log` con el Bloc de notas: ahí queda el
error exacto (casi siempre es la contraseña).

**Un trabajo quedó trabado en «Imprimiendo…»** — a los 10 minutos el agente lo
devuelve solo a la cola.

**Cambiar la contraseña de la cuenta** — volver a correr `INSTALAR.bat`.

---

## Archivos

| Archivo | Para qué |
|---|---|
| `INSTALAR.bat` | Lo único que hay que tocar la primera vez. |
| `iniciar.bat` | Abre el agente a mano (si se cerró la ventana). |
| `agente-impresion.ps1` | El agente en sí. |
| `instalar-al-inicio.bat` | Solo el paso de «arrancar con Windows». |
| `config.json` | Se crea al instalar. Tiene la contraseña: no compartirlo. |
| `impresion.log` | Historial de lo que imprimió y de los errores. |

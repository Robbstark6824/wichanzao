# Agente de impresión de recetas

Permite mandar a imprimir una receta **desde la app del celular, estando lejos del
hospital**. El PDF sale por la impresora de la PC del servicio.

```
  App (celular)                  Supabase                 PC del servicio
  ─────────────                  ────────                 ───────────────
  Generar receta  ──► PDF en documentos/recetas/
  «Enviar a imprimir» ─► fila en la tabla `impresiones` (pendiente)
                                     │
                                     └──► el agente la toma cada 15 s,
                                          baja el PDF y lo imprime
                                     ┌──── marca «impresa» (o «error»)
  La app muestra: En cola → Imprimiendo… → ✓ Impresa
```

Ningún dato sale hacia terceros: todo pasa por el mismo Supabase del proyecto.

---

## Instalación en la PC del servicio (una sola vez)

**1. Crear la tabla** (si todavía no se hizo)

En Supabase → SQL Editor, ejecutar `sql/028-cola-impresion.sql`.

**2. Copiar esta carpeta a la PC**

Por ejemplo a `C:\AgenteImpresion`. Alcanza con estos archivos:
`agente-impresion.ps1`, `config.ejemplo.json`, `iniciar.bat`, `instalar-al-inicio.bat`.

**3. Instalar SumatraPDF** (recomendado, gratuito)

Bajar la versión **portable** de <https://www.sumatrapdfreader.org/download-free-pdf-viewer>,
descomprimir y dejar `SumatraPDF.exe` **en esta misma carpeta**. Es lo que permite
imprimir sin que se abra ninguna ventana ni haya que apretar nada.

Sin SumatraPDF el agente igual funciona, pero usa el visor de PDF de Windows y por
cada receta se abre y se cierra una ventana.

**4. Configurar**

Copiar `config.ejemplo.json` como **`config.json`** y completar:

- `email` / `password`: una cuenta de trabajador de la app. Conviene crear una
  cuenta propia para esto (por ejemplo `impresora.gineco@…`) y no usar la personal.
- `impresora`: el nombre exacto que figura en *Configuración → Bluetooth y
  dispositivos → Impresoras y escáneres*. Si se deja vacío usa la predeterminada.

**5. Probar**

Doble clic en `iniciar.bat`. Tiene que decir `Sesión iniciada como …`.
Desde el celular, en una paciente con receta generada, tocar **«Enviar a imprimir»**:
en menos de 15 segundos sale el papel y en la app aparece **✓ Impresa**.

**6. Que arranque solo**

Doble clic en `instalar-al-inicio.bat`. Desde ahí, cada vez que se prenda la PC el
agente queda escuchando en una ventana negra. Esa ventana tiene que quedar abierta
(se puede minimizar).

---

## Uso diario

En la app, dentro de la ficha de la paciente o del panel que aparece al generar la
receta, hay un botón **🖨️ Enviar a imprimir** para la **receta completa** y otro
para la **complementaria**. Generar la receta ya no imprime nada por sí solo: la
impresión siempre la decide el botón.

Estados que muestra la app:

| Estado | Qué significa |
|---|---|
| ⏳ En cola para imprimir | Encolada. Se puede **cancelar** mientras siga así. |
| 🖨️ Imprimiendo… | El agente la tomó y la mandó a la impresora. |
| ✓ Impresa en el servicio | Salió el papel. Queda el botón «Volver a imprimir». |
| ⚠️ No se pudo imprimir | Falló algo; el detalle se ve en la app y en `impresion.log`. |

Si la PC está apagada, el trabajo **queda esperando** y sale apenas se prenda.

---

## Problemas frecuentes

**«No encuentro config.json»** — falta el paso 4.

**«Sesión iniciada» pero no imprime nada** — la tabla no está creada (paso 1) o el
agente entró con una cuenta que no tiene permiso. Revisar `impresion.log`.

**Sale en la impresora equivocada** — poner el nombre exacto en `impresora` dentro
de `config.json`, o cambiar la impresora predeterminada de Windows.

**Todo queda «En cola» y nunca avanza** — la PC está apagada, sin internet, o la
ventana negra del agente se cerró.

**Un trabajo quedó trabado en «Imprimiendo…»** — a los 10 minutos el agente lo
devuelve solo a la cola.

**Se cierra apenas abre** — abrir `impresion.log` en el Bloc de notas: ahí queda el
error exacto.

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
2. Pide el **usuario y la contraseña de la app** — los mismos que se escriben para
   entrar en el celular. El usuario es el **nombre de la carpeta**, no un correo;
   el agente entra igual que una persona. Al tipear la contraseña no se ve nada:
   es a propósito.
3. Muestra la **lista de impresoras** de la PC para elegir con un número por cuál
   salen las recetas.
4. Prueba que entre bien y que la cola responda.
5. Pregunta si querés que arranque solo cada vez que se prende la PC (decí que sí).

Al terminar se abre la ventana del agente para que puedas comprobar que imprime.

**Cuando confirmes que sale el papel, corré `ocultar.bat`.** La ventana negra
desaparece y el agente sigue funcionando en segundo plano: no se ve en la pantalla
ni en la barra de tareas, y arranca así cada vez que se prende la PC. Es lo
recomendado en una computadora que usa todo el servicio.

Para apagarlo del todo (por ejemplo, para cambiar la impresora): `detener.bat`.

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

**Todo queda «En cola» y nunca avanza** — la PC está apagada, sin internet, o el
agente no está corriendo. Pasado un minuto la app lo avisa en el mismo cartel
(«la PC del servicio no responde»). En la PC: correr `ocultar.bat`, que lo
arranca de nuevo, y mirar `impresion.log`: si la última línea es
«Sesión iniciada», está vivo; si dice «Sin conexión», no tiene internet; si dice
«Usuario o contraseña incorrectos», hay que correr `INSTALAR.bat` de nuevo.

**Se prendió la PC y no arrancó solo** — el agente arranca junto con Windows y
espera a que haya internet (aunque el Wi-Fi tarde en conectarse). Si aun así
no aparece nada nuevo en `impresion.log` al prender la PC, el acceso directo de
inicio se borró: correr `ocultar.bat` una vez lo vuelve a dejar.

**¿Está funcionando, si no se ve nada?** Abrí `impresion.log`: anota cada receta que
imprime, con fecha y hora.

**Sale en la impresora equivocada** — volver a correr `INSTALAR.bat` y elegir otra,
o editar `impresora` en `config.json`.

**Se cierra apenas abre** — abrir `impresion.log` con el Bloc de notas: ahí queda el
error exacto (casi siempre es la contraseña).

**Un trabajo quedó trabado en «Imprimiendo…»** — a los 10 minutos el agente lo
devuelve solo a la cola.

**«No hay ningun usuario …»** — el usuario se escribe igual que en la pantalla de
ingreso de la app (el nombre de la carpeta). No es un correo.

**Cambiar el usuario o la contraseña** — volver a correr `INSTALAR.bat` y responder
`s` a «¿Volver a configurar?».

---

## Archivos

| Archivo | Para qué |
|---|---|
| `INSTALAR.bat` | Lo único que hay que tocar la primera vez. |
| `ocultar.bat` | Deja el agente corriendo invisible (y así arranca siempre). |
| `detener.bat` | Lo apaga del todo. |
| `iniciar.bat` | Lo abre con ventana visible, para ver qué está pasando. |
| `agente-impresion.ps1` | El agente en sí. |
| `instalar-al-inicio.bat` | Solo el paso de «arrancar con Windows». |
| `config.json` | Se crea al instalar. Tiene la contraseña: no compartirlo. |
| `impresion.log` | Historial de lo que imprimió y de los errores. |

# Mi Calendario

App instalable (PWA) con calendario, actividades con recordatorio, **My Vision** y sincronización entre dispositivos.
Se publica desde **GitHub → Netlify**.

## Qué hace

- **Calendario del mes** con estaciones, metas, categorías, fotos y propósitos por día.
- **Actividades con fecha, hora y recordatorio** (a la hora, 15 min, 30 min o 1 hora antes). El aviso llega al teléfono **aunque la app esté cerrada**.
- **My Vision**: notas, metas, ideas y fotos (metas futuras, viajes, ingresos, proyectos, ideas e inspiración). Se pueden editar y eliminar.
- **Sincronización** de todo entre tus dispositivos con un código.
- **Respaldo**: descargar e importar una copia de todo.
- **Registro de clientas**: antes de entrar por primera vez, la persona escribe su nombre, apellido y correo. Tú ves esa lista en un **panel de administración** aparte, protegido con una contraseña que tú eliges.
- **Fechas importantes**: los días festivos de Estados Unidos aparecen solos en el calendario, y puedes agregar tus propias fechas (cumpleaños, aniversarios) que se repiten cada año.
- **Estación automática**: el fondo y los colores cambian solos según el mes que estás viendo (puedes fijar una estación manualmente si prefieres).
- **Galería**: reúne en un solo lugar las fotos que has puesto en los días del calendario y en My Vision. Tocar una foto te lleva directo a ese día o esa nota.

## Por qué hace falta GitHub

Para que el teléfono reciba un aviso con la app cerrada, alguien tiene que enviarlo a la hora exacta. Eso lo hace un
pequeño servicio en Netlify (`netlify/functions/push-tick.mjs`, se ejecuta cada minuto). Netlify solo publica ese tipo de
servicios cuando el sitio viene de GitHub (o de su terminal); arrastrando la carpeta no se publican.
Si publicas arrastrando la carpeta, todo funciona igual **menos** los avisos con la app cerrada y la sincronización
(los recordatorios sí suenan mientras la app está abierta).

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | La app completa |
| `manifest.webmanifest`, `sw.js`, `icons/`, `fonts/` | Instalación como app, funcionamiento sin Internet y recepción de avisos |
| `netlify/functions/sync.mjs` | Sincronización (`/api/sync`) |
| `netlify/functions/push.mjs` | Registro de dispositivos y recordatorios (`/api/push`) |
| `netlify/functions/push-tick.mjs` | Se ejecuta cada minuto y envía los avisos que ya tocan |
| `netlify/lib/*.mjs` | Lógica compartida de esos servicios |
| `netlify.toml`, `package.json`, `package-lock.json` | Configuración de Netlify y dependencias (`@netlify/blobs`, `web-push`) |
| `_headers` | Evita que el navegador guarde versiones viejas de `index.html`, `sw.js` y el manifest |

No hay que configurar llaves ni variables: las llaves de los avisos se crean solas la primera vez y se guardan en Netlify Blobs.

## 1. Subir a GitHub (desde el navegador)

1. En <https://github.com> toca **+ → New repository**. Nombre: `mi-calendario`. Elige **Private** y crea el repositorio.
2. Toca el enlace **uploading an existing file**.
3. Arrastra **el contenido** de esta carpeta (no la carpeta misma): `index.html`, `sw.js`, `manifest.webmanifest`,
   `netlify.toml`, `package.json`, `package-lock.json`, `_headers` y las carpetas `netlify`, `icons` y `fonts`.
   (Si tu computadora esconde `.gitignore`, no pasa nada: no es necesario subirlo.)
4. Baja y toca **Commit changes**.

## 2. Publicar en Netlify

1. En Netlify: **Add new project → Import an existing project → GitHub** y elige `mi-calendario`.
2. No cambies nada: la configuración viene en `netlify.toml`.
3. Toca **Deploy**.

## 3. Comprobar que quedó bien

1. Abre `https://TU-SITIO.netlify.app/api/sync?ping=1` → debe mostrar `{"ok":true,"v":1}`.
2. Abre `https://TU-SITIO.netlify.app/api/push` → debe mostrar `{"ok":true,"publicKey":"…"}`.
3. En Netlify, **Logs → Functions** (o el detalle del último deploy) debe mostrar tres funciones: `sync`, `push` y `push-tick`
   (esta última marcada como programada, cada minuto).

Si alguna no aparece, la función no se publicó: revisa el registro del deploy.

## 4. Instalar la app y activar los avisos

1. Abre tu sitio en el teléfono e instálala:
   - **Android (Chrome):** menú ⋮ → **Instalar app**.
   - **iPhone / iPad (Safari):** botón Compartir → **Agregar a pantalla de inicio**.
     En iPhone los avisos solo funcionan desde la app instalada (iOS 16.4 o más nuevo).
   - **Computadora (Chrome o Edge):** botón **Instalar app**.
2. Abre la app instalada → **Configuración → Recordatorios → Activar recordatorios** y acepta el permiso.
   (También te lo pide al guardar tu primera actividad con recordatorio.)
3. Toca **Probar aviso**, **cierra la app** y espera 1 minuto: debe llegar una notificación.
   Si llega, ya quedó todo listo.

## 5. Sincronizar tus dispositivos (opcional)

1. En el dispositivo que ya tiene tus datos: **Configuración → Sincronizar mis dispositivos → Activar sincronización**. Copia el código.
2. En cada dispositivo nuevo: abre el mismo enlace → **Ya tengo un código** → pégalo → **Conectar**.

Se sincronizan el calendario, las actividades, My Vision, las metas, las fotos y los ajustes.
Cada dispositivo debe **activar sus propios recordatorios** (el permiso de notificaciones es por dispositivo).

## Ver quién se ha registrado (panel de administración)

1. Abre `https://tu-sitio.netlify.app/admin.html` (agrégalo a tus favoritos; no aparece dentro de la app).
2. La primera vez, elige una contraseña. **Apúntala en un lugar seguro** — si la olvidas, no hay forma de recuperarla, solo puedes crear otra pidiéndomelo.
3. Las próximas veces, entra con esa misma contraseña.
4. Ahí ves nombre, apellido, correo y fecha de cada persona, y puedes descargar la lista en un archivo CSV (para importarla a tu correo o a otra herramienta).

Cómo funciona para cada persona:
- La primera vez que alguien abre tu sitio, le pide su nombre, apellido y correo antes de dejarla entrar. Después de eso, no se lo vuelve a pedir en ese mismo dispositivo.
- Cada persona tiene su propio calendario en blanco en su teléfono — no ve el tuyo ni el de nadie más. Tú solo ves su nombre y correo en el panel.
- **A ti no te lo pedirá**: si abres la app en un dispositivo que ya tenía datos guardados (como el tuyo), se lo salta automáticamente.
- Si alguien registra el mismo correo dos veces (por ejemplo, reinstaló la app), se actualiza su registro en vez de duplicarse.

## Actualizar la app

Cambia los archivos en GitHub y Netlify publica solo. Si cambias `index.html` u otro archivo de la app, sube el número de
`VERSION` al inicio de `sw.js` (por ejemplo `mi-calendario-v4`) para que los dispositivos descarguen la versión nueva.
La versión nueva aparece la segunda vez que abres la app.

## Importante

- **El código de sincronización es como una contraseña**: quien lo tenga puede ver tu calendario y tus fotos. No lo compartas ni lo subas a GitHub.
  Guárdalo bien; si lo pierdes en todos tus dispositivos no se puede recuperar. Descarga un respaldo de vez en cuando.
- Si editas lo mismo en dos dispositivos al mismo tiempo, se queda el cambio más reciente.
- Los avisos viajan cifrados por el servicio de notificaciones de tu teléfono (Google, Apple o Mozilla). El servidor solo guarda
  el título y la hora de cada recordatorio que aún no ha llegado, y los borra al enviarlos.
- La función que envía los avisos corre cada minuto, todo el tiempo. Revisa el uso de tu plan de Netlify de vez en cuando.
- Los recordatorios se calculan con la zona horaria del dispositivo donde creaste la actividad.
- Los datos no pasan solos desde otro enlace (por ejemplo, un sitio anterior publicado arrastrando la carpeta):
  descarga un respaldo allá e impórtalo aquí.

## Si algo falla

| Síntoma | Qué revisar |
| --- | --- |
| Configuración dice "Activos solo con la app abierta" | `/api/push` no responde (paso 3): la función no se publicó |
| No llega el aviso de prueba | ¿Aceptaste el permiso? ¿En iPhone, abriste la app instalada? ¿Está el teléfono en modo ahorro de batería? |
| Notificaciones bloqueadas | Actívalas en los ajustes del teléfono para esta app o para el navegador |
| El deploy falla al instalar dependencias | Confirma que `netlify.toml` y `package-lock.json` estén subidos (Node 22) |
| Sigue apareciendo la versión anterior | Cierra la app por completo y ábrela dos veces, o sube el número de `VERSION` en `sw.js` |

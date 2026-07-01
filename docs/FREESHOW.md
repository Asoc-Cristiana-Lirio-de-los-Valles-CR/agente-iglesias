# Configurar FreeShow

El agente se comunica con FreeShow a través de su **API** (REST y/o WebSocket).
Hay que activarla una vez.

## Activar la API

1. Abre **FreeShow**.
2. Ve a **Settings** (Configuración) → **Connections** (Conexiones).
3. Activa la **API** / **WebSocket**.
4. Anota el **puerto** (por defecto **5506** para REST y **5505** para WebSocket).

> Si cambias el puerto en FreeShow, ajústalo también en `.env`
> (`FREESHOW_PORT` y/o `FREESHOW_WS_PORT`).

## Cómo se comunica el agente

| Acción | Para qué |
|--------|----------|
| `create_project` | Crea el proyecto "Versiculos" la primera vez (se reutiliza después). |
| `create_show` | Crea un show nuevo solo cuando no hay uno reutilizable con ese nombre. |
| `set_show` | Aplica el formato preciso; tambien sobrescribe un show reutilizado si su contenido cambió. |
| `add_to_project` | Vincula un show nuevo al proyecto "Versiculos". |
| `remove_project_item` | Desvincula solo los shows que ya no corresponden a ningún versículo de hoy. |
| `get_projects` | Localiza el proyecto "Versiculos" por nombre y lee sus shows actuales. |
| `get_shows` / `get_show` | Localizar un show por nombre / leer su contenido actual para comparar antes de sobrescribir. |

- Las **lecturas** (`get_*`) usan siempre **REST**.
- Las **escrituras** usan REST o, si pones `FREESHOW_TRANSPORT=ws`, WebSocket
  (si la conexión WS falla, el agente vuelve automáticamente a REST).

### El proyecto "Versiculos"

Todos los versículos generados en una ejecución se agrupan en **un único
proyecto de FreeShow llamado exactamente `Versiculos`**, administrado en
exclusiva por el agente. Cada vez que generas presentaciones, el agente:

1. Busca el proyecto `Versiculos` por nombre (no por carpeta — la API de
   FreeShow no permite buscar/crear dentro de una carpeta específica).
2. Lee cada show actual del proyecto y revisa si tiene la marca
   `meta.createdBy = "AgenteIglesias"` — **solo esos** son tocados (ver
   "Puedes agregar contenido manual" abajo).
3. Entre los marcados, empareja por nombre con los versículos de hoy: los que
   coinciden se **reutilizan** (mismo show, solo se sobrescribe si el texto
   cambió); los versículos sin show existente se **crean**; los marcados que
   ya no corresponden a ningún versículo de hoy se **desvinculan**.

El proyecto termina conteniendo **solo** los versículos de la generación más
reciente entre los shows que el agente administra, sin recrear shows que no
cambiaron. **Limitación conocida de FreeShow:** su API no permite borrar
físicamente un show, solo desvincularlo de un proyecto — los shows
desvinculados quedan como archivos `.show` huérfanos en el disco de FreeShow
(no aparecen en ningún proyecto, no estorban, pero tampoco se eliminan solos).

### Puedes agregar contenido manual al proyecto "Versiculos"

El agente **nunca** toca un show que no haya creado él mismo. Si agregas a
mano un show dentro de "Versiculos" (un anuncio, una bienvenida, lo que sea),
queda protegido: nunca se actualiza, nunca se desvincula, nunca se sobrescribe.
La distinción es la marca `meta.createdBy = "AgenteIglesias"` — si no la tiene,
es tuyo y se ignora por completo en cada sincronización.

> Puedes mover el proyecto "Versiculos" a la carpeta que quieras dentro de
> FreeShow manualmente — el agente lo sigue encontrando por nombre sin importar
> en qué carpeta esté.

Referencia oficial: <https://freeshow.app/api>

## Comprobar la conexión

Con el agente en marcha, abre <http://localhost:3000>. El indicador superior debe
mostrar **🟢 FreeShow conectado**. También puedes consultar
<http://localhost:3000/api/status>.

## Solución de problemas

**🔴 "FreeShow no responde"**
- ¿Está FreeShow abierto?
- ¿Activaste la API en Settings → Connections?
- ¿Coincide el puerto de FreeShow con `FREESHOW_PORT` del `.env`?
- Prueba abrir `http://127.0.0.1:5506` — debería responder algo.

**Los proyectos se crean pero las diapositivas salen sin formato**
- El paso `set_show` necesita localizar el show recién creado. Si tu versión de
  FreeShow tarda en reflejarlo, el agente reintenta unos segundos. Si persiste,
  vuelve a generar.

**Quiero ver qué se enviaría sin tocar FreeShow**
- Pon `DRY_RUN=true` en `.env`: el JSON se registra en los logs y no se envía.

# 🕊️ Agente para Iglesias

Plataforma modular para automatizar tareas de presentación en la iglesia.
Está pensada para **crecer por módulos** sin rediseñar el sistema.

> **Módulo 1 (incluido y funcional): Generador de presentaciones bíblicas para FreeShow.**
> A partir de una lista de referencias (ej. `Mateo 2:2-6 NTV`) crea automáticamente
> **un show por referencia** dentro del proyecto fijo `Versiculos` en FreeShow,
> con **una diapositiva por versículo** (título = `Libro Cap:Vers`, contenido =
> texto del versículo, pie = versión).

---

## ¿Qué hace?

Escribes referencias en una página web local y pulsas **Generar Presentación**:

```
Mateo 2:2-6 NTV
Juan 3:16 RVR1960
Salmos 23 TLA
1 Corintios 13 NVI
```

…y aparecen los proyectos listos para presentar en FreeShow.

- **Parser flexible** (sin IA): `Jn 3:16`, `juan 3 16`, `Sal 23`, `Mateo 5:3-12`, `1 Co 13`, etc.
- **Usa las Biblias que ya tienes instaladas en FreeShow** (proveedor principal,
  cache-first): lee directamente los archivos `.fsb` de FreeShow — no mantiene
  una biblioteca aparte. Si no encuentra la versión ahí, sigue con archivos
  JSON/SQLite locales y, por último, API.Bible.
- **Plantillas configurables**: el diseño de las diapositivas vive en archivos JSON (`plantillas/`), no en el código.
- **Base de datos local SQLite**: caché de versículos consultados, historial, proyectos recientes, favoritos, logs.

## Inicio rápido

```bash
npm install
copy .env.example .env      # (Windows)  /  cp .env.example .env (Mac/Linux)
npm run dev
```

Abre <http://localhost:3000>. Para que FreeShow reciba los proyectos, activa su API
(ver [docs/FREESHOW.md](docs/FREESHOW.md)).

## Documentación

| Documento | Para qué |
|-----------|----------|
| [docs/INSTALACION.md](docs/INSTALACION.md) | Instalar y ejecutar paso a paso |
| [docs/USUARIO.md](docs/USUARIO.md) | Guía para el equipo de la iglesia |
| [docs/FREESHOW.md](docs/FREESHOW.md) | Activar la API de FreeShow y solución de problemas |
| [docs/PLANTILLAS.md](docs/PLANTILLAS.md) | Crear/editar plantillas visuales |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Arquitectura y cómo añadir módulos/proveedores |

## Visión de plataforma

El Módulo 1 es el comienzo. La arquitectura permite añadir (cuando se desarrollen):
anuncios, letras de alabanza, imágenes, sermones con IA, control remoto de FreeShow,
OBS, Google Calendar, Google Sheets y programación del culto. El servicio de IA
(`AIService`) ya está listo como abstracción para esos módulos, aunque **el Módulo 1
no necesita IA**.

## Aviso sobre derechos de autor

Versiones como **NTV, RVR1960, NVI** tienen derechos de autor. Este proyecto **no
incluye** texto bíblico con copyright: usa las Biblias que tú ya importaste
legalmente en FreeShow, o tu propia clave de [API.Bible](https://scripture.api.bible),
o tus propios archivos locales. Se incluye la **Reina-Valera 1909 (dominio
público)** como ejemplo (`data/biblias/RVR1909.json`).

## Licencia

MIT

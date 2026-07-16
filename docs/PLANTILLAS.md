# Plantillas visuales

El diseño de las diapositivas **no está en el código**: vive en archivos JSON
dentro de la carpeta `plantillas/`. Puedes crear o editar plantillas sin
recompilar nada.

## Plantillas incluidas

- `Default.json` — fondo negro, título dorado, texto blanco centrado.
- `LirioDeLosValles.json` — estilo morado/dorado para la iglesia.
- `Juvenil.json` — colores vivos, alineación a la izquierda.
- `Conferencia.json` — fondo claro, sobrio.

## Elegir la plantilla activa

- En `.env`: `TEMPLATE=Default` (nombre del archivo sin `.json`).
- O en la interfaz web, con el selector **Plantilla visual** (afecta solo a esa
  generación).

## Estructura de una plantilla

Cada plantilla define tres cuadros de texto — **título**, **contenido** y
**pie** — y el fondo. Las medidas están en píxeles sobre el lienzo
(`resolution`, normalmente 1920×1080).

```json
{
  "name": "MiPlantilla",
  "resolution": { "width": 1920, "height": 1080 },
  "background": { "type": "color", "value": "#000000" },
  "title":   { "top": 60,  "left": 160, "width": 1600, "height": 140, "align": "center", "valign": "top",    "fontFamily": "Arial", "fontSize": 54, "color": "#FFD54F", "bold": true },
  "content": { "top": 240, "left": 160, "width": 1600, "height": 620, "align": "center", "valign": "center", "fontFamily": "Arial", "fontSize": 64, "color": "#FFFFFF" },
  "footer":  { "top": 940, "left": 160, "width": 1600, "height": 90,  "align": "center", "valign": "bottom", "fontFamily": "Arial", "fontSize": 36, "color": "#B0BEC5" }
}
```

### Campos de cada cuadro

| Campo | Valores | Descripción |
|-------|---------|-------------|
| `top`, `left`, `width`, `height` | número (px) | Posición y tamaño en el lienzo. |
| `align` | `left` `center` `right` | Alineación horizontal del texto. |
| `valign` | `top` `center` `bottom` | Alineación vertical dentro del cuadro. **Solo tiene efecto en `footer`** — `title` y `content` se fusionan en un solo bloque (título arriba, versículo debajo) que siempre se centra como unidad, sin importar el `valign` que tenga cada uno por separado. |
| `fontFamily` | nombre de fuente | Tipografía (debe existir en el sistema/FreeShow). |
| `fontSize` | número (px) | Tamaño de letra. |
| `color` | hex (`#RRGGBB`) | Color del texto. |
| `bold` | `true`/`false` | Negrita (opcional). |
| `italic` | `true`/`false` | Cursiva (opcional). |

### Fondo

```json
"background": { "type": "color", "value": "#1A0E2E" }
```

- `type: "color"` → `value` es un color hex.
- `type: "image"` → `value` es la ruta de una imagen.

## Crear una plantilla nueva

1. Copia `Default.json` a `plantillas/MiEstilo.json`.
2. Cambia `"name": "MiEstilo"` y los colores/posiciones.
3. Selecciónala en la web o pon `TEMPLATE=MiEstilo` en `.env`.

> Si la plantilla tiene un error (campo faltante o valor inválido), el agente lo
> avisa con un mensaje claro al generar.

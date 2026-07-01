# Guía para el usuario

Esta guía es para el equipo de la iglesia que prepara las presentaciones.

## Antes de empezar

1. Abre **FreeShow**.
2. Pide que alguien arranque el agente (`npm run dev`) o ten un acceso directo.
3. Abre <http://localhost:3000> en el navegador.

En la esquina superior derecha verás un indicador:

- 🟢 **FreeShow conectado** → todo listo.
- 🔴 **FreeShow no responde** → abre FreeShow y activa su API (ver FREESHOW.md).

## Generar presentaciones

1. Escribe las **referencias bíblicas**, una por línea:
   ```
   Mateo 2:2-6 NTV
   Juan 3:16 RVR1960
   Salmos 23 TLA
   1 Corintios 13 NVI
   ```
2. (Opcional) Elige una **versión por defecto** (se usa cuando no la escribes).
3. (Opcional) Elige una **plantilla** visual.
4. Pulsa **Generar Presentación**.

Verás un resumen con los proyectos **creados**, **omitidos** (ya existían) y los
que tuvieron **error**.

## Cómo escribir las referencias

El sistema es flexible. Todas estas formas funcionan:

| Escribes | Entiende |
|----------|----------|
| `Juan 3:16` | Juan capítulo 3, versículo 16 |
| `Jn 3:16` | igual (abreviatura) |
| `juan 3 16` | igual (sin dos puntos) |
| `Mateo 5:3-12` | rango de versículos 3 al 12 |
| `Mateo 5 3-12` | igual |
| `Mateo capítulo 5 versículos 3 al 12` | igual |
| `Salmos 23` | **todo** el capítulo 23 |
| `1 Co 13` | 1 Corintios capítulo 13 completo |
| `Juan 3:16 NTV` | con versión específica |

### Reglas

- **Un proyecto por referencia.** Su nombre será `Libro Cap:VersIni-VersFin Versión`
  (ej. `Mateo 2:2-6 NTV`).
- **Una diapositiva por versículo.** `Salmos 23:1-6` → 6 diapositivas;
  `Juan 3:16` → 1 diapositiva.
- Cada diapositiva muestra: **título** (la referencia), **contenido** (el texto) y
  **pie** (la versión).

## Preguntas frecuentes

**¿Por qué dice "omitido"?**
Ya existe un proyecto con ese nombre en FreeShow. No se crea de nuevo para no
duplicar. (Esto se puede cambiar en la configuración con `ON_DUPLICATE`.)

**¿Por qué dice "error: no se encontró el texto"?**
Esa versión no está disponible en la fuente configurada. Prueba con otra versión o
pide que se configure la fuente bíblica.

**¿Puedo cambiar los colores y la posición del texto?**
Sí, mediante las plantillas. Ver [PLANTILLAS.md](PLANTILLAS.md).

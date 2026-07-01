/**
 * Preload script de Electron.
 *
 * Se ejecuta en el contexto del renderer antes de cargar la pagina,
 * con acceso a Node.js pero aislado del renderer por contextIsolation.
 *
 * La UI actual (src/web/) es HTML/CSS/JS estatico sin llamadas IPC,
 * por lo que este script permanece minimo. Se expande cuando se
 * necesite comunicacion bidireccional renderer <-> main (notificaciones
 * de actualizacion, estado del servidor, etc.).
 */
import { contextBridge } from "electron"

// Reservado para futuras APIs expuestas al renderer.
// Ejemplo: contextBridge.exposeInMainWorld('updates', { ... })
contextBridge.exposeInMainWorld("__agente__", {
    version: process.env.npm_package_version ?? "1.0.0",
})

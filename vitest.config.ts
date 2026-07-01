import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["test/**/*.test.ts"],
        // Las pruebas e2e solo corren con la variable E2E=true (necesitan FreeShow real)
        exclude: process.env.E2E === "true" ? [] : ["test/e2e/**"],
    },
})

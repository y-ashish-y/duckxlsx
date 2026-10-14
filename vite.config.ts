import { defineConfig } from "vite";

export default defineConfig({
  root: "taskpane",
  build: { outDir: "../dist", emptyOutDir: true },
  server: { port: 3000, https: undefined },
});

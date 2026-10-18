import { defineConfig } from "vite";
import { existsSync, readFileSync } from "node:fs";

// Excel/WebView2 refuses plain http on localhost — mint trusted certs once (see README):
//   mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem localhost 127.0.0.1
const certFile = "certs/localhost.pem";
const keyFile = "certs/localhost-key.pem";
const https =
  existsSync(certFile) && existsSync(keyFile)
    ? { cert: readFileSync(certFile), key: readFileSync(keyFile) }
    : undefined;

export default defineConfig({
  root: "taskpane",
  build: { outDir: "../dist", emptyOutDir: true },
  server: { port: 3000, https },
});

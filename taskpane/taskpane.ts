import { browse } from "../src/catalog.js";
import { WasmEngine } from "../src/wasm-engine.js";

const engine = new WasmEngine();
const status = document.querySelector("#status")!;
const catalog = document.querySelector("#catalog")!;
const fileInput = document.querySelector<HTMLInputElement>("#file")!;

async function renderCatalog(): Promise<void> {
  const schemas = await browse(engine);
  catalog.innerHTML = "";
  for (const schema of schemas) {
    const s = document.createElement("li");
    s.textContent = schema.name;
    const tables = document.createElement("ul");
    for (const table of schema.tables) {
      const t = document.createElement("li");
      t.textContent = `${table.name} (${table.columns.map((c) => c.name).join(", ")})`;
      tables.appendChild(t);
    }
    s.appendChild(tables);
    catalog.appendChild(s);
  }
}

async function connect(name: string): Promise<void> {
  status.textContent = `Connected: ${name}`;
  await renderCatalog();
}

document.querySelector("#connect")!.addEventListener("click", async () => {
  try {
    if (typeof showOpenFilePicker === "function") await connect((await engine.connectWithPicker()).name);
    else fileInput.click();
  } catch (err) {
    status.textContent = `Connect failed: ${(err as Error).message}`;
  }
});

document.querySelector("#switch")!.addEventListener("click", () => {
  if (typeof showOpenFilePicker === "function") {
    (document.querySelector("#connect") as HTMLButtonElement).click();
  } else fileInput.click();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    await connect((await engine.connectWithFile(file)).name);
  } catch (err) {
    status.textContent = `Connect failed: ${(err as Error).message}`;
  }
});

Office.onReady(async () => {
  try {
    const restored = await engine.restore();
    if (restored) await connect(restored.name);
    else status.textContent = "Pick a local .duckdb file to begin.";
  } catch {
    status.textContent = "Pick a local .duckdb file to begin.";
  }
});

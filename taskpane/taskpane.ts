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
    const schemaItem = document.createElement("li");
    schemaItem.textContent = schema.name;
    const tableList = document.createElement("ul");
    for (const table of schema.tables) {
      const tableItem = document.createElement("li");
      tableItem.textContent = `${table.name} (${table.columns.map((c) => c.name).join(", ")})`;
      tableList.appendChild(tableItem);
    }
    schemaItem.appendChild(tableList);
    catalog.appendChild(schemaItem);
  }
}

async function showConnected(name: string): Promise<void> {
  status.textContent = `Connected: ${name}`;
  await renderCatalog();
}

function fail(err: unknown): void {
  status.textContent = `Connect failed: ${(err as Error).message}`;
}

async function pickAndConnect(): Promise<void> {
  try {
    if (typeof showOpenFilePicker === "function") showConnected((await engine.connectWithPicker()).name);
    else fileInput.click();
  } catch (err) {
    fail(err);
  }
}

document.querySelector("#connect")!.addEventListener("click", pickAndConnect);
document.querySelector("#switch")!.addEventListener("click", pickAndConnect);

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    await showConnected((await engine.connectWithFile(file)).name);
  } catch (err) {
    fail(err);
  }
});

Office.onReady(async () => {
  try {
    const restored = await engine.restore();
    if (restored) await showConnected(restored.name);
    else status.textContent = "Pick a local .duckdb file to begin.";
  } catch {
    status.textContent = "Pick a local .duckdb file to begin.";
  }
});

import { browse } from "../src/catalog.js";
import {
  createTableSql,
  inferColumns,
  insertSql,
  type CellValue,
  type ColumnDef,
  type ColumnOverrides,
  type ColumnType,
} from "../src/export-mapping.js";
import { WasmEngine } from "../src/wasm-engine.js";

const COLUMN_TYPES: ColumnType[] = ["INTEGER", "DOUBLE", "BOOLEAN", "TIMESTAMP", "VARCHAR"];

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

const exportTable = document.querySelector<HTMLInputElement>("#export-table")!;
const exportHeaders = document.querySelector<HTMLInputElement>("#export-headers")!;
const exportOverwrite = document.querySelector<HTMLInputElement>("#export-overwrite")!;
const exportAddress = document.querySelector("#export-address")!;
const exportPreview = document.querySelector("#export-preview")!;

function renderPreview(columns: ColumnDef[]): void {
  exportPreview.innerHTML = "";
  for (const col of columns) {
    const item = document.createElement("li");
    const nameInput = document.createElement("input");
    nameInput.value = col.name;
    nameInput.dataset.column = col.name;
    nameInput.className = "export-name";
    const typeSelect = document.createElement("select");
    typeSelect.dataset.column = col.name;
    typeSelect.className = "export-type";
    for (const t of COLUMN_TYPES) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      if (t === col.type) opt.selected = true;
      typeSelect.appendChild(opt);
    }
    item.append(nameInput, typeSelect);
    exportPreview.appendChild(item);
  }
}

function readOverrides(): ColumnOverrides {
  const overrides: ColumnOverrides = {};
  const names = exportPreview.querySelectorAll<HTMLInputElement>(".export-name");
  const types = exportPreview.querySelectorAll<HTMLSelectElement>(".export-type");
  names.forEach((nameInput, i) => {
    const current = nameInput.dataset.column!;
    const type = types[i].value as ColumnType;
    if (nameInput.value !== current || type) overrides[current] = { name: nameInput.value, type };
  });
  return overrides;
}

async function readSelection(): Promise<{ header: string[] | null; rows: CellValue[][] }> {
  let out: { header: string[] | null; rows: CellValue[][] } = { header: null, rows: [] };
  await Excel.run(async (ctx) => {
    const range = ctx.workbook.getSelectedRange();
    range.load("values,address");
    await ctx.sync();
    exportAddress.textContent = `Source: ${range.address}`;
    const matrix = range.values as CellValue[][];
    const hasHeaders = exportHeaders.checked;
    out = { header: hasHeaders ? matrix[0].map(String) : null, rows: hasHeaders ? matrix.slice(1) : matrix };
  });
  return out;
}

document.querySelector("#export-preview-btn")!.addEventListener("click", async () => {
  try {
    const { header, rows } = await readSelection();
    renderPreview(inferColumns(header, rows));
    status.textContent = "Review names and types, then Export.";
  } catch (err) {
    fail(err);
  }
});

document.querySelector("#export")!.addEventListener("click", async () => {
  const table = exportTable.value.trim();
  if (!table) {
    status.textContent = "Name the DuckDB table first.";
    return;
  }
  const overwrite = exportOverwrite.checked;
  if (overwrite && !confirm(`Overwrite ${table}? Its rows will be replaced.`)) return;
  try {
    const { header, rows } = await readSelection();
    const finalColumns = inferColumns(header, rows, readOverrides());
    await engine.query(createTableSql(table, finalColumns, overwrite ? "overwrite" : "create"));
    if (rows.length > 0) await engine.query(insertSql(table, finalColumns, rows));
    await renderCatalog();
    status.textContent = `Exported selection to ${table}.`;
  } catch (err) {
    fail(err);
  }
});

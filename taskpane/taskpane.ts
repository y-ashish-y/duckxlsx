import { browse } from "../src/catalog.js";
import {
  createTableSql,
  inferColumns,
  insertSql,
  shouldPromptOverwrite,
  tableExistsSql,
  type CellValue,
  type ColumnDef,
  type ColumnOverrides,
  type ColumnType,
} from "../src/export-mapping.js";
import { buildImportSql } from "../src/import-sql.js";
import { SavedImportStore, type SavedImport } from "../src/saved-imports.js";
import { WasmEngine } from "../src/wasm-engine.js";

const COLUMN_TYPES: ColumnType[] = ["INTEGER", "DOUBLE", "BOOLEAN", "TIMESTAMP", "VARCHAR"];

const engine = new WasmEngine();
// Dev-only automation hook (vite strips this from production builds): the
// in-Excel CDP scripts reach the live engine without clicking through the picker.
if (import.meta.env.DEV) {
  (window as unknown as { __duckxlsxEngine?: WasmEngine }).__duckxlsxEngine = engine;
}
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
      const pick = document.createElement("button");
      pick.textContent = `${table.name} (${table.columns.map((c) => c.name).join(", ")})`;
      pick.addEventListener("click", () => selectTable(schema.name, table.name, table.columns.map((c) => c.name)));
      tableItem.appendChild(pick);
      tableList.appendChild(tableItem);
    }
    schemaItem.appendChild(tableList);
    catalog.appendChild(schemaItem);
  }
}

const savedStore = new SavedImportStore(localStorage);
let selected: { schema: string; table: string } | null = null;

const importSource = document.querySelector("#import-source")!;
const importColumns = document.querySelector("#import-columns")!;
const importName = document.querySelector<HTMLInputElement>("#import-name")!;
const importLimit = document.querySelector<HTMLInputElement>("#import-limit")!;
const importNewSheet = document.querySelector<HTMLInputElement>("#import-new-sheet")!;
const importPreviewList = document.querySelector("#import-preview-list")!;
const savedList = document.querySelector("#saved-imports")!;

function selectTable(schema: string, table: string, columns: string[]): void {
  selected = { schema, table };
  importSource.textContent = `${schema}.${table}`;
  importColumns.innerHTML = "";
  for (const col of columns) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = true;
    box.value = col;
    box.className = "import-col";
    label.append(box, col);
    importColumns.appendChild(label);
  }
  if (!importName.value) importName.value = table;
}

function checkedColumns(): string[] {
  return [...importColumns.querySelectorAll<HTMLInputElement>(".import-col")]
    .filter((b) => b.checked)
    .map((b) => b.value);
}

function requireSelected(): { schema: string; table: string } {
  if (!selected) {
    status.textContent = "Pick a table above first.";
    throw new Error("no table selected");
  }
  return selected;
}

function parseLimit(): number | undefined {
  const raw = importLimit.value.trim();
  if (raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    status.textContent = `Row limit "${raw}" is not a positive whole number — fix it or clear it.`;
    throw new Error("invalid limit");
  }
  return n;
}

function requireColumns(): string[] {
  const columns = checkedColumns();
  if (columns.length === 0) {
    status.textContent = "Check at least one column.";
    throw new Error("no columns checked");
  }
  return columns;
}

async function runImport(
  imp: Omit<SavedImport, "name" | "destination"> & { name?: string },
  destination: SavedImport["destination"],
): Promise<void> {
  const sql = buildImportSql({ schema: imp.schema, table: imp.table, columns: imp.columns, limit: imp.limit });
  const rows = await engine.query<Record<string, unknown>>(sql);
  const values = rows.map((r) => imp.columns.map((c) => (r[c] as CellValue) ?? null));
  await Excel.run(async (ctx) => {
    let sheet: Excel.Worksheet;
    if (destination.mode === "new-sheet") {
      const sheetName = imp.name ?? imp.table;
      try {
        sheet = ctx.workbook.worksheets.getItem(sheetName);
      } catch {
        sheet = ctx.workbook.worksheets.add(sheetName);
      }
    } else {
      sheet = ctx.workbook.worksheets.getActiveWorksheet();
    }
    const anchor =
      destination.mode === "new-sheet" ? sheet.getRange("A1") : ctx.workbook.getSelectedRange();
    const dest = anchor.getResizedRange(values.length, imp.columns.length - 1);
    dest.values = [imp.columns, ...values];
    sheet.tables.add(dest, true);
    await ctx.sync();
  });
  renderSaved();
  status.textContent = `Imported ${rows.length} rows${imp.name ? ` as ${imp.name}` : ""}.`;
}

function renderSaved(): void {
  savedList.innerHTML = "";
  for (const imp of savedStore.list()) {
    const item = document.createElement("li");
    const rerun = document.createElement("button");
    rerun.textContent = imp.name;
    rerun.addEventListener("click", () => {
      runImport(imp, imp.destination).catch(fail);
    });
    const remove = document.createElement("button");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      savedStore.remove(imp.name);
      renderSaved();
    });
    item.append(rerun, remove);
    savedList.appendChild(item);
  }
}

document.querySelector("#import-preview")!.addEventListener("click", async () => {
  try {
    const { schema, table } = requireSelected();
    const columns = requireColumns();
    const rows = await engine.query<Record<string, unknown>>(
      buildImportSql({ schema, table, columns, limit: parseLimit() ?? 5 }),
    );
    importPreviewList.innerHTML = "";
    for (const row of rows) {
      const item = document.createElement("li");
      item.textContent = JSON.stringify(row);
      importPreviewList.appendChild(item);
    }
    status.textContent = `${rows.length} preview rows.`;
  } catch (err) {
    if ((err as Error).message !== "no table selected") fail(err);
  }
});

function collectDraft(): Omit<SavedImport, "name" | "destination"> {
  const { schema, table } = requireSelected();
  return { schema, table, columns: requireColumns(), limit: parseLimit() };
}

function currentDestination(): SavedImport["destination"] {
  return importNewSheet.checked ? { mode: "new-sheet" } : { mode: "current" };
}

document.querySelector("#import-save")!.addEventListener("click", async () => {
  try {
    const draft = collectDraft();
    const name = importName.value.trim() || draft.table;
    const destination = currentDestination();
    savedStore.save({ ...draft, name, destination });
    await runImport({ ...draft, name }, destination);
  } catch (err) {
    if (!["no table selected", "no columns checked", "invalid limit"].includes((err as Error).message)) fail(err);
  }
});

document.querySelector("#import-once")!.addEventListener("click", async () => {
  try {
    const draft = collectDraft();
    await runImport(draft, currentDestination());
  } catch (err) {
    if (!["no table selected", "no columns checked", "invalid limit"].includes((err as Error).message)) fail(err);
  }
});

async function showConnected(name: string): Promise<void> {
  status.textContent = `Connected: ${name}`;
  await renderCatalog();
  renderSaved();
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

// window.confirm throws in Excel's WebView2 ("Function window.confirm is not
// supported.") and the old check sat outside the try — Export with "overwrite
// existing table" ticked quietly did nothing inside Excel. Ask with an inline
// prompt instead, and keep every failure inside a try so it reaches #status.
const exportConfirm = document.querySelector<HTMLDivElement>("#export-confirm")!;
const exportConfirmText = document.querySelector<HTMLSpanElement>("#export-confirm-text")!;
let pendingOverwrite: string | null = null;

function hideOverwritePrompt(): void {
  pendingOverwrite = null;
  exportConfirm.hidden = true;
}

async function runExport(table: string): Promise<void> {
  const { header, rows } = await readSelection();
  const finalColumns = inferColumns(header, rows, readOverrides());
  await engine.query(
    createTableSql(table, finalColumns, exportOverwrite.checked ? "overwrite" : "create"),
  );
  if (rows.length > 0) await engine.query(insertSql(table, finalColumns, rows));
  await renderCatalog();
  status.textContent = `Exported selection to ${table}.`;
}

async function tableExists(table: string): Promise<boolean> {
  return (await engine.query(tableExistsSql(table))).length > 0;
}

document.querySelector("#export")!.addEventListener("click", async () => {
  hideOverwritePrompt();
  try {
    const table = exportTable.value.trim();
    if (!table) {
      status.textContent = "Name the DuckDB table first.";
      return;
    }
    if (shouldPromptOverwrite(exportOverwrite.checked, await tableExists(table))) {
      pendingOverwrite = table;
      exportConfirmText.textContent = `Overwrite ${table}? Its rows will be replaced.`;
      exportConfirm.hidden = false;
      document.querySelector<HTMLButtonElement>("#export-confirm-yes")!.focus();
      return;
    }
    await runExport(table);
  } catch (err) {
    fail(err);
  }
});

document.querySelector("#export-confirm-yes")!.addEventListener("click", async () => {
  const table = pendingOverwrite;
  hideOverwritePrompt();
  if (!table) return;
  try {
    await runExport(table);
  } catch (err) {
    fail(err);
  }
});

document.querySelector("#export-confirm-no")!.addEventListener("click", () => {
  const table = pendingOverwrite;
  hideOverwritePrompt();
  if (table) status.textContent = `Left ${table} unchanged.`;
});

// a prompt for a table name the user has since edited would be stale
exportTable.addEventListener("input", hideOverwritePrompt);

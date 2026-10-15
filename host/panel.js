// duckxlsx host panel: drives the GridCraft ?host=parent iframe via
// postMessage (gridcraft:open in, gridcraft:save/dirty/failed out) and the
// sidecar API (/api/*) for DuckDB work. No build step — served raw.
const $ = (id) => document.querySelector(id);
const statusEl = $("#status");
const frame = $("#gridcraft");

const config = await (await fetch("./api/config")).json();
frame.src = config.gridcraftUrl;
const gridcraftOrigin = new URL(config.gridcraftUrl, location.href).origin;

const say = (msg) => { statusEl.textContent = msg; };
const fail = (msg) => { statusEl.textContent = `Error: ${msg}`; };

const api = async (path, init) => {
  const res = await fetch(path, init);
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).error ?? detail; } catch { /* keep status */ }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res;
};

// --- iframe messages (protocol: apps/gridcraft-web/src/host.rs) ---
let savedFile = null;

window.addEventListener("message", (event) => {
  if (event.origin !== gridcraftOrigin || event.source !== frame.contentWindow) return;
  const msg = event.data ?? {};
  if (msg.type === "gridcraft:ready") say(`GridCraft ${msg.version ?? ""} ready. Connect a .duckdb to begin.`);
  else if (msg.type === "gridcraft:dirty") $("#dirty").textContent = msg.dirty ? "● Unsaved changes" : "";
  else if (msg.type === "gridcraft:failed") fail(`GridCraft failed to start: ${msg.error}`);
  else if (msg.type === "gridcraft:save") {
    savedFile = { name: msg.name, bytes: msg.bytes };
    $("#savedfile").textContent = `Received ${msg.name} (${msg.bytes.byteLength} bytes) — ready to export.`;
    say(`Saved ${msg.name} received from GridCraft.`);
  }
});

// --- connection + catalog ---
$("#connect").addEventListener("click", async () => {
  const db = $("#db").value.trim();
  if (!db) return fail("enter a DuckDB file path");
  try {
    const tables = await (await api(`/api/tables?db=${encodeURIComponent(db)}`)).json();
    const select = $("#tables");
    select.innerHTML = "";
    for (const t of tables) {
      const opt = document.createElement("option");
      opt.value = JSON.stringify(t);
      opt.textContent = `${t.schema}.${t.table}`;
      select.appendChild(opt);
    }
    say(tables.length ? `Connected: ${db} (${tables.length} tables)` : `Connected: ${db} (no tables)`);
  } catch (err) { fail(err.message); }
});

// --- import: DuckDB table -> xlsx bytes -> gridcraft:open ---
$("#import").addEventListener("click", async () => {
  const db = $("#db").value.trim();
  const sel = $("#tables").value;
  if (!db || !sel) return fail("connect and pick a table first");
  const { schema, table } = JSON.parse(sel);
  try {
    say(`Importing ${schema}.${table}…`);
    const res = await api("/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ db, schema, table }),
    });
    const bytes = await res.arrayBuffer();
    frame.contentWindow.postMessage({ type: "gridcraft:open", name: `${table}.xlsx`, bytes }, gridcraftOrigin);
    say(`${table}: ${res.headers.get("x-rows")} rows sent to GridCraft.`);
  } catch (err) { fail(err.message); }
});

// --- export: saved bytes -> DuckDB table ---
const doExport = (mode) => async () => {
  const db = $("#db").value.trim();
  const table = $("#target").value.trim();
  if (!db) return fail("connect first");
  if (!savedFile) return fail("press Save in GridCraft first, then export");
  if (!table) return fail("enter a target table name");
  try {
    say(`Exporting to ${table}…`);
    const res = await api(`/api/export?db=${encodeURIComponent(db)}&table=${encodeURIComponent(table)}&mode=${mode}`, {
      method: "POST",
      body: savedFile.bytes,
    });
    say(`${table}: ${(await res.json()).rows} rows written.`);
  } catch (err) { fail(err.message); }
};
$("#export").addEventListener("click", doExport("create"));
$("#overwrite").addEventListener("click", doExport("overwrite"));

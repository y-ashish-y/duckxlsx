import { spawn, type ChildProcess } from "child_process";

export type CellMatrix = (string | number | boolean | null)[][];

export type CellValue = string | number | boolean | null;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

const PROTOCOL_VERSION = "2025-06-18";
const REQUEST_TIMEOUT_MS = 30_000;

function toolText(result: { content?: { type: string; text: string }[] }, sep: string): string {
  return result?.content?.map((c) => c.text).join(sep) ?? "";
}

// Thin stdio JSON-RPC client over `gridcraft-cli mcp` (newline-delimited,
// protocol 2025-06-18). One tool call at a time; responses matched by id.
export class GridCraftBridge {
  private proc: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private buffer = "";

  constructor(private cliPath: string) {}

  async start(): Promise<void> {
    this.proc = spawn(this.cliPath, ["mcp"], { stdio: ["pipe", "pipe", "inherit"] });
    this.proc.stdout!.on("data", (chunk: Buffer) => this.onData(chunk.toString()));
    this.proc.on("error", (err) => this.failAll(`spawn failed: ${err.message}`));
    this.proc.on("exit", (code) => {
      if (this.pending.size > 0) this.failAll(`gridcraft-cli exited with code ${code}`);
    });
    const hello = (await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "duckxlsx", version: "0.0.0" },
    })) as { protocolVersion?: string };
    if (hello?.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(`gridcraft mcp: protocol mismatch (server: ${hello?.protocolVersion})`);
    }
    this.notify("notifications/initialized");
  }

  private failAll(message: string): void {
    for (const [, pending] of this.pending) pending.reject(new Error(message));
    this.pending.clear();
  }

  private onData(text: string): void {
    this.buffer += text;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let msg: { id?: number; result?: unknown; error?: { message: string } };
      try {
        msg = JSON.parse(line) as typeof msg;
      } catch {
        continue;
      }
      if (msg.id === undefined) continue;
      const pending = this.pending.get(msg.id);
      if (!pending) continue;
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(`gridcraft mcp: ${msg.error.message}`));
      else pending.resolve(msg.result);
    }
  }

  private send(payload: object): void {
    if (!this.proc?.stdin) throw new Error("bridge not started");
    this.proc.stdin.write(JSON.stringify(payload) + "\n");
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`gridcraft mcp: ${method} timed out`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      try {
        this.send({ jsonrpc: "2.0", id, method, params });
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err as Error);
      }
    });
  }

  private notify(method: string): void {
    this.send({ jsonrpc: "2.0", method });
  }

  async callTool(tool: string, args: Record<string, unknown>): Promise<unknown> {
    const result = (await this.request("tools/call", { name: tool, arguments: args })) as {
      content?: { type: string; text: string }[];
      isError?: boolean;
    };
    if (result?.isError) throw new Error(`gridcraft ${tool}: ${toolText(result, " ")}`);
    const text = toolText(result, "");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  async newWorkbook(): Promise<void> {
    await this.callTool("new_workbook", {});
  }

  async executeCommand(command: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.callTool("execute_command", { command, params });
  }

  async openWorkbook(path: string): Promise<void> {
    await this.callTool("open_workbook", { path });
  }

  async saveWorkbook(path?: string): Promise<void> {
    await this.callTool("save_workbook", path ? { path } : {});
  }

  async writeRange(range: string, values: CellMatrix): Promise<void> {
    await this.callTool("write_range", { range, values });
  }

  async readRange(range: string): Promise<CellMatrix> {
    const result = (await this.callTool("read_range", { range })) as { values?: CellMatrix } | CellMatrix;
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.values)) return result.values;
    throw new Error(`gridcraft read_range: unexpected response for ${range}`);
  }

  async close(): Promise<void> {
    this.failAll("bridge closed");
    this.proc?.kill();
    this.proc = null;
  }
}

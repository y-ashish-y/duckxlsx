import { spawn, type ChildProcess } from "child_process";

export type CellMatrix = (string | number | boolean | null)[][];

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

// Thin stdio JSON-RPC client over `gridcraft-cli mcp` (newline-delimited,
// protocol 2025-06-18). One tool call at a time; responses matched by id.
export class GridCraftBridge {
  private proc: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private buffer = "";

  constructor(private binary: string) {}

  async start(): Promise<void> {
    this.proc = spawn(this.binary, ["mcp"], { stdio: ["pipe", "pipe", "inherit"] });
    this.proc.stdout!.on("data", (chunk: Buffer) => this.onData(chunk.toString()));
    await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "duckxlsx", version: "0.0.0" },
    });
    this.notify("notifications/initialized");
  }

  private onData(text: string): void {
    this.buffer += text;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: { message: string } };
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
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  private notify(method: string): void {
    this.send({ jsonrpc: "2.0", method });
  }

  async call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    const result = (await this.request("tools/call", { name: tool, arguments: args })) as {
      content?: { type: string; text: string }[];
      isError?: boolean;
    };
    if (result?.isError) {
      const text = result.content?.map((c) => c.text).join(" ") ?? tool;
      throw new Error(`gridcraft ${tool}: ${text}`);
    }
    const text = result?.content?.map((c) => c.text).join("") ?? "";
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  async newWorkbook(): Promise<void> {
    await this.call("new_workbook", {});
  }

  async openWorkbook(path: string): Promise<void> {
    await this.call("open_workbook", { path });
  }

  async saveWorkbook(path?: string): Promise<void> {
    await this.call("save_workbook", path ? { path } : {});
  }

  async writeRange(range: string, values: CellMatrix): Promise<void> {
    await this.call("write_range", { range, values });
  }

  async readRange(range: string): Promise<CellMatrix> {
    const result = (await this.call("read_range", { range })) as { values?: CellMatrix } | CellMatrix;
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.values)) return result.values;
    throw new Error(`gridcraft read_range: unexpected response for ${range}`);
  }

  async close(): Promise<void> {
    this.proc?.kill();
    this.proc = null;
    for (const [, pending] of this.pending) pending.reject(new Error("bridge closed"));
    this.pending.clear();
  }
}

import { existsSync, mkdirSync } from "fs";

// Headless-verifiable only where gridcraft-cli exists:
// GRIDCRAFT_CLI=/path/to/gridcraft-cli npm test
export function binaryPath(): string {
  const fromEnv = process.env.GRIDCRAFT_CLI;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  throw new Error("set GRIDCRAFT_CLI=/path/to/gridcraft-cli to run bridge tests");
}

export function tmpPath(name: string): string {
  const dir = `${process.cwd()}/fixtures/tmp`;
  mkdirSync(dir, { recursive: true });
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${dir}/${stamp}-${name}`;
}

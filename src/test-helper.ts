import { existsSync } from "fs";

// Headless-verifiable only where gridcraft-cli exists:
// GRIDCRAFT_CLI=/path/to/gridcraft-cli npm test
export function binaryPath(): string {
  const fromEnv = process.env.GRIDCRAFT_CLI;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  throw new Error("set GRIDCRAFT_CLI=/path/to/gridcraft-cli to run bridge tests");
}

/**
 * Cross-platform test runner for config2mcp.
 * Builds both tsconfigs then runs node --test with an explicitly resolved
 * file list — no shell globbing, identical behavior on macOS/Linux/Windows.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, shell: process.platform === "win32" });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

run("node", [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"]);
run("node", [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.test.json"]);

async function* collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* collect(p);
    else if (entry.name.endsWith(".test.js")) yield p;
  }
}

const distTest = path.join(root, "dist-test", "test");
const files = [];
for await (const f of collect(distTest)) files.push(f);

if (files.length === 0) {
  console.error("no test files found under", distTest);
  process.exit(1);
}

run(process.execPath, ["--test", ...files]);

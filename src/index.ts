#!/usr/bin/env node
/**
 * config2mcp — turn any CLI into an MCP server. Zero code.
 *
 * Usage:
 *   config2mcp serve <config.yaml> [--dry-run]   start MCP server (--dry-run: no execution)
 *   config2mcp validate <config.yaml>   check a config file
 *   config2mcp inspect <config.yaml>    print the tools that would be exposed
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { parseConfig, ConfigError } from "./config.js";
import { buildInputSchema } from "./schema.js";
import { runStdio } from "./server.js";

function readConfig(path: string) {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`config2mcp: cannot read ${path}: ${msg}`);
    process.exit(1);
  }
  try {
    return parseConfig(raw);
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`config2mcp: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

function usage(): never {
  console.error(`Usage:
  config2mcp serve <config.yaml> [--dry-run]   Start an MCP server on stdio
      --dry-run   print the argv each tool call would run, never execute
  config2mcp validate <config.yaml>            Validate a config file
  config2mcp inspect <config.yaml>             Show the tools that would be exposed`);
  process.exit(2);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const positional = argv.filter(a => !a.startsWith("--"));
  const [cmd, configPath] = positional;
  if (!cmd || !configPath) usage();

  switch (cmd) {
    case "serve": {
      const cfg = readConfig(configPath);
      if (dryRun) {
        console.error("config2mcp: --dry-run enabled — tool calls will print argv instead of executing.");
      }
      await runStdio(cfg, { env: cfg.env, dryRun });
      return;
    }
    case "validate": {
      const cfg = readConfig(configPath);
      console.log(`✓ valid — ${cfg.tools.length} tool(s)`);
      return;
    }
    case "inspect": {
      const cfg = readConfig(configPath);
      for (const t of cfg.tools) {
        const name = cfg.prefix ? `${cfg.prefix}_${t.name}` : t.name;
        console.log(`${name}  →  ${t.command} ${t.args.join(" ")}`);
        const schema = buildInputSchema(t);
        for (const [pname, prop] of Object.entries(schema.properties)) {
          const req = schema.required.includes(pname) ? "required" : "optional";
          const en = prop.enum ? ` enum={${prop.enum.join(",")}}` : "";
          console.log(`    ${pname}: ${prop.type} (${req})${en}`);
        }
      }
      return;
    }
    default:
      usage();
  }
}

main().catch(e => {
  console.error("config2mcp:", e instanceof Error ? e.message : e);
  process.exit(1);
});

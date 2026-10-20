/**
 * cli2mcp — MCP server construction.
 *
 * Wires a validated config into an MCP server over stdio. Each tool call is
 * executed by the executor; results are returned as readable text (plus
 * structured content when jsonOutput is enabled).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { buildZodShape } from "./schema.js";
import { runTool } from "./executor.js";
import type { Cli2McpConfig, ToolSpec } from "./config.js";

function prefixedName(cfg: Cli2McpConfig, tool: ToolSpec): string {
  return cfg.prefix ? `${cfg.prefix}_${tool.name}` : tool.name;
}

/** Render an execution result as the text block the agent will read. */
function renderResult(spec: ToolSpec, res: import("./executor.js").ExecResult): CallToolResult {
  const parts: string[] = [];
  const ok = res.ok;

  if (res.dryRun) {
    return {
      content: [{
        type: "text",
        text: `[DRY RUN] nothing was executed.\n\n$ ${spec.command} ${res.argv.map(a => JSON.stringify(a)).join(" ")}`,
      }],
      isError: false,
    };
  }

  if (ok) {
    if (spec.jsonOutput) {
      const parsed = tryParseJson(res.stdout);
      if (parsed !== undefined) {
        return {
          content: [
            { type: "text", text: truncate(res.stdout) || "(empty stdout)" },
          ],
          structuredContent: parsed as Record<string, unknown>,
          isError: false,
        };
      }
    }
    parts.push(truncate(res.stdout) || "(no output)");
  } else {
    parts.push(`Command failed (exit code: ${res.exitCode ?? "killed"}).`);
  }
  if (!ok || spec.includeStderr) {
    if (res.stderr.trim()) parts.push("stderr:\n" + truncate(res.stderr));
  }
  if (!ok) {
    parts.push(`stdout:\n${truncate(res.stdout) || "(no output)"}`);
    parts.push(`argv: ${res.argv.map(a => JSON.stringify(a)).join(" ")}`);
  }

  return { content: [{ type: "text", text: parts.join("\n\n") }], isError: !ok };
}

function tryParseJson(text: string): unknown {
  const t = text.trim();
  if (!t) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

function truncate(s: string, max = 64_000): string {
  return s.length > max ? s.slice(0, max) + "\n…[truncated by cli2mcp]" : s;
}

export interface CreateServerOptions {
  /** Resolved env block from the config file. */
  env?: Record<string, string>;
  /** When true, tool calls print the argv instead of executing. */
  dryRun?: boolean;
}

/** Build an McpServer from a validated config. Exposed for tests. */
export function createServer(cfg: Cli2McpConfig, opts: CreateServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: "config2mcp", version: "0.1.1" },
    { capabilities: { tools: {} } },
  );

  if (cfg.tools.length === 0) {
    // Zero tools configured (e.g. bare `config2mcp` server mode with no
    // config found). Register a single meta tool so the server is fully
    // functional over MCP and tells the caller how to add real tools.
    server.tool(
      "config2mcp_help",
      "This config2mcp server has no tools configured yet. Call this to learn how to add CLI tools.",
      async (): Promise<CallToolResult> => ({
        content: [{
          type: "text",
          text:
            "config2mcp exposes CLI tools described in a YAML config.\n\n" +
            "To add tools:\n" +
            "  1. Write a config file (see https://github.com/linwanwanwa/config2mcp#config-reference)\n" +
            "  2. Restart with: config2mcp serve <config.yaml>\n" +
            "     or set CONFIG2MCP_CONFIG=<path> and run bare \"config2mcp\"\n\n" +
            "Auto-discovery looks at: $CONFIG2MCP_CONFIG, ./tools.yaml, ./config2mcp.yaml",
        }],
        isError: false,
      }),
    );
    return server;
  }

  for (const spec of cfg.tools) {
    const name = prefixedName(cfg, spec);
    const shape = buildZodShape(spec);
    const handler = async (args: Record<string, unknown>): Promise<CallToolResult> => {
      const res = await runTool(spec, args ?? {}, { env: opts.env, dryRun: opts.dryRun });
      return renderResult(spec, res);
    };
    server.tool(name, spec.description, shape, handler);
  }

  return server;
}

/** Run the stdio server. Resolves when the transport closes. */
export async function runStdio(cfg: Cli2McpConfig, opts: CreateServerOptions = {}): Promise<void> {
  const server = createServer(cfg, opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

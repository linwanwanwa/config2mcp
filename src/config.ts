/**
 * cli2mcp — declarative config schema & validation.
 *
 * A config file describes CLI tools that should be exposed as MCP tools.
 * Everything is validated here before any command is ever executed.
 */
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

const envVarName = /^[A-Za-z_][A-Za-z0-9_]*$/;

const paramSchema = z.object({
  /** CLI flag the value will be attached to, e.g. "--format". Omit for positional. */
  flag: z.string().optional(),
  /** Parameter name shown to the agent. */
  name: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/, "must be lowerCamelCase identifier"),
  /** Human description — the agent reads this to decide how to use it. */
  description: z.string().optional(),
  type: z.enum(["string", "number", "boolean"]).default("string"),
  required: z.boolean().default(false),
  /** For string params: allow-list of accepted values (rendered as an enum). */
  enum: z.array(z.string()).optional(),
  /** For string params: attach value with "=" instead of a separate argv token. */
  equalsForm: z.boolean().default(false),
  /** Only meaningful for boolean: emit this literal token when true (e.g. "--verbose"). */
  trueFlag: z.string().optional(),
  /**
   * Where the flag tokens go in argv:
   * - "global": right after the executable, before spec.args (e.g. git -C <path> log)
   * - "local" (default): after spec.args (the common case)
   */
  placement: z.enum(["global", "local"]).default("local"),
  /** For string params: when set, the value is passed as a single positional arg. */
  positional: z.boolean().default(false),
  /** Default value used when the agent omits the param. */
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const toolSchema = z.object({
  /** Name of the MCP tool (also used in error messages). */
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, "must be snake_case"),
  /** One-sentence description the agent reads. */
  description: z.string().min(1),
  /** Executable to run, e.g. "ffmpeg". Resolved against PATH by the shell. */
  command: z.string().min(1),
  /** Literal argv tokens placed before every parameter, e.g. ["-i"]. */
  args: z.array(z.string()).default([]),
  params: z.array(paramSchema).default([]),
  /** Working directory for the command. */
  cwd: z.string().optional(),
  /** Kill the process after this many milliseconds. Default 30_000. */
  timeoutMs: z.number().int().positive().max(600_000).default(30_000),
  /** When true, stdout is expected to be JSON and is returned as a structured result. */
  jsonOutput: z.boolean().default(false),
  /** When true, also return stderr in the tool result. Default false. */
  includeStderr: z.boolean().default(false),
});

export const configSchema = z.object({
  /** Tool namespace prefix, e.g. "ffmpeg" → tools named "ffmpeg_probe". */
  prefix: z.string().regex(/^[a-z][a-z0-9-]*$/).optional(),
  env: z.record(z.string()).optional(),
  tools: z.array(toolSchema), // may be empty in auto-discovery server mode
});

export type Param = z.infer<typeof paramSchema>;
export type ToolSpec = z.infer<typeof toolSchema>;
export type Cli2McpConfig = z.infer<typeof configSchema>;

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Parse a YAML or JSON config string into a validated Cli2McpConfig. */
export function parseConfig(raw: string): Cli2McpConfig {
  let data: unknown;
  try {
    data = parseYaml(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ConfigError(`Failed to parse config as YAML/JSON: ${msg}`);
  }
  if (typeof data !== "object" || data === null) {
    throw new ConfigError("Config must be a YAML/JSON object at the top level.");
  }
  const parsed = configSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(i => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`Invalid config:\n${issues}`);
  }
  validateToolSet(parsed.data);
  return parsed.data;
}

/** Cross-field validations that zod alone cannot express. */
function validateToolSet(cfg: Cli2McpConfig): void {
  const seen = new Set<string>();
  for (const tool of cfg.tools) {
    if (seen.has(tool.name)) {
      throw new ConfigError(`Duplicate tool name: "${tool.name}". Tool names must be unique.`);
    }
    seen.add(tool.name);
    if (cfg.prefix && `${cfg.prefix}_${tool.name}`.length > 64) {
      throw new ConfigError(
        `Prefixed tool name "${cfg.prefix}_${tool.name}" exceeds 64 characters (MCP limit).`,
      );
    }
    const paramNames = new Set<string>();
    for (const p of tool.params) {
      if (paramNames.has(p.name)) {
        throw new ConfigError(`Tool "${tool.name}": duplicate param name "${p.name}".`);
      }
      paramNames.add(p.name);
      if (p.type === "boolean" && (p.required || p.default !== undefined)) {
        // allowed, but flag+positional combos are not
      }
      if (p.positional && !p.flag) {
        if (p.type === "boolean") {
          throw new ConfigError(
            `Tool "${tool.name}": positional param "${p.name}" cannot be boolean.`,
          );
        }
        if (p.equalsForm) {
          throw new ConfigError(
            `Tool "${tool.name}": positional param "${p.name}" cannot use equalsForm.`,
          );
        }
      }
      if (p.positional && p.flag) {
        throw new ConfigError(
          `Tool "${tool.name}": param "${p.name}" cannot be both positional and have a flag.`,
        );
      }
      if (p.type === "boolean" && !p.flag && !p.trueFlag) {
        throw new ConfigError(
          `Tool "${tool.name}": boolean param "${p.name}" needs either flag or trueFlag.`,
        );
      }
    }
  }
  if (cfg.env) {
    for (const key of Object.keys(cfg.env)) {
      if (!envVarName.test(key)) {
        throw new ConfigError(`Invalid environment variable name in env: "${key}".`);
      }
    }
  }
}

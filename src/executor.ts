/**
 * cli2mcp — safe command execution engine.
 *
 * Commands are spawned directly (never through a shell), so shell injection
 * is structurally impossible: every user value becomes exactly one argv
 * token. Output size and runtime are both bounded.
 */
import { spawn } from "node:child_process";
import type { ToolSpec } from "./config.js";

export interface ExecResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  argv: string[];
  durationMs: number;
  /** True when the command was not actually executed (dry run). */
  dryRun?: boolean;
}

/** Hard cap on captured output — protects the agent context window. */
const MAX_OUTPUT_BYTES = 256 * 1024;

/* ------------------------------------------------------------------ */
/* argv construction                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build the final argv from a tool spec and validated parameter values.
 * Pure function — trivially unit-testable, and the single place where
 * agent-controlled data touches the command line.
 */
export function buildArgv(spec: ToolSpec, values: Record<string, unknown>): string[] {
  const globalTokens: string[] = [];
  const localTokens: string[] = [];
  const positional: { value: string; order: number }[] = [];

  spec.params.forEach((p, idx) => {
    let v = values[p.name];
    if (v === undefined) v = p.default;
    if (v === undefined || v === null) {
      return; // omitted optional param → nothing on the command line
    }

    const sink = p.placement === "global" ? globalTokens : localTokens;

    if (p.type === "boolean") {
      if (v === true) {
        sink.push(p.trueFlag ?? p.flag ?? "");
      }
      return;
    }

    const s = String(v);
    if (p.flag && !p.positional) {
      if (p.equalsForm) {
        sink.push(`${p.flag}=${s}`);
      } else {
        sink.push(p.flag, s);
      }
    } else {
      positional.push({ value: s, order: idx });
    }
  });

  positional.sort((a, b) => a.order - b.order);
  return [...globalTokens, ...spec.args, ...localTokens, ...positional.map(x => x.value)];
}

/* ------------------------------------------------------------------ */
/* execution                                                           */
/* ------------------------------------------------------------------ */

export interface RunOptions {
  /** Extra env vars (config-level env block) merged over process.env. */
  env?: Record<string, string>;
  /** Override the cwd from the tool spec. */
  cwd?: string;
  /** Override timeoutMs from the tool spec. */
  timeoutMs?: number;
  /**
   * Print the argv that would run instead of executing it.
   * The result is marked ok=false so the agent sees it is not real output.
   */
  dryRun?: boolean;
}

/**
 * Run a tool spec with the given values. Never throws for command failures —
 * failures are data (non-zero exit, timeout) so the agent can see them.
 */
export async function runTool(
  spec: ToolSpec,
  values: Record<string, unknown>,
  opts: RunOptions = {},
): Promise<ExecResult> {
  const argv = buildArgv(spec, values);

  if (opts.dryRun) {
    return {
      ok: true,
      exitCode: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      argv,
      durationMs: 0,
      dryRun: true,
    };
  }

  const cwd = opts.cwd ?? spec.cwd;
  const timeoutMs = opts.timeoutMs ?? spec.timeoutMs;
  const env = opts.env ? { ...process.env, ...opts.env } : { ...process.env };

  const started = Date.now();
  let stdout = "";
  let stderr = "";
  let stdoutCut = false;
  let stderrCut = false;
  let timedOut = false;
  let spawnError: string | null = null;
  let exitCode: number | null = null;

  await new Promise<void>(resolve => {
    let child;
    try {
      child = spawn(spec.command, argv, {
        cwd,
        env,
        shell: false, // security: never a shell
        windowsHide: true,
      });
    } catch (err) {
      spawnError = err instanceof Error ? err.message : String(err);
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length + chunk.length > MAX_OUTPUT_BYTES) {
        stdoutCut = true;
        stdout += chunk.subarray(0, Math.max(0, MAX_OUTPUT_BYTES - stdout.length)).toString("utf8");
        child.kill("SIGKILL");
      } else {
        stdout += chunk.toString("utf8");
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length + chunk.length > MAX_OUTPUT_BYTES) {
        stderrCut = true;
        stderr += chunk.subarray(0, Math.max(0, MAX_OUTPUT_BYTES - stderr.length)).toString("utf8");
      } else {
        stderr += chunk.toString("utf8");
      }
    });
    child.on("error", err => {
      spawnError = err.message;
      clearTimeout(timer);
      resolve();
    });
    child.on("close", (code: number | null) => {
      exitCode = code;
      clearTimeout(timer);
      resolve();
    });
  });

  if (spawnError !== null) {
    stderr += (stderr ? "\n" : "") + `[config2mcp] failed to run "${spec.command}": ${spawnError}`;
  }
  if (timedOut) {
    stderr += (stderr ? "\n" : "") + `[config2mcp] timed out after ${timeoutMs} ms and was killed.`;
  }

  return {
    ok: spawnError === null && !timedOut && exitCode === 0,
    exitCode,
    stdout: stdoutCut ? stdout + "\n[config2mcp] output truncated at 256 KiB" : stdout,
    stderr: stderrCut ? stderr + "\n[config2mcp] stderr truncated at 256 KiB" : stderr,
    timedOut,
    argv,
    durationMs: Date.now() - started,
  };
}

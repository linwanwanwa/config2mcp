import { test } from "node:test";
import assert from "node:assert/strict";
import { buildArgv, runTool } from "../src/executor.js";
import { parseConfig } from "../src/config.js";

function specOf(yaml: string) {
  return parseConfig(yaml).tools[0];
}

/**
 * All executing tests below run `${NODE} -e <script>` so the suite works on
 * macOS, Linux and Windows CI alike — no dependency on Unix coreutils.
 */
const NODE = process.execPath;

test("buildArgv: flag params in declared order", () => {
  const spec = specOf(`
tools:
  - name: t
    description: x
    command: curl
    args: ["https://api.example.com"]
    params:
      - { name: method, flag: "-X", type: string, required: true }
      - { name: header, flag: "-H", type: string }
`);
  const argv = buildArgv(spec, { method: "POST" });
  assert.deepEqual(argv, ["https://api.example.com", "-X", "POST"]);
});

test("buildArgv: equalsForm renders --flag=value", () => {
  const spec = specOf(`
tools:
  - name: t
    description: x
    command: ffmpeg
    params:
      - { name: crf, flag: "--crf", equalsForm: true, type: string }
`);
  assert.deepEqual(buildArgv(spec, { crf: "23" }), ["--crf=23"]);
});

test("buildArgv: boolean trueFlag emitted only when true", () => {
  const spec = specOf(`
tools:
  - name: t
    description: x
    command: ls
    params:
      - { name: all, type: boolean, trueFlag: "-a" }
`);
  assert.deepEqual(buildArgv(spec, { all: true }), ["-a"]);
  assert.deepEqual(buildArgv(spec, { all: false }), []);
  assert.deepEqual(buildArgv(spec, {}), []);
});

test("buildArgv: positional params keep declaration order", () => {
  const spec = specOf(`
tools:
  - name: t
    description: x
    command: cp
    params:
      - { name: dst, positional: true, type: string, required: true }
      - { name: src, positional: true, type: string, required: true }
`);
  const argv = buildArgv(spec, { src: "a.txt", dst: "b.txt" });
  assert.deepEqual(argv, ["b.txt", "a.txt"]);
});

test("buildArgv: default values apply when omitted", () => {
  const spec = specOf(`
tools:
  - name: t
    description: x
    command: ls
    params:
      - { name: format, flag: "--format", type: string, default: json }
`);
  assert.deepEqual(buildArgv(spec, {}), ["--format", "json"]);
});

test("buildArgv: global placement renders before spec.args", () => {
  const spec = specOf(`
tools:
  - name: t
    description: x
    command: git
    args: ["log", "--oneline"]
    params:
      - { name: repoPath, flag: "-C", placement: global, type: string, required: true }
      - { name: count, flag: "-n", type: string }
`);
  const argv = buildArgv(spec, { repoPath: "/tmp/r", count: "5" });
  assert.deepEqual(argv, ["-C", "/tmp/r", "log", "--oneline", "-n", "5"]);
});

test("runTool: captures stdout, exit code, and ok=true on success", async () => {
  const spec = specOf(`
tools:
  - name: t
    description: x
    command: ${NODE}
    args: ["-e"]
    params:
      - { name: script, positional: true, type: string, required: true }
`);
  const res = await runTool(spec, { script: "process.stdout.write('hello from node')" });
  assert.equal(res.ok, true);
  assert.equal(res.exitCode, 0);
  assert.equal(res.stdout, "hello from node");
});

test("runTool: non-zero exit is a failure result, not a throw", async () => {
  const spec = specOf(`
tools:
  - name: t
    description: x
    command: ${NODE}
    args: ["-e"]
    params:
      - { name: script, positional: true, type: string, required: true }
`);
  const res = await runTool(spec, { script: "process.stderr.write('boom'); process.exit(3)" });
  assert.equal(res.ok, false);
  assert.equal(res.exitCode, 3);
  assert.equal(res.stderr, "boom");
});

test("runTool: missing binary reports spawn error gracefully", async () => {
  const spec = specOf(`
tools:
  - name: t
    description: x
    command: definitely-not-a-real-binary-xyz
`);
  const res = await runTool(spec, {});
  assert.equal(res.ok, false);
  assert.match(res.stderr, /failed to run/);
});

test("runTool: timeout kills the process and reports it", async () => {
  const spec = specOf(`
tools:
  - name: t
    description: x
    command: ${NODE}
    args: ["-e"]
    timeoutMs: 300
    params:
      - { name: script, positional: true, type: string, required: true }
`);
  const res = await runTool(spec, { script: "setTimeout(() => {}, 30000)" });
  assert.equal(res.ok, false);
  assert.equal(res.timedOut, true);
  assert.match(res.stderr, /timed out/);
});

test("runTool: env vars from config reach the child process", async () => {
  const spec = specOf(`
tools:
  - name: t
    description: x
    command: ${NODE}
    args: ["-e"]
    params:
      - { name: script, positional: true, type: string, required: true }
`);
  const res = await runTool(
    spec,
    { script: "process.stdout.write(process.env.CLI2MCP_TEST_VAR || 'missing')" },
    { env: { CLI2MCP_TEST_VAR: "it-reached-the-child" } },
  );
  assert.equal(res.ok, true);
  assert.equal(res.stdout, "it-reached-the-child");
});

test("runTool: output larger than cap is truncated with a marker", async () => {
  const spec = specOf(`
tools:
  - name: t
    description: x
    command: ${NODE}
    args: ["-e"]
    params:
      - { name: script, positional: true, type: string, required: true }
`);
  const res = await runTool(spec, { script: "process.stdout.write('x'.repeat(400000))" });
  assert.ok(res.stdout.includes("[config2mcp] output truncated"));
});

test("runTool: dryRun returns argv without executing", async () => {
  const spec = specOf(`
tools:
  - name: t
    description: x
    command: echo
    params:
      - { name: msg, positional: true, type: string, required: true }
`);
  const res = await runTool(spec, { msg: "should-not-appear" }, { dryRun: true });
  assert.equal(res.dryRun, true);
  assert.equal(res.ok, true);
  assert.equal(res.stdout, "");
  assert.deepEqual(res.argv, ["should-not-appear"]);
});

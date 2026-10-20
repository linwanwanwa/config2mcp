import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig, ConfigError } from "../src/config.js";

const minimal = `
tools:
  - name: echo
    description: Echo a message
    command: echo
    params:
      - name: message
        type: string
        required: true
`;

test("parses a minimal valid config", () => {
  const cfg = parseConfig(minimal);
  assert.equal(cfg.tools.length, 1);
  assert.equal(cfg.tools[0].name, "echo");
  assert.deepEqual(cfg.tools[0].args, []);
  assert.equal(cfg.tools[0].timeoutMs, 30_000);
});

test("applies defaults (timeout, jsonOutput, required)", () => {
  const cfg = parseConfig(minimal);
  assert.equal(cfg.tools[0].jsonOutput, false);
  assert.equal(cfg.tools[0].includeStderr, false);
  assert.equal(cfg.tools[0].params[0].required, true);
});

test("rejects non-snake_case tool names", () => {
  const bad = minimal.replace("name: echo", "name: Echo Tool");
  assert.throws(() => parseConfig(bad), ConfigError);
});

test("rejects duplicate tool names", () => {
  const dup = `
tools:
  - { name: a, description: x, command: ls }
  - { name: a, description: x, command: ls }
`;
  assert.throws(() => parseConfig(dup), ConfigError);
});

test("rejects boolean param without flag or trueFlag", () => {
  const bad = `
tools:
  - name: t
    description: x
    command: ls
    params:
      - { name: verbose, type: boolean }
`;
  assert.throws(() => parseConfig(bad), ConfigError);
});

test("rejects positional boolean param", () => {
  const bad = `
tools:
  - name: t
    description: x
    command: ls
    params:
      - { name: file, type: boolean, positional: true, trueFlag: "-v" }
`;
  assert.throws(() => parseConfig(bad), ConfigError);
});

test("rejects invalid env var names", () => {
  const bad = `
env:
  "bad-name": "1"
tools:
  - { name: t, description: x, command: ls }
`;
  assert.throws(() => parseConfig(bad), ConfigError);
});

test("rejects malformed YAML", () => {
  assert.throws(() => parseConfig("tools: [unclosed"), ConfigError);
});

test("accepts JSON config too", () => {
  const json = JSON.stringify({
    tools: [{ name: "t", description: "x", command: "ls" }],
  });
  const cfg = parseConfig(json);
  assert.equal(cfg.tools[0].command, "ls");
});

test("enum values are preserved for string params", () => {
  const cfg = parseConfig(`
tools:
  - name: t
    description: x
    command: ls
    params:
      - name: format
        type: string
        enum: [json, table]
`);
  assert.deepEqual(cfg.tools[0].params[0].enum, ["json", "table"]);
});

test("empty tools array is valid (auto-discovery server mode)", () => {
  const cfg = parseConfig("tools: []");
  assert.deepEqual(cfg.tools, []);
});

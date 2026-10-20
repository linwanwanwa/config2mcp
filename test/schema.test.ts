import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/config.js";
import { buildInputSchema } from "../src/schema.js";

test("buildInputSchema: required/optional/types/enum/default all present", () => {
  const cfg = parseConfig(`
tools:
  - name: convert
    description: Convert an image
    command: ffmpeg
    params:
      - { name: input, positional: true, type: string, required: true }
      - { name: format, flag: "--to", type: string, enum: [png, webp], default: png }
      - { name: verbose, type: boolean, trueFlag: "-v" }
`);
  const schema = buildInputSchema(cfg.tools[0]);
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, ["input"]);
  assert.equal(schema.properties.input.type, "string");
  assert.equal(schema.properties.format.enum?.[0], "png");
  assert.equal(schema.properties.format.default, "png");
  assert.equal(schema.properties.verbose.type, "boolean");
});

test("buildInputSchema: descriptions fall back sensibly", () => {
  const cfg = parseConfig(`
tools:
  - name: t
    description: x
    command: ls
    params:
      - { name: path, positional: true, type: string, required: true }
`);
  const schema = buildInputSchema(cfg.tools[0]);
  assert.ok(schema.properties.path.description!.length > 0);
});

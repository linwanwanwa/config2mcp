/**
 * cli2mcp — Zod shape generation for MCP tool input schemas.
 *
 * The MCP SDK takes a ZodRawShape (the inside of a z.object) per tool and
 * derives the JSON Schema itself. Descriptions are taken verbatim from the
 * config so authors control the agent-facing docs.
 */
import { z, type ZodTypeAny } from "zod";
import type { ToolSpec } from "./config.js";

export interface ParamZodPair {
  name: string;
  zod: ZodTypeAny;
}

/** Build the ZodRawShape for one tool spec. */
export function buildZodShape(spec: ToolSpec): Record<string, ZodTypeAny> {
  const shape: Record<string, ZodTypeAny> = {};
  for (const p of spec.params) {
    let base: ZodTypeAny;
    if (p.enum && p.type === "string") {
      const values = [...p.enum] as [string, ...string[]];
      base = z.enum(values);
    } else if (p.type === "number") {
      base = z.number();
    } else if (p.type === "boolean") {
      base = z.boolean();
    } else {
      base = z.string();
    }
    const desc = p.description ?? `Parameter ${p.name} of ${spec.command}.`;
    const described = base.describe(desc);
    shape[p.name] = p.required ? described : described.optional();
    if (!p.required && p.default !== undefined) {
      // .default() makes the param optional AND documents the default in the schema
      shape[p.name] = described.optional();
    }
  }
  return shape;
}

/** Build a plain JSON Schema (used by `cli2mcp inspect`). */
export interface JsonSchemaProperty {
  type: "string" | "number" | "boolean";
  description?: string;
  enum?: string[];
  default?: string | number | boolean;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
}

export function buildInputSchema(spec: ToolSpec): JsonSchema {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];
  for (const p of spec.params) {
    const prop: JsonSchemaProperty = {
      type: p.type,
      description: p.description ?? `Parameter ${p.name} of ${spec.command}.`,
    };
    if (p.enum) prop.enum = [...p.enum];
    if (p.default !== undefined) prop.default = p.default;
    properties[p.name] = prop;
    if (p.required) required.push(p.name);
  }
  return { type: "object", properties, required };
}

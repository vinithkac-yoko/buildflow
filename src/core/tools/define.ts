import type { z } from "zod";
import { assertCan } from "../auth/permissions";
import type { Ctx } from "../types";

/**
 * A read-only capability shaped so a Phase 2 assistant can call it as an agent tool: a name, a one-line
 * description, a zod input schema and a zod output schema. `run` checks permission, calls the real core
 * read function and validates the result against `output` before returning it.
 */
export interface ToolDef<I extends z.ZodTypeAny, O extends z.ZodTypeAny> {
  name: string;
  description: string;
  input: I;
  output: O;
  run: (ctx: Ctx, input?: unknown) => Promise<z.infer<O>>;
}

export function defineTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(spec: {
  name: string;
  description: string;
  input: I;
  output: O;
  handler: (ctx: Ctx, input: z.infer<I>) => Promise<z.input<O>>;
}): ToolDef<I, O> {
  return {
    name: spec.name,
    description: spec.description,
    input: spec.input,
    output: spec.output,
    async run(ctx, raw = {}) {
      assertCan(ctx, "read", "ask");
      const input = spec.input.parse(raw) as z.infer<I>;
      return spec.output.parse(await spec.handler(ctx, input));
    },
  };
}

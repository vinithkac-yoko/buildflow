import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  UPLOAD_DIR: z.string().default("./.uploads"),
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
  APP_URL: z.string().default("http://localhost:3000"),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export const isDemoMode = () => process.env.DEMO_MODE === "true";

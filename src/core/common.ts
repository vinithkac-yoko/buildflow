import { Prisma } from "@prisma/client";
import { ZodError, z } from "zod";
import { db } from "@/lib/db";
import { AppError, conflict, failure, validation, type ActionResult } from "./errors";

/** Next human-readable code such as PRJ-0007. Runs inside the creating transaction so numbers never repeat. */
export async function nextCode(
  tx: Prisma.TransactionClient,
  prefix: string,
  opts: { key?: string; pad?: number } = {},
): Promise<string> {
  const key = opts.key ?? prefix;
  const row = await tx.codeSequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${String(row.value).padStart(opts.pad ?? 4, "0")}`;
}

/**
 * While DEMO_MODE is on, everything users create is flagged as demo data too, so "Reset demo data"
 * returns the app to a clean state (nothing left pointing at the demo masters it is about to delete).
 */
export const demoFlag = () => ({ isDemo: process.env.DEMO_MODE === "true" });

/** Make sure a sequence is at least `value` (used by the seed after it assigns explicit codes). */
export async function ensureSequenceAtLeast(client: Prisma.TransactionClient | typeof db, key: string, value: number) {
  const row = await client.codeSequence.findUnique({ where: { key } });
  if (!row) await client.codeSequence.create({ data: { key, value } });
  else if (row.value < value) await client.codeSequence.update({ where: { key }, data: { value } });
}

/** Translate database errors into messages a site user can act on. */
export function friendlyDbError(e: unknown, what = "record"): AppError | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return conflict(`A ${what} with the same code or name already exists. Use a different one or edit the existing ${what}.`);
    if (e.code === "P2003") return validation(`Pick a valid option from the list — one of the selected items no longer exists.`);
    if (e.code === "P2025") return validation(`That ${what} was not found. Refresh and try again.`);
  }
  return null;
}

/** Wrap a service call for server actions: never throws, always returns an ActionResult. */
export async function toResult<T>(run: () => Promise<T>, what = "record"): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (e) {
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const k = issue.path.join(".") || "_";
        if (!fieldErrors[k]) fieldErrors[k] = issue.message;
      }
      return failure(e.issues[0]?.message ?? "Check the highlighted fields.", fieldErrors);
    }
    if (e instanceof AppError) return failure(e.message);
    const friendly = friendlyDbError(e, what);
    if (friendly) return failure(friendly.message);
    console.error(e);
    return failure("We couldn't save that. Check your entries and try again, or contact your Admin if it keeps happening.");
  }
}

// ── zod helpers for form input (everything arrives as strings) ──

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const toNumber = (v: unknown) => {
  const b = blank(v);
  return b === undefined || b === null ? undefined : Number(b);
};

export const zText = (label: string, max = 200) =>
  z.string({ required_error: `Enter ${label}.` }).trim().min(1, `Enter ${label}.`).max(max, `${label} is too long.`);
export const zOptText = (max = 500) => z.preprocess(blank, z.string().trim().max(max).optional());
export const zId = (label: string) => z.string({ required_error: `Pick ${label}.` }).min(1, `Pick ${label}.`);
export const zOptId = () => z.preprocess(blank, z.string().optional());

interface NumOpts { min?: number; max?: number; gt?: number; int?: boolean }
const numBase = (label: string, o: NumOpts) =>
  z
    .number({ required_error: `Enter ${label}.`, invalid_type_error: `${label} must be a number.` })
    .refine((n) => o.min === undefined || n >= o.min, `${label} can't be below ${o.min}.`)
    .refine((n) => o.max === undefined || n <= o.max, `${label} can't be above ${o.max}.`)
    .refine((n) => o.gt === undefined || n > o.gt, `${label} must be more than ${o.gt}.`)
    .refine((n) => !o.int || Number.isInteger(n), `${label} must be a whole number.`);

export const zNum = (label: string, o: NumOpts = {}) => z.preprocess(toNumber, numBase(label, o));
export const zOptNum = (label: string, o: NumOpts = {}) => z.preprocess(toNumber, numBase(label, o).optional());
export const zInt = (label: string, o: NumOpts = {}) => z.preprocess(toNumber, numBase(label, { ...o, int: true }));

/** yyyy-mm-dd → Date at UTC midnight. */
export const zDate = (label: string) =>
  z
    .preprocess(blank, z.string({ required_error: `Pick ${label}.` }).regex(/^\d{4}-\d{2}-\d{2}$/, `Pick ${label}.`))
    .transform((s) => new Date(`${s}T00:00:00.000Z`));

export const zBool = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());

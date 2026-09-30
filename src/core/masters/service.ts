import { db } from "@/lib/db";
import type { FieldDef, Option, RefKind, Values } from "@/lib/forms";
import { writeAudit } from "../audit";
import { COMPANY_SCOPE, assertCan, canSeeField, redact } from "../auth/permissions";
import { nextCode } from "../common";
import { notFound } from "../errors";
import type { Ctx } from "../types";
import { getMaster, type MasterDef, type Rec } from "./registry";

/** A master row prepared for display and editing. `cells` are human labels; `values` feed the edit form. */
export interface MasterRow {
  id: string;
  code?: string;
  isDemo: boolean;
  cells: Record<string, string>;
  values: Values;
}

export function visibleFields(ctx: Ctx, def: MasterDef): FieldDef[] {
  return def.fields.filter((f) => !f.sensitive || canSeeField(ctx, f.sensitive, COMPANY_SCOPE));
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function toRow(def: MasterDef, fields: FieldDef[], row: Rec): MasterRow {
  const cells: Record<string, string> = {};
  const values: Values = {};
  for (const f of fields) {
    const raw = row[f.name];
    values[f.name] = str(raw);
    if (f.type === "ref" && f.rel) {
      const related = row[f.rel.relation] as Rec | null | undefined;
      cells[f.name] = related ? str(related[f.rel.labelKey]) : "";
    } else if (f.type === "select") {
      cells[f.name] = f.options?.find((o) => o.value === str(raw))?.label ?? str(raw);
    } else if (f.name === "itemsText") {
      cells[f.name] = `${str(raw).split("\n").filter(Boolean).length} checkpoints`;
    } else {
      cells[f.name] = str(raw);
    }
  }
  return {
    id: String(row.id),
    code: typeof row.code === "string" ? row.code : undefined,
    isDemo: row.isDemo === true,
    cells,
    values,
  };
}

function need(kind: string): MasterDef {
  const def = getMaster(kind);
  if (!def) throw notFound("That list");
  return def;
}

/** Plain JSON copy of a row for the audit trail (Decimals become strings). */
const snap = (row: Rec) => JSON.parse(JSON.stringify(row)) as Record<string, string>;

export async function listMaster(ctx: Ctx, kind: string, q?: string) {
  const def = need(kind);
  assertCan(ctx, "read", def.resource);
  const rows = (await def.findMany()).map((r) => redact(ctx, r, COMPANY_SCOPE));
  const fields = visibleFields(ctx, def);
  let out = rows.map((r) => toRow(def, fields, r));
  const needle = q?.trim().toLowerCase();
  if (needle) {
    out = out.filter((r) =>
      [r.code ?? "", ...Object.values(r.cells)].some((c) => c.toLowerCase().includes(needle)),
    );
  }
  return { def, fields, rows: out };
}

export async function getMasterRow(ctx: Ctx, kind: string, id: string) {
  const def = need(kind);
  assertCan(ctx, "read", def.resource);
  const row = await def.findOne(id);
  if (!row) throw notFound("That record");
  return toRow(def, visibleFields(ctx, def), redact(ctx, row, COMPANY_SCOPE));
}

/** Remove fields the caller may not see or set, so a hidden cost field is never overwritten by a blank form. */
function stripHidden(ctx: Ctx, def: MasterDef, raw: Values): Values {
  const out: Values = { ...raw };
  for (const f of def.fields) {
    if (f.sensitive && !canSeeField(ctx, f.sensitive, COMPANY_SCOPE)) delete out[f.name];
  }
  return out;
}

export async function createMaster(ctx: Ctx, kind: string, raw: Values) {
  const def = need(kind);
  assertCan(ctx, "create", def.resource);
  return db.$transaction(async (tx) => {
    const code = def.codePrefix ? await nextCode(tx, def.codePrefix) : undefined;
    const row = await def.create(tx, ctx, stripHidden(ctx, def, raw), code);
    await writeAudit(tx, ctx, { action: "CREATE", entity: def.entity, entityId: String(row.id), after: snap(row) });
    return String(row.id);
  });
}

export async function updateMaster(ctx: Ctx, kind: string, id: string, raw: Values) {
  const def = need(kind);
  assertCan(ctx, "update", def.resource);
  return db.$transaction(async (tx) => {
    const before = await def.findOne(id);
    if (!before) throw notFound("That record");
    const row = await def.update(tx, ctx, id, stripHidden(ctx, def, raw));
    await writeAudit(tx, ctx, {
      action: "UPDATE", entity: def.entity, entityId: id, before: snap(before), after: snap(row),
    });
    return id;
  });
}

/** Options for searchable selects bound to an ID. Labels only; no sensitive data. */
export async function refOptions(kind: RefKind): Promise<Option[]> {
  switch (kind) {
    case "uom":
      return (await db.uom.findMany({ orderBy: { code: "asc" } })).map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` }));
    case "materialCategory":
      return (await db.materialCategory.findMany({ orderBy: { name: "asc" } })).map((c) => ({ value: c.id, label: c.name }));
    case "trade":
      return (await db.trade.findMany({ orderBy: { name: "asc" } })).map((t) => ({ value: t.id, label: t.name }));
    case "costCode":
      return (await db.costCode.findMany({ orderBy: { code: "asc" } })).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }));
  }
}

export async function refOptionsFor(fields: FieldDef[]): Promise<Record<string, Option[]>> {
  const kinds = [...new Set(fields.filter((f) => f.ref).map((f) => f.ref!))];
  const entries = await Promise.all(kinds.map(async (k) => [k, await refOptions(k)] as const));
  return Object.fromEntries(entries);
}

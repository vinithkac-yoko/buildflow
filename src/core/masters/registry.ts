import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import type { FieldDef } from "@/lib/forms";
import type { Resource } from "../auth/permissions";
import { zId, zInt, zOptId, zOptNum, zOptText, zText, demoFlag } from "../common";
import type { Ctx } from "../types";

type Tx = Prisma.TransactionClient;
export type Rec = Record<string, unknown>;

/**
 * A "master" is company-wide reference data (materials, vendors, trades …).
 * One definition drives the list screen, the form, validation, permissions and the audit trail.
 */
export interface MasterDef {
  kind: string; // URL slug
  label: string;
  plural: string;
  entity: string; // audit entity name
  resource: Resource;
  codePrefix?: string; // auto-generated code (MAT-0001) when set
  fields: FieldDef[];
  searchKeys: string[];
  findMany(): Promise<Rec[]>;
  findOne(id: string): Promise<Rec | null>;
  create(tx: Tx, ctx: Ctx, raw: unknown, code: string | undefined): Promise<Rec>;
  update(tx: Tx, ctx: Ctx, id: string, raw: unknown): Promise<Rec>;
}

function define<S extends z.ZodTypeAny>(cfg: {
  kind: string; label: string; plural?: string; entity: string; resource: Resource; codePrefix?: string;
  fields: FieldDef[]; schema: S; searchKeys: string[];
  findMany: () => Promise<Rec[]>;
  findOne: (id: string) => Promise<Rec | null>;
  create: (tx: Tx, input: z.infer<S>, code: string | undefined, ctx: Ctx) => Promise<Rec>;
  update: (tx: Tx, id: string, input: z.infer<S>) => Promise<Rec>;
}): MasterDef {
  return {
    kind: cfg.kind, label: cfg.label, plural: cfg.plural ?? `${cfg.label}s`, entity: cfg.entity,
    resource: cfg.resource, codePrefix: cfg.codePrefix, fields: cfg.fields, searchKeys: cfg.searchKeys,
    findMany: cfg.findMany, findOne: cfg.findOne,
    create: (tx, ctx, raw, code) => cfg.create(tx, cfg.schema.parse(raw), code, ctx),
    update: (tx, _ctx, id, raw) => cfg.update(tx, id, cfg.schema.parse(raw)),
  };
}

const ACTIVE_OPTS = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];
const status: FieldDef = { name: "status", label: "Status", type: "select", options: ACTIVE_OPTS, required: true, list: true, default: "ACTIVE" };
const zStatus = z.enum(["ACTIVE", "INACTIVE"], { errorMap: () => ({ message: "Pick a status." }) });

export const VENDOR_CATEGORIES = [
  "Cement & Steel", "Aggregates & Sand", "Blocks & Bricks", "Ready-mix concrete", "Plumbing & Sanitary",
  "Electrical", "Flooring & Tiles", "Paint & Finishes", "Timber & Doors", "Hardware & Consumables", "Other",
];
export const EQUIPMENT_CATEGORIES = ["Concrete equipment", "Earthmoving", "Bar bending", "Scaffolding & shuttering", "Lifting", "Tools", "Other"];
const opt = (list: string[]) => list.map((v) => ({ value: v, label: v }));

const rating = (name: string, label: string): FieldDef => ({ name, label, type: "integer", hint: "1 (poor) to 5 (excellent)" });
const zRating = (label: string) => zOptNum(label, { min: 1, max: 5 });

const dec = (n: number | undefined) => n ?? 0;

const DEFS: MasterDef[] = [
  define({
    kind: "client", label: "Client", entity: "Client", resource: "client", codePrefix: "CLI",
    fields: [
      { name: "name", label: "Client name", type: "text", required: true, list: true },
      { name: "contact", label: "Contact", type: "text", list: true, hint: "Phone or email" },
      { name: "paymentTerms", label: "Payment terms", type: "text" },
      status,
    ],
    schema: z.object({ name: zText("the client name"), contact: zOptText(), paymentTerms: zOptText(), status: zStatus }),
    searchKeys: ["name", "code", "contact"],
    findMany: () => db.client.findMany({ orderBy: { code: "asc" } }),
    findOne: (id) => db.client.findUnique({ where: { id } }),
    create: (tx, i, code, ctx) => tx.client.create({ data: { ...i, code: code!, createdById: ctx.userId, ...demoFlag() } }),
    update: (tx, id, i) => tx.client.update({ where: { id }, data: i }),
  }),

  define({
    kind: "material", label: "Material", entity: "Material", resource: "material", codePrefix: "MAT",
    fields: [
      { name: "name", label: "Material name", type: "text", required: true, list: true },
      { name: "categoryId", label: "Category", type: "ref", ref: "materialCategory", rel: { relation: "category", labelKey: "name" }, required: true, list: true },
      { name: "uomId", label: "Unit", type: "ref", ref: "uom", rel: { relation: "uom", labelKey: "code" }, required: true, list: true },
      { name: "standardUnitCost", label: "Standard unit cost", type: "number", unit: "₹", sensitive: "materialCost", list: true },
      { name: "reorderThreshold", label: "Reorder threshold", type: "number", hint: "Low-stock alert below this quantity", list: true },
      status,
    ],
    schema: z.object({
      name: zText("the material name"), categoryId: zId("a category"), uomId: zId("a unit"),
      standardUnitCost: zOptNum("Standard unit cost", { min: 0 }), reorderThreshold: zOptNum("Reorder threshold", { min: 0 }),
      status: zStatus,
    }),
    searchKeys: ["name", "code"],
    findMany: () => db.material.findMany({ include: { category: true, uom: true }, orderBy: { code: "asc" } }),
    findOne: (id) => db.material.findUnique({ where: { id }, include: { category: true, uom: true } }),
    create: (tx, i, code, ctx) =>
      tx.material.create({
        data: { ...i, standardUnitCost: dec(i.standardUnitCost), reorderThreshold: dec(i.reorderThreshold), code: code!, createdById: ctx.userId, ...demoFlag() },
        include: { category: true, uom: true },
      }),
    update: (tx, id, i) => tx.material.update({ where: { id }, data: i, include: { category: true, uom: true } }),
  }),

  define({
    kind: "material-category", label: "Material category", plural: "Material categories", entity: "MaterialCategory", resource: "material",
    fields: [{ name: "name", label: "Category name", type: "text", required: true, list: true }],
    schema: z.object({ name: zText("the category name") }),
    searchKeys: ["name"],
    findMany: () => db.materialCategory.findMany({ orderBy: { name: "asc" } }),
    findOne: (id) => db.materialCategory.findUnique({ where: { id } }),
    create: (tx, i, _c, ctx) => tx.materialCategory.create({ data: { ...i, createdById: ctx.userId, ...demoFlag() } }),
    update: (tx, id, i) => tx.materialCategory.update({ where: { id }, data: i }),
  }),

  define({
    kind: "uom", label: "Unit of measure", plural: "Units of measure", entity: "Uom", resource: "master",
    fields: [
      { name: "code", label: "Code", type: "text", required: true, list: true, hint: "Short, e.g. cum, sqm, rmt, kg, nos" },
      { name: "name", label: "Name", type: "text", required: true, list: true },
    ],
    schema: z.object({ code: zText("the unit code", 12), name: zText("the unit name") }),
    searchKeys: ["code", "name"],
    findMany: () => db.uom.findMany({ orderBy: { code: "asc" } }),
    findOne: (id) => db.uom.findUnique({ where: { id } }),
    create: (tx, i, _c, ctx) => tx.uom.create({ data: { ...i, createdById: ctx.userId, ...demoFlag() } }),
    update: (tx, id, i) => tx.uom.update({ where: { id }, data: i }),
  }),

  define({
    kind: "cost-code", label: "Cost code", entity: "CostCode", resource: "master",
    fields: [
      { name: "code", label: "Code", type: "text", required: true, list: true, hint: "e.g. CC-200" },
      { name: "name", label: "Name", type: "text", required: true, list: true },
    ],
    schema: z.object({ code: zText("the cost code", 20), name: zText("the cost code name") }),
    searchKeys: ["code", "name"],
    findMany: () => db.costCode.findMany({ orderBy: { code: "asc" } }),
    findOne: (id) => db.costCode.findUnique({ where: { id } }),
    create: (tx, i, _c, ctx) => tx.costCode.create({ data: { ...i, createdById: ctx.userId, ...demoFlag() } }),
    update: (tx, id, i) => tx.costCode.update({ where: { id }, data: i }),
  }),

  define({
    kind: "trade", label: "Trade", entity: "Trade", resource: "master",
    fields: [{ name: "name", label: "Trade", type: "text", required: true, list: true }],
    schema: z.object({ name: zText("the trade") }),
    searchKeys: ["name"],
    findMany: () => db.trade.findMany({ orderBy: { name: "asc" } }),
    findOne: (id) => db.trade.findUnique({ where: { id } }),
    create: (tx, i, _c, ctx) => tx.trade.create({ data: { ...i, createdById: ctx.userId, ...demoFlag() } }),
    update: (tx, id, i) => tx.trade.update({ where: { id }, data: i }),
  }),

  define({
    kind: "vendor", label: "Vendor", entity: "Vendor", resource: "vendor", codePrefix: "VEN",
    fields: [
      { name: "name", label: "Vendor name", type: "text", required: true, list: true },
      { name: "category", label: "Category", type: "select", options: opt(VENDOR_CATEGORIES), required: true, list: true },
      { name: "contact", label: "Contact", type: "text", list: true, hint: "Phone or email" },
      rating("qualityRating", "Quality rating"), rating("deliveryRating", "Delivery rating"),
      rating("priceRating", "Price rating"), rating("serviceRating", "Service rating"),
      status,
    ],
    schema: z.object({
      name: zText("the vendor name"), category: z.enum(VENDOR_CATEGORIES as [string, ...string[]], { errorMap: () => ({ message: "Pick a category." }) }),
      contact: zOptText(), qualityRating: zRating("Quality rating"), deliveryRating: zRating("Delivery rating"),
      priceRating: zRating("Price rating"), serviceRating: zRating("Service rating"), status: zStatus,
    }),
    searchKeys: ["name", "code", "category", "contact"],
    findMany: () => db.vendor.findMany({ orderBy: { code: "asc" } }),
    findOne: (id) => db.vendor.findUnique({ where: { id } }),
    create: (tx, i, code, ctx) => tx.vendor.create({ data: { ...i, code: code!, createdById: ctx.userId, ...demoFlag() } }),
    update: (tx, id, i) => tx.vendor.update({ where: { id }, data: i }),
  }),

  define({
    kind: "subcontractor", label: "Subcontractor", entity: "Subcontractor", resource: "subcontractor", codePrefix: "SUB",
    fields: [
      { name: "name", label: "Subcontractor name", type: "text", required: true, list: true },
      { name: "tradeId", label: "Trade", type: "ref", ref: "trade", rel: { relation: "trade", labelKey: "name" }, required: true, list: true },
      { name: "contact", label: "Contact", type: "text", list: true },
      status,
    ],
    schema: z.object({ name: zText("the subcontractor name"), tradeId: zId("a trade"), contact: zOptText(), status: zStatus }),
    searchKeys: ["name", "code", "contact"],
    findMany: () => db.subcontractor.findMany({ include: { trade: true }, orderBy: { code: "asc" } }),
    findOne: (id) => db.subcontractor.findUnique({ where: { id }, include: { trade: true } }),
    create: (tx, i, code, ctx) => tx.subcontractor.create({ data: { ...i, code: code!, createdById: ctx.userId, ...demoFlag() }, include: { trade: true } }),
    update: (tx, id, i) => tx.subcontractor.update({ where: { id }, data: i, include: { trade: true } }),
  }),

  define({
    kind: "equipment", label: "Equipment", plural: "Equipment", entity: "Equipment", resource: "equipment", codePrefix: "EQP",
    fields: [
      { name: "name", label: "Equipment name", type: "text", required: true, list: true },
      { name: "category", label: "Category", type: "select", options: opt(EQUIPMENT_CATEGORIES), required: true, list: true },
      { name: "ownership", label: "Ownership", type: "select", required: true, list: true, options: [
        { value: "COMPANY", label: "Company" }, { value: "RENTAL", label: "Rental" }, { value: "SUBCONTRACTOR", label: "Subcontractor" },
      ] },
      { name: "status", label: "Status", type: "select", required: true, list: true, default: "AVAILABLE", options: [
        { value: "AVAILABLE", label: "Available" }, { value: "IN_USE", label: "In use" },
        { value: "MAINTENANCE", label: "Maintenance" }, { value: "BREAKDOWN", label: "Breakdown" },
      ] },
    ],
    schema: z.object({
      name: zText("the equipment name"), category: z.enum(EQUIPMENT_CATEGORIES as [string, ...string[]], { errorMap: () => ({ message: "Pick a category." }) }),
      ownership: z.enum(["COMPANY", "RENTAL", "SUBCONTRACTOR"], { errorMap: () => ({ message: "Pick the ownership." }) }),
      status: z.enum(["AVAILABLE", "IN_USE", "MAINTENANCE", "BREAKDOWN"], { errorMap: () => ({ message: "Pick a status." }) }),
    }),
    searchKeys: ["name", "code", "category"],
    findMany: () => db.equipment.findMany({ orderBy: { code: "asc" } }),
    findOne: (id) => db.equipment.findUnique({ where: { id } }),
    create: (tx, i, code, ctx) => tx.equipment.create({ data: { ...i, code: code!, createdById: ctx.userId, ...demoFlag() } }),
    update: (tx, id, i) => tx.equipment.update({ where: { id }, data: i }),
  }),

  define({
    kind: "employee", label: "Employee", entity: "Employee", resource: "employee", codePrefix: "EMP",
    fields: [
      { name: "name", label: "Employee name", type: "text", required: true, list: true },
      { name: "tradeId", label: "Trade", type: "ref", ref: "trade", rel: { relation: "trade", labelKey: "name" }, list: true },
      { name: "phone", label: "Phone", type: "text", list: true },
      { name: "dailyWage", label: "Daily wage", type: "number", unit: "₹", sensitive: "wage", list: true },
      status,
    ],
    schema: z.object({ name: zText("the employee name"), tradeId: zOptId(), phone: zOptText(), dailyWage: zOptNum("Daily wage", { min: 0 }), status: zStatus }),
    searchKeys: ["name", "code", "phone"],
    findMany: () => db.employee.findMany({ include: { trade: true }, orderBy: { code: "asc" } }),
    findOne: (id) => db.employee.findUnique({ where: { id }, include: { trade: true } }),
    create: (tx, i, code, ctx) => tx.employee.create({ data: { ...i, code: code!, createdById: ctx.userId, ...demoFlag() }, include: { trade: true } }),
    update: (tx, id, i) => tx.employee.update({ where: { id }, data: i, include: { trade: true } }),
  }),

  define({
    kind: "contract-labour", label: "Contract labour gang", plural: "Contract labour gangs", entity: "ContractLabourGang", resource: "employee", codePrefix: "GNG",
    fields: [
      { name: "name", label: "Gang / mestri name", type: "text", required: true, list: true },
      { name: "tradeId", label: "Trade", type: "ref", ref: "trade", rel: { relation: "trade", labelKey: "name" }, required: true, list: true },
      { name: "headcount", label: "Usual headcount", type: "integer", list: true },
      { name: "contact", label: "Contact", type: "text" },
      { name: "ratePerManday", label: "Rate per manday", type: "number", unit: "₹", sensitive: "wage", list: true },
      status,
    ],
    schema: z.object({
      name: zText("the gang name"), tradeId: zId("a trade"), headcount: zInt("Headcount", { min: 0, max: 500 }),
      contact: zOptText(), ratePerManday: zOptNum("Rate per manday", { min: 0 }), status: zStatus,
    }),
    searchKeys: ["name", "code"],
    findMany: () => db.contractLabourGang.findMany({ include: { trade: true }, orderBy: { code: "asc" } }),
    findOne: (id) => db.contractLabourGang.findUnique({ where: { id }, include: { trade: true } }),
    create: (tx, i, code, ctx) => tx.contractLabourGang.create({ data: { ...i, code: code!, createdById: ctx.userId, ...demoFlag() }, include: { trade: true } }),
    update: (tx, id, i) => tx.contractLabourGang.update({ where: { id }, data: i, include: { trade: true } }),
  }),

  define({
    kind: "checklist", label: "Quality checklist", entity: "QualityChecklist", resource: "checklist", codePrefix: "CHK",
    fields: [
      { name: "name", label: "Checklist name", type: "text", required: true, list: true },
      { name: "description", label: "Description", type: "text" },
      { name: "itemsText", label: "Checkpoints", type: "textarea", required: true, hint: "One checkpoint per line", list: true },
      status,
    ],
    schema: z.object({
      name: zText("the checklist name"), description: zOptText(), status: zStatus,
      itemsText: z.string().transform((s) => s.split("\n").map((l) => l.trim()).filter(Boolean))
        .refine((l) => l.length >= 1, "Enter at least one checkpoint (one per line)."),
    }),
    searchKeys: ["name", "code"],
    findMany: async () => (await db.qualityChecklist.findMany({ include: { items: { orderBy: { seq: "asc" } } }, orderBy: { code: "asc" } })).map(flatChecklist),
    findOne: async (id) => {
      const c = await db.qualityChecklist.findUnique({ where: { id }, include: { items: { orderBy: { seq: "asc" } } } });
      return c ? flatChecklist(c) : null;
    },
    create: async (tx, i, code, ctx) => {
      const { itemsText, ...rest } = i;
      const c = await tx.qualityChecklist.create({
        data: { ...rest, code: code!, createdById: ctx.userId, ...demoFlag(), items: { create: itemsText.map((text, n) => ({ seq: n + 1, text })) } },
        include: { items: { orderBy: { seq: "asc" } } },
      });
      return flatChecklist(c);
    },
    update: async (tx, id, i) => {
      const { itemsText, ...rest } = i;
      await tx.checklistItem.deleteMany({ where: { checklistId: id } });
      const c = await tx.qualityChecklist.update({
        where: { id },
        data: { ...rest, items: { create: itemsText.map((text, n) => ({ seq: n + 1, text })) } },
        include: { items: { orderBy: { seq: "asc" } } },
      });
      return flatChecklist(c);
    },
  }),

  define({
    kind: "sop", label: "SOP", entity: "Sop", resource: "sop", codePrefix: "SOP",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, list: true },
      { name: "body", label: "Steps / notes", type: "textarea" },
      status,
    ],
    schema: z.object({ title: zText("the SOP title"), body: zOptText(5000), status: zStatus }),
    searchKeys: ["title", "code"],
    findMany: () => db.sop.findMany({ orderBy: { code: "asc" } }),
    findOne: (id) => db.sop.findUnique({ where: { id } }),
    create: (tx, i, code, ctx) => tx.sop.create({ data: { ...i, code: code!, createdById: ctx.userId, ...demoFlag() } }),
    update: (tx, id, i) => tx.sop.update({ where: { id }, data: i }),
  }),
];

function flatChecklist(c: { items: { text: string }[] } & Rec): Rec {
  const { items, ...rest } = c;
  return { ...rest, itemsText: items.map((i) => i.text).join("\n") };
}

export const MASTERS: readonly MasterDef[] = DEFS;

export function getMaster(kind: string): MasterDef | undefined {
  return DEFS.find((d) => d.kind === kind);
}

/** Masters listed on the Masters index screen (clients, vendors, employees also have their own routes). */
export const MASTER_GROUPS: { title: string; kinds: string[] }[] = [
  { title: "Units and codes", kinds: ["uom", "cost-code", "trade"] },
  { title: "Materials", kinds: ["material-category", "material"] },
  { title: "People and partners", kinds: ["client", "vendor", "subcontractor", "employee", "contract-labour"] },
  { title: "Equipment, quality and SOPs", kinds: ["equipment", "checklist", "sop"] },
];

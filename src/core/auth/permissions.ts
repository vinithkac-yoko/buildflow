import type { Role } from "@prisma/client";
import { forbidden } from "../errors";
import type { Ctx } from "../types";

/**
 * Single permission matrix for the whole app. Every service calls can()/assertCan().
 * Project scope (assigned vs all) is decided by Ctx, not by this table.
 */

export type Verb = "read" | "create" | "update" | "delete" | "approve" | "submit";

export const RESOURCES = [
  "user", "assignment", "master", "client", "project", "wbs", "activity", "boq",
  "dpr", "labour", "material_request", "purchase_request", "quotation", "purchase_order",
  "receipt", "inventory", "invoice", "payment", "work_order", "sub_bill",
  "inspection", "ncr", "rework_cost", "issue", "delay", "equipment", "document", "photo",
  "employee", "audit", "settings", "dashboard", "ask",
  "vendor", "subcontractor", "material", "checklist", "storage_location", "sop",
] as const;
export type Resource = (typeof RESOURCES)[number];

type Grant = readonly Verb[] | "*";
type PermissionMap = Partial<Record<Resource, Grant>>;

const ALL: Grant = "*";
const R: Grant = ["read"];
const RC: Grant = ["read", "create"];
const RCU: Grant = ["read", "create", "update"];
const RCUD: Grant = ["read", "create", "update", "delete"];

export const PERMISSIONS: Record<Role, PermissionMap> = {
  OWNER: Object.fromEntries(RESOURCES.map((r) => [r, ALL])) as PermissionMap,

  ADMIN: {
    user: ALL, assignment: ALL, master: ALL, audit: R, settings: RCU, dashboard: R,
    client: RCU, project: ["read", "update"], wbs: R, activity: R, boq: R, equipment: RCU, employee: R,
    vendor: RCU, subcontractor: RCU, material: RCU, checklist: RCU, storage_location: RCU, sop: RCU,
  },

  MARKETING: { client: RCU, dashboard: R },

  PROJECT_MANAGER: {
    project: ["read", "update"], wbs: RCUD, activity: RCUD, boq: RCUD,
    dpr: ["read", "update", "approve"], labour: R, material_request: ["read", "update"],
    purchase_request: RCU, quotation: R, purchase_order: R, receipt: R, inventory: R,
    issue: RCUD, delay: RCUD, inspection: R, ncr: R, rework_cost: ["read", "update"], equipment: R,
    document: RC, photo: RCU, assignment: R, dashboard: R, ask: R, master: R, client: R,
    vendor: R, subcontractor: R, material: R, checklist: R, storage_location: RCU, sop: R,
  },

  SITE_ENGINEER: {
    project: R, wbs: R, activity: R, dpr: ["read", "create", "update", "submit"],
    labour: RC, material_request: RC, inventory: R, issue: RC, inspection: RC, ncr: R,
    photo: RC, document: R, dashboard: R, master: R,
    material: R, checklist: R, sop: R, storage_location: R,
  },

  ACCOUNTS: {
    project: R, client: R, purchase_order: R, receipt: R, invoice: RCU, payment: RCU,
    work_order: R, sub_bill: RCU, dashboard: R, master: R, vendor: R, subcontractor: R, material: R,
  },

  PROCUREMENT: {
    project: R, purchase_request: ["read", "update"], quotation: RCU, purchase_order: RCU,
    receipt: RCU, inventory: R, master: R, dashboard: R,
    vendor: RCU, material: RCU, subcontractor: R, storage_location: R, material_request: R, activity: R,
  },

  STORE_KEEPER: {
    project: R, receipt: RC, inventory: RC, material_request: R, purchase_order: R,
    dashboard: R, master: R, material: R, storage_location: RCU,
  },

  QUALITY_ENGINEER: {
    project: R, activity: R, inspection: RCU, ncr: RCU, photo: RC, dashboard: R, master: R,
    checklist: RCU, sop: R, subcontractor: R,
  },

  HR: { employee: RCUD, master: R, dashboard: R },

  CLIENT: { project: R, dpr: R, photo: R, document: R, dashboard: R },
};

/** Roles that see every project regardless of assignment. */
export const ALL_PROJECT_ROLES: readonly Role[] = ["OWNER", "ADMIN", "ACCOUNTS", "PROCUREMENT", "HR"];

function grants(role: Role, resource: Resource, verb: Verb): boolean {
  const g = PERMISSIONS[role][resource];
  if (!g) return false;
  return g === "*" || g.includes(verb);
}

export function inProjectScope(ctx: Ctx, projectId: string): boolean {
  return ctx.allProjects || ctx.projectIds.includes(projectId);
}

/** Can this context perform `verb` on `resource` (and, if given, on that project)? */
export function can(ctx: Ctx, verb: Verb, resource: Resource, projectId?: string): boolean {
  if (!grants(ctx.role, resource, verb)) return false;
  if (projectId !== undefined && !inProjectScope(ctx, projectId)) return false;
  return true;
}

export function assertCan(ctx: Ctx, verb: Verb, resource: Resource, projectId?: string): void {
  if (!can(ctx, verb, resource, projectId)) throw forbidden();
}

/* ───────────────────────── field-level cost visibility ───────────────────────── */

export type SensitiveField =
  | "budget" | "plannedCost" | "labourCost" | "materialCost" | "valuation"
  | "margin" | "poRate" | "wage" | "contractValue" | "clientRate" | "payable";

/** Roles allowed to see each class of sensitive field. PM access is further limited to assigned projects. */
export const FIELD_VISIBILITY: Record<SensitiveField, readonly Role[]> = {
  budget: ["OWNER", "PROJECT_MANAGER", "ACCOUNTS"],
  plannedCost: ["OWNER", "PROJECT_MANAGER", "ACCOUNTS"],
  labourCost: ["OWNER", "PROJECT_MANAGER", "ACCOUNTS"],
  materialCost: ["OWNER", "PROJECT_MANAGER", "ACCOUNTS"],
  valuation: ["OWNER", "PROJECT_MANAGER", "ACCOUNTS"],
  margin: ["OWNER", "PROJECT_MANAGER", "ACCOUNTS"],
  poRate: ["OWNER", "PROJECT_MANAGER", "ACCOUNTS", "PROCUREMENT"],
  wage: ["OWNER", "PROJECT_MANAGER", "ACCOUNTS", "HR"],
  contractValue: ["OWNER", "PROJECT_MANAGER", "ACCOUNTS", "CLIENT"],
  clientRate: ["OWNER", "PROJECT_MANAGER", "ACCOUNTS", "CLIENT"],
  // Vendor invoices, payments and what is still owed. Procurement sees PO rates but not the money side.
  payable: ["OWNER", "PROJECT_MANAGER", "ACCOUNTS"],
};

/** Object key → sensitive field class. Add a key here whenever a new cost column is introduced. */
export const SENSITIVE_KEYS: Readonly<Record<string, SensitiveField>> = {
  internalBudgetRate: "budget",
  budgetAmount: "budget",
  plannedCost: "plannedCost",
  targetCost: "plannedCost",
  labourCost: "labourCost",
  dailyLabourCost: "labourCost",
  reworkLabourCost: "labourCost",
  materialCost: "materialCost",
  reworkMaterialCost: "materialCost",
  standardUnitCost: "materialCost",
  unitCost: "materialCost",
  avgCost: "valuation",
  stockValue: "valuation",
  valuation: "valuation",
  margin: "margin",
  poRate: "poRate",
  wageRate: "wage",
  ratePerManday: "wage",
  dailyWage: "wage",
  contractValue: "contractValue",
  clientRate: "clientRate",
  unitRate: "poRate",
  poSubtotal: "poRate",
  poTax: "poRate",
  poTotal: "poRate",
  lineTotal: "poRate",
  invoiceSubtotal: "payable",
  invoiceTax: "payable",
  invoiceTotal: "payable",
  paidAmount: "payable",
  paymentAmount: "payable",
  outstanding: "payable",
};

/** Pass as the scope for company-level records (materials, employees …) that belong to no single project. */
export const COMPANY_SCOPE = "*";

export function canSeeField(ctx: Ctx, field: SensitiveField, projectId?: string): boolean {
  if (!FIELD_VISIBILITY[field].includes(ctx.role)) return false;
  // A PM's cost visibility is limited to assigned projects (company-level masters are visible to PMs).
  if (ctx.role === "PROJECT_MANAGER") {
    return projectId === COMPANY_SCOPE || (projectId !== undefined && inProjectScope(ctx, projectId));
  }
  return true;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Strip sensitive cost fields the caller may not see, at any depth.
 * Runs in the service layer so the data never reaches a UI or a network response.
 * `projectId` scopes PM visibility; nested objects carrying their own `projectId` override it.
 */
export function redact<T>(ctx: Ctx, entity: T, projectId?: string): T {
  const walk = (value: unknown, scope: string | undefined): unknown => {
    if (Array.isArray(value)) return value.map((v) => walk(v, scope));
    if (!isPlainObject(value)) return value;
    const ownScope = typeof value.projectId === "string" ? value.projectId : scope;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      const field = SENSITIVE_KEYS[key];
      if (field && !canSeeField(ctx, field, ownScope)) continue;
      out[key] = walk(v, ownScope);
    }
    return out;
  };
  return walk(entity, projectId) as T;
}

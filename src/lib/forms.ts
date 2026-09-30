import type { SensitiveField } from "@/core/auth/permissions";

/** Client-safe description of a form field, shared by the generic master screens and planning forms. */
export type RefKind = "uom" | "materialCategory" | "trade" | "costCode";

export interface Option {
  value: string;
  label: string;
}

export type FieldType = "text" | "textarea" | "number" | "integer" | "date" | "select" | "ref" | "boolean" | "password";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  unit?: string;
  /** Static options for type "select". */
  options?: Option[];
  /** Master list that a type "ref" field picks from (searchable select bound to an ID). */
  ref?: RefKind;
  /** For ref fields: where the display label lives on the row, e.g. { relation: "uom", labelKey: "code" }. */
  rel?: { relation: string; labelKey: string };
  /** Hidden from roles that may not see this class of field (also stripped server-side). */
  sensitive?: SensitiveField;
  /** Show in list views. */
  list?: boolean;
  /** Value pre-selected on a new record. */
  default?: string;
}

export type Values = Record<string, string>;

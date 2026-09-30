import type { FieldDef, Option } from "@/lib/forms";

/** Form fields for creating/editing a project. Pass `clients` on create (a project's client never changes). */
export function projectFormFields(opts: { clients?: Option[]; withValue: boolean }): FieldDef[] {
  const fields: FieldDef[] = [{ name: "name", label: "Project name", type: "text", required: true }];
  if (opts.clients) fields.push({ name: "clientId", label: "Client", type: "select", required: true, options: opts.clients });
  fields.push(
    { name: "type", label: "Project type", type: "text", required: true },
    { name: "location", label: "Location", type: "text", required: true },
  );
  if (opts.withValue) {
    fields.push({ name: "contractValue", label: "Contract value", type: "number", unit: "₹", required: true, hint: "Full amount in rupees, e.g. 34000000 for ₹3.4 Cr" });
  }
  fields.push(
    { name: "baselineStart", label: "Start date", type: "date", required: true },
    { name: "baselineFinish", label: "Baseline finish", type: "date", required: true },
    { name: "currentFinish", label: "Current finish", type: "date", required: true },
  );
  return fields;
}

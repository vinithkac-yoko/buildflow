"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/core/errors";
import type { FieldDef, Option, Values } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { SearchSelect } from "./search-select";

const selectCls = "min-h-12 w-full rounded-xl border bg-bg px-3 text-[17px]";

/** Generic form driven by FieldDef[]. Server errors appear next to the field they belong to. */
export function EntityForm({
  fields, initial, options, onSubmit, onDone, submitLabel = "Save",
}: {
  fields: FieldDef[];
  initial: Values;
  options: Record<string, Option[]>;
  onSubmit: (values: Values) => Promise<ActionResult<unknown>>;
  onDone: () => void;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<Values>(() => {
    const v: Values = {};
    for (const f of fields) v[f.name] = initial[f.name] ?? f.default ?? (f.type === "boolean" ? "false" : "");
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (name: string, v: string) => {
    setValues((cur) => ({ ...cur, [name]: v }));
    if (errors[name]) setErrors((cur) => ({ ...cur, [name]: "" }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setErrors({});
    start(async () => {
      const res = await onSubmit(values);
      if (res.ok) onDone();
      else {
        setFormError(res.error);
        setErrors(res.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {fields.map((f) => {
        const id = `f-${f.name}`;
        const err = errors[f.name];
        const common = { id, name: f.name, "aria-invalid": err ? true : undefined, "aria-describedby": err ? `${id}-err` : f.hint ? `${id}-hint` : undefined } as const;
        return (
          <div key={f.name}>
            {f.type === "boolean" ? (
              <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[17px]">
                <input type="checkbox" checked={values[f.name] === "true"} onChange={(e) => set(f.name, String(e.target.checked))} className="h-6 w-6 accent-[rgb(var(--brand))]" />
                {f.label}
              </label>
            ) : (
              <>
                <Label htmlFor={id}>
                  {f.label}
                  {f.required && <span className="text-danger"> *</span>}
                  {f.unit && <span className="font-normal text-muted"> ({f.unit})</span>}
                </Label>
                {f.type === "textarea" ? (
                  <textarea {...common} rows={5} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)}
                    className={`${selectCls} py-3 ${err ? "border-danger" : "border-border"}`} />
                ) : f.type === "select" ? (
                  <select {...common} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} className={`${selectCls} ${err ? "border-danger" : "border-border"}`}>
                    <option value="">Select…</option>
                    {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === "ref" ? (
                  <SearchSelect
                    name={f.name}
                    label={f.label}
                    options={options[f.ref ?? f.name] ?? []}
                    value={values[f.name]}
                    onChange={(v) => set(f.name, v)}
                    invalid={!!err}
                    placeholder={`Select ${f.label.toLowerCase()}…`}
                  />
                ) : (
                  <Input
                    {...common}
                    type={f.type === "date" ? "date" : f.type === "password" ? "password" : "text"}
                    inputMode={f.type === "number" ? "decimal" : f.type === "integer" ? "numeric" : undefined}
                    autoComplete={f.type === "password" ? "new-password" : "off"}
                    value={values[f.name]}
                    onChange={(e) => set(f.name, e.target.value)}
                    className={err ? "border-danger" : undefined}
                  />
                )}
              </>
            )}
            {f.hint && !err && <p id={`${id}-hint`} className="mt-1 text-sm text-muted">{f.hint}</p>}
            {err && <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-danger">{err}</p>}
          </div>
        );
      })}
      {formError && !Object.values(errors).some(Boolean) && (
        <p role="alert" className="rounded-xl border border-danger/50 px-3 py-2 text-[15px] text-danger">{formError}</p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>Cancel</Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

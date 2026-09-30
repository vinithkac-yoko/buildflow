"use client";

import { useState } from "react";
import { assignEquipmentAction, logEquipmentAction } from "@/actions/ops";
import { FormModal, areaCls, numOrUndef, selectCls, today } from "@/components/forms/form-modal";
import { Input, Label } from "@/components/ui/input";
import type { ProjectActs } from "./issue-delay-forms";

export function AssignEquipmentButton({ equipmentId, projects, label = "Assign to a project" }: { equipmentId: string; projects: ProjectActs[]; label?: string }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [activityId, setActivityId] = useState("");
  const [from, setFrom] = useState(today());
  const [note, setNote] = useState("");
  const project = projects.find((p) => p.id === projectId);
  return (
    <FormModal title="Assign equipment" label={label} icon="none" submitLabel="Assign" successMessage="Equipment assigned."
      onSubmit={() => assignEquipmentAction(equipmentId, { projectId, activityId: activityId || null, fromDate: from, note: note || null })}>
      {({ err }) => (
        <>
          <div><Label htmlFor="eq-project">Project</Label>
            <select id="eq-project" className={selectCls} value={projectId} onChange={(e) => { setProjectId(e.target.value); setActivityId(""); }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select>{err("projectId")}</div>
          <div><Label htmlFor="eq-act">Activity (optional)</Label>
            <select id="eq-act" className={selectCls} value={activityId} onChange={(e) => setActivityId(e.target.value)}><option value="">Not tied to one activity</option>{project?.activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>{err("activityId")}</div>
          <div><Label htmlFor="eq-from">Arrives on</Label><Input id="eq-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />{err("fromDate")}</div>
          <div><Label htmlFor="eq-note">Note</Label><Input id="eq-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </>
      )}
    </FormModal>
  );
}

export function LogEquipmentButton({ equipmentId, activities }: { equipmentId: string; activities: { id: string; name: string }[] }) {
  const [kind, setKind] = useState("USAGE");
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(today());
  const [activityId, setActivityId] = useState("");
  const [note, setNote] = useState("");
  return (
    <FormModal title="Log equipment" label="Log usage / maintenance / breakdown" submitLabel="Save log" successMessage="Logged."
      onSubmit={() => logEquipmentAction(equipmentId, { kind, hours: numOrUndef(hours) ?? null, logDate: date, activityId: activityId || null, note: note || null })}>
      {({ err }) => (
        <>
          <div><Label htmlFor="lg-kind">What happened?</Label>
            <select id="lg-kind" className={selectCls} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="USAGE">It worked (usage hours)</option><option value="MAINTENANCE">Maintenance</option><option value="BREAKDOWN">Breakdown</option>
            </select>{err("kind")}</div>
          {kind === "USAGE" && <div><Label htmlFor="lg-hours">Hours worked</Label><Input id="lg-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />{err("hours")}</div>}
          <div><Label htmlFor="lg-date">Date</Label><Input id="lg-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />{err("logDate")}</div>
          <div><Label htmlFor="lg-act">Activity (optional)</Label>
            <select id="lg-act" className={selectCls} value={activityId} onChange={(e) => setActivityId(e.target.value)}><option value="">Same as the assignment</option>{activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>{err("activityId")}</div>
          <div><Label htmlFor="lg-note">{kind === "USAGE" ? "Note (optional)" : kind === "BREAKDOWN" ? "What broke down?" : "What was done?"}</Label><textarea id="lg-note" rows={2} className={areaCls} value={note} onChange={(e) => setNote(e.target.value)} />{err("note")}</div>
        </>
      )}
    </FormModal>
  );
}

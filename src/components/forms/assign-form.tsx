"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { assignUserAction } from "@/actions/admin";
import type { Option } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { SearchSelect } from "./search-select";

/** Pick a person and assign them to a project. */
export function AssignForm({ projectId, users }: { projectId: string; users: Option[] }) {
  const [userId, setUserId] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-56 flex-1">
        <SearchSelect label="Person" options={users} value={userId} onChange={setUserId} placeholder="Add a person…" />
      </div>
      <Button
        type="button"
        disabled={!userId || pending}
        onClick={() =>
          start(async () => {
            const res = await assignUserAction({ userId, projectId });
            if (res.ok) {
              toast("success", "Assigned.");
              setUserId("");
              router.refresh();
            } else toast("error", res.error);
          })
        }
      >
        <UserPlus className="h-4 w-4" aria-hidden /> Assign
      </Button>
    </div>
  );
}

"use client";

import { useState } from "react";

/** Project on a lead: pick one from the Inventory list, or choose "Other" and type a name that isn't in the list. */
export function ProjectPicker({ projects, projectId, projectName }: { projects: { id: string; name: string }[]; projectId?: string | null; projectName?: string | null }) {
  const [value, setValue] = useState(projectId ?? (projectName ? "__other" : ""));
  return (
    <div className="space-y-2">
      <select name="projectId" value={value} onChange={(e) => setValue(e.target.value)} className="input" aria-label="Project">
        <option value="">—</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        <option value="__other">Other (type the name)…</option>
      </select>
      {value === "__other" && <input name="projectName" defaultValue={projectName ?? ""} required maxLength={190} placeholder="Project name, e.g. Askari VI" className="input" autoFocus aria-label="Project name" />}
    </div>
  );
}

import type { TaskDraft } from "./contracts";

export interface NativeTaskDraftInitialValues {
  title: string; status: TaskDraft["status"]; work_mode?: TaskDraft["work_mode"]; backlog?: string; due?: string;
  provenance: { model: string; mode: "standard" | "deep"; manifest_digest: string };
}

export function toNativeTaskDraftInitialValues(draft: TaskDraft, provenance: NativeTaskDraftInitialValues["provenance"]): NativeTaskDraftInitialValues {
  return { title: draft.title, status: draft.status, ...(draft.work_mode ? { work_mode: draft.work_mode } : {}), ...(draft.backlog ? { backlog: draft.backlog } : {}), ...(draft.due ? { due: draft.due } : {}), provenance };
}

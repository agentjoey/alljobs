import type { ReviewAction, ReviewRequest } from "./types";

function subjectShortId(subjectId: string): string {
  return subjectId.slice(subjectId.indexOf("_") + 1, subjectId.indexOf("_") + 9).toLowerCase();
}

export function confirmationFor(request: Pick<ReviewRequest, "review_kind" | "subject_id">, action: ReviewAction): string {
  const verb = action === "approve" && request.review_kind === "implementation"
    ? "ACCEPT"
    : action.toUpperCase();
  return `${verb} ${request.review_kind.toUpperCase()} ${subjectShortId(request.subject_id)}`;
}

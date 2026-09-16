import { describe, expect, it } from "vitest";
import type { ReviewRequest } from "./types";
import { confirmationFor } from "./confirmations";

const candidate = {
  review_kind: "candidate",
  subject_id: `cand_${"4".repeat(32)}`
} as Pick<ReviewRequest, "review_kind" | "subject_id">;

describe("review confirmations", () => {
  it("binds action, kind, and the first eight subject identity characters", () => {
    expect(confirmationFor(candidate, "approve")).toBe("APPROVE CANDIDATE 44444444");
    expect(confirmationFor(candidate, "reject")).toBe("REJECT CANDIDATE 44444444");
    expect(confirmationFor(candidate, "revoke")).toBe("REVOKE CANDIDATE 44444444");
  });

  it("uses ACCEPT only for implementation approval", () => {
    expect(confirmationFor({
      review_kind: "implementation",
      subject_id: `impl_${"a".repeat(32)}`
    }, "approve")).toBe("ACCEPT IMPLEMENTATION aaaaaaaa");
  });
});

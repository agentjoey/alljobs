import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTaskAction } from "@/app/actions/native-planning";
import { NativeTaskForm } from "./native-task-form";

vi.mock("@/app/actions/native-planning", () => ({ createTaskAction: vi.fn() }));

describe("NativeTaskForm assistant draft", () => {
  it("prefills an assistant task draft without assigning an id or submitting it", () => {
    render(<NativeTaskForm projectSlug="alljobs" initialDraft={{ title: "Verify R2 source citations", status: "todo", work_mode: "implementation", backlog: "AJ-B-020", due: "2026-09-05", provenance: { model: "MiniMax-M3", mode: "standard", manifest_digest: "a".repeat(64) } }} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Title/)).toHaveValue("Verify R2 source citations");
    expect(screen.getByLabelText(/Task ID/)).toHaveValue("");
    expect(screen.getByText("Assistant draft provenance")).toBeVisible();
    expect(createTaskAction).not.toHaveBeenCalled();
  });
});

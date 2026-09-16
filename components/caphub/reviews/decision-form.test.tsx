import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecisionForm } from "./decision-form";
import { DIGEST, reviewDetail } from "./test-fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("DecisionForm", () => {
  it("requires exact confirmation and mandatory reject rationale", () => {
    render(<DecisionForm detail={reviewDetail()} />);
    const submit = screen.getByRole("button", { name: /Approve build/i });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Reject permanently/i }));
    fireEvent.change(screen.getByLabelText(/Typed confirmation/i), { target: { value: "REJECT CANDIDATE 22222222" } });
    expect(screen.getByRole("button", { name: /Reject this version/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Rationale/i), { target: { value: "Evidence is insufficient." } });
    expect(screen.getByRole("button", { name: /Reject this version/i })).toBeEnabled();
  });

  it("preserves rationale on stale conflict", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "STALE_REVIEW" } }), { status: 409, headers: { "content-type": "application/json" } })));
    render(<DecisionForm detail={reviewDetail()} />);
    fireEvent.change(screen.getByLabelText(/Rationale/i), { target: { value: "Keep this text" } });
    fireEvent.change(screen.getByLabelText(/Typed confirmation/i), { target: { value: "APPROVE CANDIDATE 22222222" } });
    fireEvent.click(screen.getByRole("button", { name: /Approve build/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/changed before the decision/i);
    expect(screen.getByLabelText(/Rationale/i)).toHaveValue("Keep this text");
    expect(screen.getByRole("button", { name: /Refresh this request/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve build/i })).toBeDisabled();
  });

  it("preserves input and requires refresh after an idempotency conflict", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "IDEMPOTENCY_CONFLICT" } }), { status: 409, headers: { "content-type": "application/json" } })));
    render(<DecisionForm detail={reviewDetail()} />);
    fireEvent.change(screen.getByLabelText(/Rationale/i), { target: { value: "Keep idempotent rationale" } });
    fireEvent.change(screen.getByLabelText(/Typed confirmation/i), { target: { value: "APPROVE CANDIDATE 22222222" } });
    fireEvent.click(screen.getByRole("button", { name: /Approve build/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/refresh is required/i);
    expect(screen.getByLabelText(/Rationale/i)).toHaveValue("Keep idempotent rationale");
    expect(screen.getByRole("button", { name: /Approve build/i })).toBeDisabled();
  });

  it("locks controls while submitting and reuses one intent key after a lost response", async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    const fetch = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
      .mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        decision: { id: `dec_${"d".repeat(32)}`, action: "approve" },
        consequence: "No release or build was created."
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    render(<DecisionForm detail={reviewDetail()} />);
    fireEvent.change(screen.getByLabelText(/Typed confirmation/i), { target: { value: "APPROVE CANDIDATE 22222222" } });
    fireEvent.click(screen.getByRole("button", { name: /Approve build/i }));
    expect(screen.getByRole("button", { name: /Recording exact decision/i })).toBeDisabled();
    resolveFirst?.(new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR" } }), { status: 500, headers: { "content-type": "application/json" } }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: /Approve build/i }));
    await screen.findByText(/REVIEW_WRITE_UNAVAILABLE/i);
    fireEvent.click(screen.getByRole("button", { name: /Approve build/i }));
    await screen.findByRole("heading", { name: "Decision recorded" });
    const bodies = fetch.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(new Set(bodies.map((body) => body.idempotency_key)).size).toBe(1);
  });

  it("moves focus to a receipt and announces the no-action consequence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      decision: { id: `dec_${"d".repeat(32)}`, action: "approve" },
      consequence: "No release, build, installation, publication, or deployment action was executed."
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<DecisionForm detail={reviewDetail()} />);
    fireEvent.change(screen.getByLabelText(/Typed confirmation/i), { target: { value: "APPROVE CANDIDATE 22222222" } });
    fireEvent.click(screen.getByRole("button", { name: /Approve build/i }));
    const heading = await screen.findByRole("heading", { name: "Decision recorded" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText(/No release, build, installation/i)).toBeInTheDocument();
    expect(screen.getAllByText(DIGEST)).toHaveLength(2);
  });

  it("renders consumed, rejected, revoked, and superseded states without unsafe controls", () => {
    const approval = { id: `dec_${"e".repeat(32)}`, action: "approve", disposition: "build", rationale: "", actor: "human:owner", recordedAt: "2026-09-16T13:00:00.000Z", revokesDecisionId: null } as const;
    const { rerender } = render(<DecisionForm detail={reviewDetail({
      request: { ...reviewDetail().request, state: "APPROVED", lockVersion: 2 },
      decision: approval,
      authority: { state: "consumed", consumedBy: `bld_${"f".repeat(32)}`, revocable: false }
    })} />);
    expect(screen.getByText(/Decision recorded · consumed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revoke approval/i })).not.toBeInTheDocument();

    rerender(<DecisionForm detail={reviewDetail({ request: { ...reviewDetail().request, state: "SUPERSEDED", supersededByRequestId: `rev_${"a".repeat(32)}` } })} />);
    expect(screen.getByRole("heading", { name: /This request was superseded/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open latest request/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Decision ledger" })).toBeInTheDocument();
  });
});

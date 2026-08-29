"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  applyBacklogOrderingChange,
  proposeBacklogOrderingChange,
  type BacklogChangeProposal
} from "@/lib/planning/backlog/mutations";
import type { BacklogFieldChange, BacklogOrderingIntent } from "@/lib/planning/backlog/ordering";
import { errorResult, internalErrorResult, mutationErrorResult, successResult, type ActionResult } from "./action-result";

const projectSlugSchema = z.string().regex(/^[a-z0-9-]+$/);
const backlogIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const prioritySchema = z.enum(["P0", "P1", "P2"]);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);

const orderingIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("initialize") }).strict(),
  z.object({ kind: z.literal("repair"), phase: backlogIdSchema, priority: prioritySchema }).strict(),
  z.object({ kind: z.literal("change-priority"), itemId: backlogIdSchema, targetPriority: prioritySchema }).strict(),
  z.object({
    kind: z.literal("move"),
    itemId: backlogIdSchema,
    targetPriority: prioritySchema,
    beforeId: backlogIdSchema.optional(),
    afterId: backlogIdSchema.optional()
  }).strict().refine((intent) => !(intent.beforeId && intent.afterId), {
    message: "A move may specify beforeId or afterId, but not both."
  })
]);

const proposeInputSchema = z.object({
  projectSlug: projectSlugSchema,
  intent: orderingIntentSchema
}).strict();

const fieldChangeSchema = z.object({
  itemId: backlogIdSchema,
  priority: prioritySchema,
  rank: z.number().int().positive().optional()
}).strict();

const proposalSchema = z.object({
  projectSlug: projectSlugSchema,
  intent: orderingIntentSchema,
  expectedFileDigest: digestSchema,
  headRevision: z.string().min(1).max(256).optional(),
  backlogModified: z.boolean(),
  sourceMode: z.literal("local-working-tree"),
  changes: z.array(fieldChangeSchema).min(1),
  renumbered: z.boolean(),
  // This is the reviewed, generated field summary — never the source Markdown.
  diff: z.string().min(1).max(20_000),
  proposalDigest: digestSchema
}).strict();

const applyInputSchema = z.object({
  proposal: proposalSchema,
  proposalDigest: digestSchema
}).strict().refine(({ proposal, proposalDigest }) => proposal.proposalDigest === proposalDigest, {
  message: "Proposal digest does not match the reviewed proposal."
});

function invalidInput() {
  return errorResult("Invalid backlog ordering request", "INVALID_INPUT");
}

/**
 * Server Actions are directly reachable POST endpoints. Accept only the small,
 * validated ordering intent and let the mutation service inspect the current
 * control-host source itself.
 */
export async function proposeBacklogOrderingAction(input: unknown): Promise<ActionResult<BacklogChangeProposal>> {
  const parsed = proposeInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();

  try {
    const result = await proposeBacklogOrderingChange({
      projectSlug: parsed.data.projectSlug,
      intent: parsed.data.intent as BacklogOrderingIntent
    });
    if (!result.ok) return mutationErrorResult(result);
    return successResult(result.proposal, "Backlog ordering proposal prepared");
  } catch (error) {
    return internalErrorResult(error, "PROPOSE_ERROR");
  }
}

export async function applyBacklogOrderingAction(input: unknown): Promise<ActionResult<{
  digest: string;
  changes: BacklogFieldChange[];
  warnings: string[];
}>> {
  const parsed = applyInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();

  try {
    const result = await applyBacklogOrderingChange(
      parsed.data.proposal as BacklogChangeProposal,
      parsed.data.proposalDigest
    );
    if (!result.ok) return mutationErrorResult(result);

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath(`/projects/${parsed.data.proposal.projectSlug}`);

    return successResult(
      { digest: result.digest, changes: result.changes, warnings: result.warnings },
      "Backlog ordering changes applied"
    );
  } catch (error) {
    return internalErrorResult(error, "WRITE_FAILED");
  }
}

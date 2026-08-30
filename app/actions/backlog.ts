"use server";

import { z } from "zod";
import {
  proposeBacklogOrderingChange,
  type BacklogChangeProposal
} from "@/lib/planning/backlog/mutations";
import type { BacklogOrderingIntent } from "@/lib/planning/backlog/ordering";
import { errorResult, internalErrorResult, mutationErrorResult, successResult, type ActionResult } from "./action-result";

const projectSlugSchema = z.string().regex(/^[a-z0-9-]+$/);
const backlogIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const prioritySchema = z.enum(["P0", "P1", "P2"]);

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

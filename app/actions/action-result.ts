export type ActionResult<T = unknown> =
  | { status: "success"; data: T; message: string }
  | {
      status: "error";
      code: string;
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

export function successResult<T>(data: T, message = "Success"): ActionResult<T> {
  return { status: "success", data, message };
}

export function errorResult(
  message: string,
  code = "ACTION_ERROR",
  fieldErrors?: Record<string, string[]>
): ActionResult<never> {
  return { status: "error", code, message, fieldErrors };
}

// Codes whose underlying failures carry internals (absolute paths, git stderr).
// The client gets a generic message; the full detail goes to the server log.
const INTERNAL_ERROR_MESSAGES: Record<string, string> = {
  CONFIG_ERROR: "Server configuration is unavailable",
  INSPECT_ERROR: "Failed to inspect the candidate project",
  PROPOSE_ERROR: "Failed to prepare the change proposal",
  REFRESH_ERROR: "Failed to refresh project data",
  FILESYSTEM_ERROR: "Failed to write changes to disk"
};

export function internalErrorResult(err: unknown, code: string): ActionResult<never> {
  console.error(`[alljobs action] ${code}:`, err);
  return errorResult(INTERNAL_ERROR_MESSAGES[code] ?? "The operation failed", code);
}

export function mutationErrorResult(result: { code: string; message: string }): ActionResult<never> {
  // Zod issue payloads serialize as a JSON array — never surface those raw.
  if (result.message.startsWith("[{") || result.code in INTERNAL_ERROR_MESSAGES) {
    return internalErrorResult(result.message, result.code);
  }
  return errorResult(result.message, result.code);
}

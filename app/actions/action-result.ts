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

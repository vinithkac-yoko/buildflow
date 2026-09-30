/** Errors thrown by core services. Messages are written for site staff: name the problem and the fix. */
export class AppError extends Error {
  constructor(
    public readonly code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED",
    message: string,
    /** Optional messages keyed by form path (e.g. "progress.0.quantity") so a screen can mark the field. */
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = (msg = "Please sign in to continue.") => new AppError("UNAUTHORIZED", msg);
export const forbidden = (msg = "You don't have access to do that. Ask the Owner or Admin if you need it.") =>
  new AppError("FORBIDDEN", msg);
export const notFound = (what = "That record") =>
  new AppError("NOT_FOUND", `${what} was not found, or you don't have access to it.`);
export const validation = (msg: string, fieldErrors?: Record<string, string>) => new AppError("VALIDATION", msg, fieldErrors);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);

/** Result shape returned by server actions so forms can show errors next to the field. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function failure(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

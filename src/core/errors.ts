/** Errors thrown by core services. Messages are written for site staff: name the problem and the fix. */
export class AppError extends Error {
  constructor(
    public readonly code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED",
    message: string,
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
export const validation = (msg: string) => new AppError("VALIDATION", msg);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);

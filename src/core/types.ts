import type { Role } from "@prisma/client";

/**
 * Execution context passed to every core service function.
 * `allProjects` is true for roles that see every project (Owner, Admin, Accounts,
 * Procurement, HR); otherwise `projectIds` is the exact set the user may touch.
 */
export interface Ctx {
  userId: string;
  role: Role;
  projectIds: readonly string[];
  allProjects: boolean;
  /** Set only for CLIENT logins. */
  clientId: string | null;
  now: Date;
}

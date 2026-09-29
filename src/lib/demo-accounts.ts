import type { Role } from "@prisma/client";

/** Demo logins (password `demo1234`). Shown on the login page only when DEMO_MODE=true. Seed creates these users. */
export interface DemoAccount {
  email: string;
  name: string;
  role: Role;
  /** Listed by default in the quick-pick (one per role). */
  primary: boolean;
}

export const DEMO_PASSWORD = "demo1234";

const d = (email: string, name: string, role: Role, primary = false): DemoAccount => ({ email, name, role, primary });

export const DEMO_ACCOUNTS: DemoAccount[] = [
  d("owner@buildflow.demo", "Demo Owner", "OWNER", true),
  d("pm1@buildflow.demo", "Demo Project Manager 1", "PROJECT_MANAGER", true),
  d("engineer1@buildflow.demo", "Demo Site Engineer 1", "SITE_ENGINEER", true),
  d("procurement@buildflow.demo", "Demo Procurement", "PROCUREMENT", true),
  d("store@buildflow.demo", "Demo Store Keeper", "STORE_KEEPER", true),
  d("quality@buildflow.demo", "Demo Quality Engineer", "QUALITY_ENGINEER", true),
  d("accounts@buildflow.demo", "Demo Accounts", "ACCOUNTS", true),
  d("hr@buildflow.demo", "Demo HR", "HR", true),
  d("marketing@buildflow.demo", "Demo Marketing", "MARKETING", true),
  d("admin@buildflow.demo", "Demo Admin", "ADMIN", true),
  d("client@buildflow.demo", "Demo Client", "CLIENT", true),
  d("pm2@buildflow.demo", "Demo Project Manager 2", "PROJECT_MANAGER"),
  d("pm3@buildflow.demo", "Demo Project Manager 3", "PROJECT_MANAGER"),
  ...[2, 3, 4, 5, 6, 7].map((n) => d(`engineer${n}@buildflow.demo`, `Demo Site Engineer ${n}`, "SITE_ENGINEER")),
];

/**
 * Demo data seed.
 *   pnpm db:seed             wipe and recreate all records flagged isDemo=true
 *   pnpm db:seed:if-empty    first-deploy hook: seed an empty database, or refresh an outdated demo (DEMO_MODE=true)
 */
import { PrismaClient } from "@prisma/client";
import { resetDemo, seedIfNeeded } from "../src/core/demo/seed";

const db = new PrismaClient();

async function main() {
  if (process.argv.includes("--if-empty")) {
    const r = await seedIfNeeded(db, process.env.DEMO_MODE === "true");
    console.log(`seed: ${r.action}`, "users" in r ? `(${r.users} users, ${r.projects} projects)` : "");
    return;
  }
  const r = await resetDemo(db);
  console.log(`seed: created ${r.users} demo users and ${r.projects} projects`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

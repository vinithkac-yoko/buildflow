/**
 * Demo data seed.
 *   pnpm db:seed             wipe and recreate all records flagged isDemo=true
 *   pnpm db:seed:if-empty    seed only when there are no users (first deploy)
 * Every seeded record has isDemo = true. Later milestones extend this file.
 */
import bcrypt from "bcryptjs";
import { PrismaClient, type ProjectStatus, type Role } from "@prisma/client";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/lib/demo-accounts";

const db = new PrismaClient();

const DAY = 86400000;
const WEEK = 7 * DAY;

function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

interface ProjectSeed {
  name: string;
  location: string;
  valueCr: number;
  status: ProjectStatus;
  pm: 1 | 2 | 3;
  engineer: number | null; // one Site Engineer per active project
  client: string;
  startedWeeksAgo: number;
  durationWeeks: number;
  slipWeeks: number; // currentFinish - baselineFinish
  note: string; // intended demo shape (used by later milestones' progress seeding)
}

export const PROJECTS: ProjectSeed[] = [
  { name: "G+2 luxury villa, RS Puram", location: "RS Puram, Coimbatore", valueCr: 3.4, status: "ACTIVE", pm: 1, engineer: 1, client: "R. Sundaram", startedWeeksAgo: 26, durationWeeks: 58, slipWeeks: 0, note: "~45% complete" },
  { name: "Duplex villa with basement, Avinashi Road", location: "Avinashi Road, Tiruppur", valueCr: 2.6, status: "ACTIVE", pm: 2, engineer: 2, client: "K. Palaniswamy", startedWeeksAgo: 14, durationWeeks: 60, slipWeeks: 8, note: "~20% complete, critical-path delay" },
  { name: "Contemporary villa, Saravanampatti", location: "Saravanampatti, Coimbatore", valueCr: 2.9, status: "ACTIVE", pm: 3, engineer: 3, client: "S. Lakshmi Narayanan", startedWeeksAgo: 40, durationWeeks: 52, slipWeeks: -3, note: "~70% complete, finishing stage, ahead" },
  { name: "Courtyard home, Race Course", location: "Race Course, Coimbatore", valueCr: 4.1, status: "ACTIVE", pm: 1, engineer: 4, client: "M. Vijayalakshmi", startedWeeksAgo: 30, durationWeeks: 60, slipWeeks: 0, note: "~55% complete, on track" },
  { name: "G+1 villa, Peelamedu", location: "Peelamedu, Coimbatore", valueCr: 2.3, status: "ACTIVE", pm: 2, engineer: 5, client: "T. Arumugam", startedWeeksAgo: 22, durationWeeks: 56, slipWeeks: 2, note: "~35% complete, slightly behind" },
  { name: "Luxury bungalow, Kumaran Nagar", location: "Kumaran Nagar, Tiruppur", valueCr: 3.0, status: "ACTIVE", pm: 1, engineer: 6, client: "P. Ganesan", startedWeeksAgo: 6, durationWeeks: 64, slipWeeks: 0, note: "~10% complete, foundation stage" },
  { name: "Villa with pool, Vadavalli", location: "Vadavalli, Coimbatore", valueCr: 3.6, status: "ACTIVE", pm: 3, engineer: 7, client: "N. Rajeshwari", startedWeeksAgo: 46, durationWeeks: 54, slipWeeks: 0, note: "~85% complete, one open major NCR" },
  { name: "Farmhouse residence, Pollachi", location: "Pollachi", valueCr: 2.2, status: "PLANNING", pm: 2, engineer: null, client: "V. Chinnasamy", startedWeeksAgo: -6, durationWeeks: 48, slipWeeks: 0, note: "planning" },
  { name: "Heritage-style home, Erode", location: "Erode", valueCr: 2.5, status: "ON_HOLD", pm: 3, engineer: null, client: "A. Thiagarajan", startedWeeksAgo: 4, durationWeeks: 70, slipWeeks: 12, note: "on hold — client-side approval pending" },
];

async function wipeDemo() {
  const demoUsers = await db.user.findMany({ where: { isDemo: true }, select: { id: true } });
  const demoProjects = await db.project.findMany({ where: { isDemo: true }, select: { id: true } });
  const uIds = demoUsers.map((u) => u.id);
  const pIds = demoProjects.map((p) => p.id);

  await db.auditLog.deleteMany({ where: { OR: [{ userId: { in: uIds } }, { projectId: { in: pIds } }] } });
  await db.projectAssignment.deleteMany({ where: { OR: [{ userId: { in: uIds } }, { projectId: { in: pIds } }] } });
  await db.project.deleteMany({ where: { isDemo: true } });
  await db.client.updateMany({ where: { isDemo: true }, data: { createdById: null } });
  await db.user.deleteMany({ where: { isDemo: true } });
  await db.client.deleteMany({ where: { isDemo: true } });
}

async function seed() {
  const today = todayUtc();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Users first (one per role, plus 3 PMs and 7 engineers). Client login is linked after clients exist.
  const userIds = new Map<string, string>();
  for (const a of DEMO_ACCOUNTS) {
    const u = await db.user.create({
      data: { email: a.email, name: a.name, role: a.role as Role, passwordHash, isDemo: true },
    });
    userIds.set(a.email, u.id);
  }
  const ownerId = userIds.get("owner@buildflow.demo")!;

  let n = 0;
  for (const p of PROJECTS) {
    n += 1;
    const code = String(n).padStart(4, "0");
    const client = await db.client.create({
      data: {
        code: `CLI-${code}`, name: p.client, contact: null, paymentTerms: "Milestone-linked (per contract)",
        isDemo: true, createdById: ownerId,
      },
    });
    const start = new Date(today.getTime() - p.startedWeeksAgo * WEEK);
    const baselineFinish = new Date(start.getTime() + p.durationWeeks * WEEK);
    const project = await db.project.create({
      data: {
        code: `PRJ-${code}`, clientId: client.id, name: p.name, type: "Premium residential villa",
        location: p.location, contractValue: (p.valueCr * 1e7).toFixed(2),
        baselineStart: start, baselineFinish, currentFinish: new Date(baselineFinish.getTime() + p.slipWeeks * WEEK),
        status: p.status, isDemo: true, createdById: ownerId,
      },
    });

    const assignees = [`pm${p.pm}@buildflow.demo`, ...(p.engineer ? [`engineer${p.engineer}@buildflow.demo`] : [])];
    for (const email of assignees) {
      await db.projectAssignment.create({
        data: { userId: userIds.get(email)!, projectId: project.id, createdById: ownerId, isDemo: true },
      });
    }

    // The demo client login owns the first project.
    if (n === 1) {
      await db.user.update({ where: { email: "client@buildflow.demo" }, data: { clientId: client.id } });
    }
  }
}

async function main() {
  const ifEmpty = process.argv.includes("--if-empty");
  if (ifEmpty) {
    const users = await db.user.count();
    if (users > 0) {
      console.log("seed: users exist, skipping (--if-empty)");
      return;
    }
  } else {
    await wipeDemo();
  }
  await seed();
  console.log(`seed: created ${DEMO_ACCOUNTS.length} demo users and ${PROJECTS.length} projects`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

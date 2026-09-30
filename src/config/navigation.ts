import type { Role } from "@prisma/client";

export type NavIcon =
  | "dashboard" | "projects" | "finance" | "procurement" | "quality" | "reports" | "bell" | "settings"
  | "planning" | "progress" | "labour" | "materials" | "issues" | "home" | "today" | "dpr" | "photos"
  | "billing" | "receivables" | "payables" | "expenses" | "cashflow" | "requests" | "po" | "receipts"
  | "inventory" | "vendors" | "inspections" | "ncr" | "rework" | "documents" | "bills" | "payments"
  | "handover" | "clients" | "users" | "assignments" | "masters" | "audit" | "employees" | "more" | "ask";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  /** Milestone in which this screen becomes real; shown on placeholder pages. */
  milestone: number;
  /** One-line description of what the screen will do (used by placeholder pages). */
  blurb: string;
}

const item = (label: string, href: string, icon: NavIcon, milestone: number, blurb: string): NavItem => ({
  label, href, icon, milestone, blurb,
});

const DASH = item("Dashboard", "/", "dashboard", 1, "Your home screen.");
const PROJECTS = item("Projects", "/projects", "projects", 1, "Every project you can access.");

/** Role navigation — follows the client spec §25; roles the spec leaves open are recorded in docs/DECISIONS.md. */
export const NAV: Record<Role, NavItem[]> = {
  OWNER: [
    DASH,
    PROJECTS,
    item("Finance", "/payables", "finance", 4, "Vendor invoices, payments and what is owed."),
    item("Procurement", "/procurement", "procurement", 4, "Purchase requests, quotations and orders."),
    item("Quality", "/quality", "quality", 5, "Inspections and open NCRs across sites."),
    item("Reports", "/reports", "reports", 7, "Portfolio reports."),
    item("Notifications", "/notifications", "bell", 7, "What needs your attention."),
    item("Settings", "/settings", "settings", 1, "Profile, theme, audit log and demo controls."),
  ],
  PROJECT_MANAGER: [
    DASH,
    PROJECTS,
    item("Planning", "/planning", "planning", 2, "WBS, activities and BOQ for your projects."),
    item("Progress", "/progress", "progress", 3, "Approve daily reports and track progress."),
    item("Labour", "/labour", "labour", 3, "Labour logs and mandays."),
    item("Materials", "/materials", "materials", 4, "Stock and material requests."),
    item("Procurement", "/procurement", "procurement", 4, "Purchase requests for your projects."),
    item("Quality", "/quality", "quality", 5, "Inspections and NCRs."),
    item("Issues", "/issues", "issues", 6, "Issues and delays."),
    item("Reports", "/reports", "reports", 7, "Project reports."),
  ],
  SITE_ENGINEER: [
    item("My Projects", "/my-projects", "home", 1, "Your assigned sites and today's report status."),
    item("Today's Work", "/todays-work", "today", 3, "Activities planned for today."),
    item("DPR", "/dpr", "dpr", 3, "Today's daily progress report."),
    item("Labour", "/labour", "labour", 3, "Labour logs."),
    item("Materials", "/materials", "materials", 4, "Material used and requests."),
    item("Quality", "/quality", "quality", 5, "Raise inspections."),
    item("Photos", "/photos", "photos", 3, "Site photos."),
    item("Issues", "/issues", "issues", 6, "Report site issues."),
  ],
  ACCOUNTS: [
    DASH,
    item("Billing", "/billing", "billing", 9, "Client billing — a read-only placeholder in Phase 1 (see decision 4)."),
    item("Receivables", "/receivables", "receivables", 9, "Read-only placeholder in Phase 1 (see decision 4)."),
    item("Payables", "/payables", "payables", 4, "Vendor invoices, subcontractor bills and payments."),
    item("Expenses", "/expenses", "expenses", 9, "Project expenses — placeholder in Phase 1."),
    item("Cash Flow", "/cash-flow", "cashflow", 7, "Cash position."),
    item("Reports", "/reports", "reports", 7, "Finance reports."),
  ],
  PROCUREMENT: [
    DASH,
    item("Requests", "/requests", "requests", 4, "Material and purchase requests."),
    item("Purchase Orders", "/purchase-orders", "po", 4, "Quotations and POs."),
    item("Receipts", "/receipts", "receipts", 4, "Material receipts."),
    item("Inventory", "/inventory", "inventory", 4, "Project-wise stock."),
    item("Vendors", "/vendors", "vendors", 2, "Vendor master."),
    item("Reports", "/reports", "reports", 7, "Procurement reports."),
  ],
  QUALITY_ENGINEER: [
    DASH,
    item("Inspections", "/inspections", "inspections", 5, "Checklist inspections."),
    item("NCR", "/ncr", "ncr", 5, "Non-conformance reports."),
    item("Rework", "/rework", "rework", 5, "Rectification tracking."),
    item("Reports", "/reports", "reports", 7, "Quality reports."),
  ],
  CLIENT: [
    item("Project", "/projects", "projects", 1, "Your home."),
    item("Progress", "/progress", "progress", 7, "Approved progress."),
    item("Photos", "/photos", "photos", 7, "Photos your project manager has shared."),
    item("Documents", "/documents", "documents", 6, "Released documents."),
    item("Bills", "/bills", "bills", 7, "Bills."),
    item("Payments", "/payments", "payments", 7, "Payments."),
    item("Handover", "/handover", "handover", 6, "Handover documents."),
  ],
  MARKETING: [
    DASH,
    item("Clients", "/clients", "clients", 2, "Client records."),
  ],
  HR: [
    DASH,
    item("Employees", "/employees", "employees", 2, "Company employees."),
    item("Contract Labour", "/contract-labour", "labour", 2, "Contract labour gangs."),
  ],
  STORE_KEEPER: [
    DASH,
    item("Receipts", "/receipts", "receipts", 4, "Record material receipts."),
    item("Stock", "/inventory", "inventory", 4, "Issues, returns, transfers and counts."),
  ],
  ADMIN: [
    DASH,
    PROJECTS,
    item("Users", "/users", "users", 2, "Users and roles."),
    item("Assignments", "/assignments", "assignments", 2, "Who works on which project."),
    item("Masters", "/masters", "masters", 2, "Master data."),
    item("Audit Log", "/settings/audit", "audit", 1, "Who did what, where and when."),
  ],
};

/** Phone bottom bar: at most 4 primary destinations + More (research: ≤5 items, no hamburger). */
export function bottomNav(role: Role): NavItem[] {
  if (role === "SITE_ENGINEER") return NAV.SITE_ENGINEER.slice(0, 3);
  return NAV[role].slice(0, 4);
}

export function findNavItem(role: Role, href: string): NavItem | undefined {
  return NAV[role].find((n) => n.href === href);
}

export function isKnownRoute(role: Role, pathname: string): boolean {
  return NAV[role].some((n) => n.href === pathname);
}

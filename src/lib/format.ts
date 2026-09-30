/** Indian formatting helpers: ₹ with lakh/crore, dates as DD-MMM-YYYY. */

export function formatInr(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)} Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)} L`;
  return `${sign}₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(abs)}`;
}

const trim = (x: number) => x.toFixed(2).replace(/\.?0+$/, "");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${dd}-${MONTHS[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
}

export function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const ist = new Date(date.getTime() + 5.5 * 3600 * 1000);
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(ist)} ${hh}:${mm}`;
}

export const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  MARKETING: "Marketing",
  PROJECT_MANAGER: "Project Manager",
  SITE_ENGINEER: "Site Engineer",
  ACCOUNTS: "Accounts",
  PROCUREMENT: "Procurement",
  QUALITY_ENGINEER: "Quality Engineer",
  HR: "HR",
  STORE_KEEPER: "Store Keeper",
  ADMIN: "Admin",
  CLIENT: "Client",
};

/** Clock time in India (IST), e.g. 5:42 PM. */
export function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const ist = new Date(date.getTime() + 5.5 * 3600 * 1000);
  const h = ist.getUTCHours();
  const m = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${((h + 11) % 12) + 1}:${m} ${h >= 12 ? "PM" : "AM"}`;
}

export function daysLabel(days: number): string {
  if (days === 0) return "On plan";
  const n = Math.abs(days);
  const unit = n === 1 ? "day" : "days";
  return days > 0 ? `${n} ${unit} ahead` : `${n} ${unit} behind`;
}

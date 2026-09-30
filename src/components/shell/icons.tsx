"use client";

import {
  LayoutDashboard, FolderKanban, Landmark, ShoppingCart, ShieldCheck, FileBarChart, Bell, Settings,
  CalendarRange, TrendingUp, HardHat, Boxes, AlertTriangle, Home, CalendarCheck, ClipboardList, Camera,
  Receipt, HandCoins, Wallet, CreditCard, LineChart, FilePlus2, ScrollText, PackageCheck, Warehouse,
  Store, ClipboardCheck, OctagonAlert, Wrench, FileText, FileSpreadsheet, Banknote, KeyRound, Users,
  Link2, Database, History, UserSquare, Ellipsis, Sparkles, type LucideIcon,
} from "lucide-react";
import type { NavIcon } from "@/config/navigation";

const MAP: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard, projects: FolderKanban, finance: Landmark, procurement: ShoppingCart,
  quality: ShieldCheck, reports: FileBarChart, bell: Bell, settings: Settings, planning: CalendarRange,
  progress: TrendingUp, labour: HardHat, materials: Boxes, issues: AlertTriangle, home: Home,
  today: CalendarCheck, dpr: ClipboardList, photos: Camera, billing: Receipt, receivables: HandCoins,
  payables: Wallet, expenses: CreditCard, cashflow: LineChart, requests: FilePlus2, po: ScrollText,
  receipts: PackageCheck, inventory: Warehouse, vendors: Store, inspections: ClipboardCheck,
  ncr: OctagonAlert, rework: Wrench, documents: FileText, bills: FileSpreadsheet, payments: Banknote,
  handover: KeyRound, clients: Users, users: Users, assignments: Link2, masters: Database,
  audit: History, employees: UserSquare, more: Ellipsis, ask: Sparkles,
};

export function NavGlyph({ name, className }: { name: NavIcon; className?: string }) {
  const Icon = MAP[name];
  return <Icon className={className} aria-hidden strokeWidth={2} />;
}

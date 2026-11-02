"use client";

import { Bell, Building2, CalendarCheck, CalendarDays, ClipboardList, Clock, LayoutDashboard, ShieldCheck, Timer, UsersRound } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/my-schedule", label: "My schedule", icon: CalendarCheck },
  { href: "/attendance", label: "Clock in / out", icon: Timer },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/roster", label: "Rostering", icon: CalendarDays },
  { href: "/availability", label: "Availability", icon: Clock },
];

function NavigationPending() {
  const { pending } = useLinkStatus();

  return (
    <span role={pending ? "status" : undefined} aria-live="polite" className="ml-auto inline-flex h-5 w-5 shrink-0">
      {pending && <>
        <span aria-hidden="true"
          className="h-5 w-5 animate-spin rounded-full border-2 border-sea-glass border-t-ocean motion-reduce:animate-none" />
        <span className="sr-only">Loading…</span>
      </>}
    </span>
  );
}

export function MainNavigation({ role, businessId }: { role: string; businessId?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="flex gap-2 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:px-3 md:pb-0">
      {[...links,
        ...(["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"].includes(role)
          ? [{ href: "/timesheets", label: "Timesheet review", icon: ClipboardList },
            { href: "/work-time", label: "Work time", icon: ClipboardList },
            { href: "/people", label: "People", icon: UsersRound },
            { href: "/settings/organisation", label: "Departments", icon: Building2 }] : []),
        ...(role === "owner" ? [
          { href: "/reports/hours", label: "Hours and labour", icon: ClipboardList },
          { href: "/settings/permissions", label: "Permissions", icon: ShieldCheck },
          { href: "/settings/audit", label: "Audit history", icon: ClipboardList },
        ] : [])].map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={businessId ? `${href}?business=${encodeURIComponent(businessId)}` : href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean md:w-full ${
              active
                ? "bg-soft-sea text-ocean"
                : "text-muted hover:bg-cloud hover:text-ocean"
            }`}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
            <NavigationPending />
          </Link>
        );
      })}
    </nav>
  );
}
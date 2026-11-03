"use client";

import { Bell, Building2, CalendarCheck, CalendarDays, ChartColumn, CircleHelp, ClipboardCheck, Clock, History, Hourglass, LayoutDashboard, Megaphone, Menu, ShieldCheck, Timer, UsersRound, Wallet, X } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";

type NavigationItem = { href: string; label: string; icon: typeof Bell };

const everyday: NavigationItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/my-schedule", label: "My schedule", icon: CalendarCheck },
  { href: "/attendance", label: "Clock in / out", icon: Timer },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
  { href: "/roster", label: "Rostering", icon: CalendarDays },
  { href: "/availability", label: "Availability", icon: Clock },
  { href: "/help", label: "Help", icon: CircleHelp },
];

const team: NavigationItem[] = [
  { href: "/timesheets", label: "Timesheet review", icon: ClipboardCheck },
  { href: "/work-time", label: "Work time", icon: Hourglass },
  { href: "/reports/exceptions", label: "Exceptions report", icon: ChartColumn },
  { href: "/people", label: "People", icon: UsersRound },
  { href: "/settings/departments", label: "Departments", icon: Building2 },
];

const managerRoles = ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"];

function navigationGroups(role: string) {
  return [
    { label: "Everyday", items: everyday },
    { label: "Team", items: managerRoles.includes(role) ? team : [] },
    {
      label: "Business",
      items: [
        ...(["owner", "admin"].includes(role) ? [{ href: "/settings/payroll", label: "Payroll", icon: Wallet }] : []),
        ...(role === "owner" ? [
          { href: "/reports/hours", label: "Hours and labour", icon: ChartColumn },
          { href: "/settings/permissions", label: "Permissions", icon: ShieldCheck },
          { href: "/settings/audit", label: "Audit history", icon: History },
        ] : []),
      ],
    },
  ].filter((group) => group.items.length > 0);
}

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
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const groups = navigationGroups(role);
  const isActive = (href: string) => (href === "/" ? pathname === href :
    pathname.startsWith(href) || (href === "/settings/departments" && pathname === "/settings/organisation"));
  const current = groups.flatMap((group) => group.items).find((item) => isActive(item.href));

  return (
    <nav aria-label="Main navigation" className="px-3 pb-3 md:pb-4"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}>
      <button ref={toggle} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ocean focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean md:hidden">
        {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        Menu
        {current && <span aria-hidden="true" className="ml-auto truncate font-medium text-muted">{current.label}</span>}
      </button>
      <div id={panelId} className={`${open ? "mt-2 grid" : "hidden"} grid-cols-2 gap-x-1 gap-y-3 md:mt-0 md:block md:space-y-4`}>
        {groups.map((group) => {
          const labelId = `${panelId}-${group.label.toLowerCase()}`;
          const labelled = groups.length > 1;
          return (
            <div key={group.label} role={labelled ? "group" : undefined} aria-labelledby={labelled ? labelId : undefined}
              className="col-span-2 grid grid-cols-2 gap-1 md:block md:space-y-0.5">
              {labelled && <p id={labelId}
                className="col-span-2 px-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                {group.label}
              </p>}
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={businessId ? `${href}?business=${encodeURIComponent(businessId)}` : href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean md:min-h-10 md:w-full md:px-4 ${
                      active
                        ? "bg-soft-sea text-ocean"
                        : "text-muted hover:bg-cloud hover:text-ocean"
                    }`}
                  >
                    <Icon size={18} aria-hidden="true" className="shrink-0" />
                    {label}
                    <NavigationPending />
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

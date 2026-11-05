"use client";

import {
  Bell, Building2, CalendarCheck, CalendarDays, ChartColumn, CircleHelp, ClipboardCheck, Clock, History,
  Hourglass, LayoutDashboard, Megaphone, Menu, Settings2, ShieldCheck, Tablet, Timer, UsersRound, Wallet, X,
  type LucideIcon,
} from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";
import {
  activeNavigationItem, helpNavigation, navigationGroups, navigationHref, type NavigationIcon, type NavigationItem,
} from "@/lib/navigation";

const icons: Record<NavigationIcon, LucideIcon> = {
  dashboard: LayoutDashboard, schedule: CalendarCheck, clock: Timer, availability: Clock, notifications: Bell,
  roster: CalendarDays, people: UsersRound, announcements: Megaphone, timesheets: ClipboardCheck, "work-time": Hourglass,
  exceptions: ChartColumn, kiosks: Tablet, departments: Building2, "venue-settings": Settings2, payroll: Wallet,
  hours: ChartColumn, permissions: ShieldCheck, audit: History, help: CircleHelp,
};

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

export function MainNavigation({ role, businessId, venueId }: { role: string; businessId?: string; venueId: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const groups = navigationGroups(role);
  const current = activeNavigationItem(pathname, [...groups.flatMap((group) => group.items), helpNavigation]);
  const renderItem = (item: NavigationItem) => {
    const Icon = icons[item.icon];
    const active = current?.href === item.href;
    return <Link key={item.href} href={navigationHref(item, businessId, venueId)}
      aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}
      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean md:w-full md:px-4 ${
        active ? "bg-soft-sea text-ocean" : "text-muted hover:bg-cloud hover:text-ocean"
      }`}>
      <Icon size={18} aria-hidden="true" className="shrink-0" />
      {item.label}
      <NavigationPending />
    </Link>;
  };

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
      <div id={panelId} className={`${open ? "mt-2 block" : "hidden"} max-h-[70vh] space-y-4 overflow-y-auto overscroll-contain md:mt-0 md:block md:max-h-none md:overflow-visible`}>
        {groups.map((group) => {
          const labelId = `${panelId}-${group.id}`;
          return (
            <div key={group.id} role="group" aria-labelledby={labelId} className="space-y-0.5">
              <p id={labelId}
                className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                {group.label}
              </p>
              {group.items.map(renderItem)}
            </div>
          );
        })}
        <div className="border-t border-line pt-2">{renderItem(helpNavigation)}</div>
      </div>
    </nav>
  );
}

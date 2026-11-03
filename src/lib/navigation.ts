export type NavigationIcon =
  | "dashboard" | "schedule" | "clock" | "availability" | "notifications" | "roster" | "people"
  | "announcements" | "timesheets" | "work-time" | "exceptions" | "kiosks" | "departments"
  | "venue-settings" | "payroll" | "hours" | "permissions" | "audit" | "help";

export type NavigationItem = {
  href: string;
  label: string;
  icon: NavigationIcon;
  context: "venue" | "business";
  roles?: readonly string[];
};

export type NavigationGroup = {
  id: string;
  label: string;
  items: readonly NavigationItem[];
};

const managers = ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"];
const owners = ["owner"];
const payrollManagers = ["owner", "admin"];

const groups: readonly NavigationGroup[] = [
  {
    id: "my-work", label: "My Work", items: [
      { href: "/", label: "Dashboard", icon: "dashboard", context: "venue" },
      { href: "/my-schedule", label: "My schedule", icon: "schedule", context: "venue" },
      { href: "/attendance", label: "Clock in / out", icon: "clock", context: "venue" },
      { href: "/availability", label: "My availability", icon: "availability", context: "venue" },
      { href: "/notifications", label: "Notifications", icon: "notifications", context: "venue" },
    ],
  },
  {
    id: "team-management", label: "Team Management", items: [
      { href: "/roster", label: "Rostering", icon: "roster", context: "venue" },
      { href: "/people", label: "People", icon: "people", context: "venue", roles: managers },
      { href: "/announcements", label: "Announcements", icon: "announcements", context: "venue" },
      { href: "/timesheets", label: "Timesheet review", icon: "timesheets", context: "venue", roles: managers },
      { href: "/work-time", label: "Work time", icon: "work-time", context: "venue", roles: managers },
      { href: "/reports/exceptions", label: "Exceptions", icon: "exceptions", context: "venue", roles: managers },
    ],
  },
  {
    id: "venue-management", label: "Venue Management", items: [
      { href: "/attendance/kiosks", label: "Clock kiosks", icon: "kiosks", context: "venue", roles: owners },
      { href: "/settings/departments", label: "Departments & roles", icon: "departments", context: "venue", roles: managers },
      { href: "/settings/organisation", label: "Venue settings", icon: "venue-settings", context: "venue", roles: owners },
    ],
  },
  {
    id: "business", label: "Business", items: [
      { href: "/settings/payroll", label: "Payroll", icon: "payroll", context: "venue", roles: payrollManagers },
      { href: "/reports/hours", label: "Hours & labour", icon: "hours", context: "business", roles: owners },
      { href: "/settings/permissions", label: "Permissions", icon: "permissions", context: "business", roles: owners },
      { href: "/settings/audit", label: "Audit history", icon: "audit", context: "business", roles: owners },
    ],
  },
];

export const helpNavigation: NavigationItem = {
  href: "/help", label: "Help", icon: "help", context: "business",
};

export function navigationGroups(role: string): NavigationGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

export function activeNavigationItem(pathname: string, items: readonly NavigationItem[]): NavigationItem | undefined {
  return items.filter(({ href }) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`),
  ).sort((left, right) => right.href.length - left.href.length)[0];
}

export function navigationHref(item: NavigationItem, businessId?: string, venueId?: string): string {
  const params = new URLSearchParams();
  if (businessId) params.set("business", businessId);
  if (venueId) params.set(item.context === "venue" ? "venue" : "contextVenue", venueId);
  return `${item.href}${params.size ? `?${params}` : ""}`;
}

import {
  CalendarDays,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Settings,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { signOutAction } from "@/app/actions";

type AppShellProps = {
  children: React.ReactNode;
  businessName: string;
  venueName: string;
  email: string;
  role: string;
};

const links = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/roster", label: "Weekly roster", icon: CalendarDays },
];

export function AppShell({
  children,
  businessName,
  venueName,
  email,
  role,
}: AppShellProps) {
  return (
    <div className="min-h-screen md:flex">
      <aside className="flex w-full shrink-0 flex-col bg-[#173d32] text-white md:fixed md:inset-y-0 md:w-[246px]">
        <Link href="/" className="flex items-center gap-3 px-6 py-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4d56d] text-lg font-black text-[#173d32]">
            b
          </span>
          <span className="text-xl font-semibold tracking-tight">butterbox</span>
        </Link>
        <div className="mx-4 mb-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="truncate text-sm font-semibold">{businessName}</p>
          <p className="mt-1 truncate text-xs text-white/60">{venueName}</p>
        </div>
        <nav aria-label="Main navigation" className="flex gap-2 px-3 md:block md:space-y-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </Link>
          ))}
          <span className="hidden items-center gap-3 rounded-xl px-4 py-3 text-sm text-white/40 md:flex">
            <UsersRound size={18} aria-hidden="true" />
            Team <span className="ml-auto text-[10px] uppercase tracking-wide">Soon</span>
          </span>
        </nav>
        <div className="mt-auto hidden space-y-1 px-3 pb-5 md:block">
          <span className="flex items-center gap-3 px-4 py-3 text-sm text-white/50">
            <Settings size={17} aria-hidden="true" />
            Settings
          </span>
          <a
            href="mailto:support@butterbox.app"
            className="flex items-center gap-3 px-4 py-3 text-sm text-white/50 hover:text-white"
          >
            <CircleHelp size={17} aria-hidden="true" />
            Help
          </a>
        </div>
      </aside>
      <div className="min-w-0 flex-1 md:ml-[246px]">
        <header className="flex min-h-[72px] items-center justify-between border-b border-[#e6e8df] bg-white/80 px-5 sm:px-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#747d77]">
              Venue workspace
            </p>
            <p className="mt-1 text-sm font-semibold">{venueName}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-48 truncate text-sm font-medium">{email}</p>
              <p className="mt-0.5 text-xs capitalize text-[#747d77]">
                {role.replaceAll("_", " ")}
              </p>
            </div>
            <div
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e6eee8] text-sm font-semibold text-[#173d32]"
            >
              {email.charAt(0).toUpperCase()}
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="rounded-lg p-2 text-[#747d77] hover:bg-[#f1f2eb] hover:text-[#173d32]"
              >
                <LogOut size={18} aria-hidden="true" />
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-8 sm:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}

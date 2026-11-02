import { ArrowLeftRight, CircleHelp, LogOut } from "lucide-react";
import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { BrandLockup } from "@/components/brand-lockup";
import { MainNavigation } from "@/components/main-navigation";

type AppShellProps = {
  children: React.ReactNode;
  businessName: string;
  businessId?: string;
  businessCount?: number;
  venueName: string;
  email: string;
  role: string;
};

export function AppShell({
  children,
  businessName,
  businessId,
  businessCount = 1,
  venueName,
  email,
  role,
}: AppShellProps) {
  const pinnedBusiness = businessCount > 1 ? businessId : undefined;
  return (
    <div className="min-h-screen bg-[#f5f9f8] md:flex">
      <a href="#main-content"
        className="sr-only z-50 rounded-lg bg-ocean px-4 py-3 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to main content
      </a>
      <aside className="border-b border-line bg-white md:fixed md:inset-y-0 md:z-20 md:flex md:w-[246px] md:flex-col md:border-b-0 md:border-r">
        <Link href={pinnedBusiness ? `/?business=${encodeURIComponent(pinnedBusiness)}` : "/"}
          className="flex items-center gap-3 px-5 py-5 md:px-6 md:py-6">
          <BrandLockup compact />
        </Link>
        <div className="mx-4 mb-3 rounded-lg border border-line bg-cloud px-4 py-3 md:mb-5">
          <p className="truncate text-sm font-semibold text-ink">{businessName}</p>
          <p className="mt-1 truncate text-xs text-muted">{venueName}</p>
          {businessCount > 1 && <Link href="/choose-business"
            className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md text-xs font-semibold text-ocean underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean">
            <ArrowLeftRight size={14} aria-hidden="true" />
            Switch business
          </Link>}
        </div>
        <MainNavigation role={role} businessId={pinnedBusiness} />
        <div className="mt-auto hidden space-y-1 px-3 pb-5 md:block">
          <a
            href="mailto:support@butterbox.app"
            className="flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-sm text-muted hover:bg-cloud hover:text-ocean"
          >
            <CircleHelp size={17} aria-hidden="true" />
            Contact support
          </a>
        </div>
      </aside>
      <div className="min-w-0 flex-1 md:ml-[246px]">
        <header className="flex min-h-[72px] items-center justify-between border-b border-line bg-white px-5 sm:px-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              PEOPLE <span className="px-1 text-sea-glass">·</span> PLACES <span className="px-1 text-sea-glass">·</span> HOSPITALITY <span className="px-1 text-sea-glass">·</span> PROGRESS
            </p>
            <p className="mt-1 text-sm font-semibold">{venueName}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-48 truncate text-sm font-medium">{email}</p>
              <p className="mt-0.5 text-xs capitalize text-muted">
                {role.replaceAll("_", " ")}
              </p>
            </div>
            <div
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-soft-sea text-sm font-semibold text-ocean"
            >
              {email.charAt(0).toUpperCase()}
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="min-h-10 min-w-10 rounded-lg p-2 text-muted hover:bg-soft-sea hover:text-ocean focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean"
              >
                <LogOut size={18} aria-hidden="true" />
              </button>
            </form>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-5 py-6 outline-none sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

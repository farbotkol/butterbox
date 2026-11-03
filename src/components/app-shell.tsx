import { ArrowLeftRight, LifeBuoy, LogOut } from "lucide-react";
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
  venueId: string;
  email: string;
  role: string;
};

export function AppShell({
  children,
  businessName,
  businessId,
  businessCount = 1,
  venueName,
  venueId,
  email,
  role,
}: AppShellProps) {
  const pinnedBusiness = businessCount > 1 ? businessId : undefined;
  const homeParams = new URLSearchParams({ ...(pinnedBusiness ? { business: pinnedBusiness } : {}), venue: venueId });
  return (
    <div className="min-h-screen bg-[#f5f9f8] md:flex">
      <a href="#main-content"
        className="sr-only z-50 rounded-lg bg-ocean px-4 py-3 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to main content
      </a>
      <aside className="border-b border-line bg-white md:fixed md:inset-y-0 md:z-20 md:flex md:w-[246px] md:flex-col md:overflow-y-auto md:overscroll-contain md:border-b-0 md:border-r">
        <Link href={`/?${homeParams}`}
          className="flex items-center gap-3 px-5 py-4 md:px-6 md:py-5">
          <BrandLockup compact />
        </Link>
        <div className="mx-4 mb-3 rounded-lg border border-line bg-cloud px-4 py-3 md:mb-4">
          <p className="truncate text-sm font-semibold text-ink">{businessName}</p>
          <p className="mt-1 truncate text-xs text-muted">{venueName}</p>
          {businessCount > 1 && <Link href="/choose-business"
            className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md text-xs font-semibold text-ocean underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean">
            <ArrowLeftRight size={14} aria-hidden="true" />
            Switch business
          </Link>}
        </div>
        <MainNavigation role={role} businessId={pinnedBusiness} venueId={venueId} />
        <div className="mt-auto hidden border-t border-line px-3 py-3 md:block">
          <a
            href="mailto:support@butterbox.app"
            className="flex min-h-10 items-center gap-3 rounded-lg px-4 py-2 text-sm text-muted hover:bg-cloud hover:text-ocean focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean"
          >
            <LifeBuoy size={17} aria-hidden="true" />
            Contact support
          </a>
        </div>
      </aside>
      <div className="min-w-0 flex-1 md:ml-[246px]">
        <header className="flex min-h-[72px] items-center justify-between border-b border-line bg-white px-5 sm:px-8">
          <div>
            <p className="hidden text-xs font-medium text-muted sm:block">Less admin. More good days.</p>
            <p className="text-sm font-semibold sm:mt-1">{venueName}</p>
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

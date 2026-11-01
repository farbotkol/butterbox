import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLockup } from "@/components/brand-lockup";
import { CoastalIllustration } from "@/components/coastal-illustration";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-white lg:grid lg:grid-cols-[0.94fr_1.06fr]">
      <section className="relative flex min-h-[290px] flex-col overflow-hidden bg-soft-sea px-6 py-6 sm:px-10 lg:min-h-screen lg:px-[clamp(2rem,6vw,6rem)] lg:py-10">
        <Link href="/login" aria-label="Butterbox Systems sign in" className="relative z-10 w-fit">
          <BrandLockup />
        </Link>
        <div className="relative z-10 mt-8 max-w-lg lg:mb-4 lg:mt-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean/70">
            Made for hospitality
          </p>
          <h1 className="mt-3 max-w-md font-display text-[36px] font-semibold leading-[1.13] text-ocean sm:text-[44px] lg:text-[52px]">
            Less admin. More good days.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-7 text-muted sm:text-base">
            A calmer way to plan the week, look after your team and keep your venue moving.
          </p>
        </div>
        <CoastalIllustration className="-mx-6 mt-3 h-[90px] w-[calc(100%+3rem)] sm:-mx-10 sm:w-[calc(100%+5rem)] lg:mx-0 lg:mb-3 lg:mt-0 lg:h-[190px] lg:w-full" />
      </section>
      <section className="flex min-h-[calc(100vh-290px)] items-start justify-center bg-white px-6 py-10 sm:px-10 lg:min-h-screen lg:items-center lg:py-14">
        <div className="w-full max-w-[420px]">{children}</div>
      </section>
    </main>
  );
}
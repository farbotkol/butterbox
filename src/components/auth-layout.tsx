import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLockup } from "@/components/brand-lockup";
import { CoastalIllustration } from "@/components/coastal-illustration";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-white lg:grid lg:grid-cols-[0.94fr_1.06fr]">
      <section className="relative flex min-h-[300px] flex-col overflow-hidden bg-brand-shell px-6 pt-6 sm:px-10 lg:min-h-screen lg:px-[clamp(2rem,6vw,6rem)] lg:pt-10">
        <Link href="/login" className="relative z-10 w-fit rounded-md">
          <BrandLockup />
          <span className="sr-only"> sign in</span>
        </Link>
        <div className="relative z-10 mt-8 max-w-lg lg:mt-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean">
            Made for hospitality
          </p>
          <h1 className="mt-3 max-w-md font-display text-[36px] font-semibold leading-[1.13] text-ocean sm:text-[44px] lg:text-[52px]">
            Less admin. More good days.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-7 text-muted sm:text-base">
            A calmer way to plan the week, look after your team and keep your venue moving.
          </p>
        </div>
        <CoastalIllustration className="-mx-6 mt-4 h-[110px] w-[calc(100%+3rem)] shrink-0 sm:-mx-10 sm:h-[150px] sm:w-[calc(100%+5rem)] lg:-mx-[clamp(2rem,6vw,6rem)] lg:mt-6 lg:h-[clamp(200px,36vh,380px)] lg:w-[calc(100%+clamp(4rem,12vw,12rem))]" />
      </section>
      <section className="flex min-h-[calc(100vh-290px)] items-start justify-center bg-white px-6 py-10 sm:px-10 lg:min-h-screen lg:items-center lg:py-14">
        <div className="w-full max-w-[420px]">{children}</div>
      </section>
    </main>
  );
}
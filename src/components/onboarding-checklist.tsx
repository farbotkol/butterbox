import Link from "next/link";
import { helpHref } from "@/lib/help";
import type { OnboardingProgress } from "@/lib/onboarding";

export function OnboardingChecklist({ progress, venueId, businessId }: {
  progress: OnboardingProgress; venueId: string; businessId: string;
}) {
  const rosterUrl = `/roster?venue=${encodeURIComponent(venueId)}`;
  const steps = [
    { title: "Business", done: progress.business_ready, help: "Your business is created during setup." },
    { title: "Venue", done: progress.venue_ready, help: "Review your venue and departments.",
      href: "/settings/organisation", link: "Open departments" },
    { title: "Staff", done: progress.staff_ready, help: "Add an active team member before assigning shifts.",
      href: `/people?venue=${encodeURIComponent(venueId)}`, link: "Add staff" },
    { title: "Shift", done: progress.shift_ready, help: "Create a draft shift on the weekly roster.",
      href: rosterUrl, link: "Create a shift" },
    { title: "Publish", done: progress.publication_ready,
      help: "Choose a department and publish its drafts. Unlinked staff cannot yet see in-app updates.",
      href: rosterUrl, link: "Open the roster" },
  ];
  const completed = steps.filter((step) => step.done).length;

  return (
    <section aria-labelledby="onboarding-heading" className="mt-5 rounded-lg border border-line bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="onboarding-heading" className="text-lg font-semibold">Get your first roster ready</h2>
        <p className="text-sm text-muted">{completed} of {steps.length} steps complete</p>
      </div>
      <Link href={helpHref("onboarding", businessId)} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
        Help with your first roster
      </Link>
      <ol className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {steps.map((step) => (
          <li key={step.title} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{step.title}</h3>
              <span className={step.done ? "text-ocean" : "text-muted"}>
                {step.done ? "Complete" : "To do"}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">{step.help}</p>
            {step.href && <Link href={step.href} className="mt-2 inline-block text-xs font-semibold text-ocean underline">
              {step.link}
            </Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}

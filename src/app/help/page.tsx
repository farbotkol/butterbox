import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppShell } from "@/components/app-shell";
import { helpAnchor, helpHref, helpMarkdownOptions, helpTopics, searchHelp } from "@/lib/help";
import { isShowcase } from "@/lib/showcase";
import { getWorkspace } from "@/lib/workspace";

type HelpParams = { business?: string; contextVenue?: string; q?: string | string[]; category?: string | string[]; topic?: string | string[] };

export default async function HelpPage({ searchParams }: { searchParams: Promise<HelpParams> }) {
  const params = await searchParams;
  const workspace = await getWorkspace(undefined, {
    businessId: params.business, venueHint: params.contextVenue, page: true,
  });
  if (workspace.status === "anonymous") redirect("/login?message=session-ended");
  if (workspace.status === "error") {
    console.error("Could not load help workspace.", { message: workspace.message });
    return <main className="mx-auto mt-20 max-w-lg rounded-xl bg-white p-8">
      <h1 className="text-xl font-semibold">Help unavailable</h1>
      <p role="alert" className="mt-3">We could not verify your business access. Choose an available business and try again.</p>
      <Link href="/choose-business" className="mt-4 inline-block font-semibold text-ocean underline">Choose a business</Link>
    </main>;
  }
  const ready = workspace.status === "ready";
  const businessId = ready ? workspace.business.id : undefined;
  const contextVenueId = ready ? workspace.venue.id : undefined;
  const role = ready ? workspace.membership.role : "new_owner";
  const source = await readFile(path.join(process.cwd(), "docs", "USER_GUIDE.md"), "utf8");
  const topics = helpTopics(source, role, isShowcase());
  const categories = [...new Set(topics.map((topic) => topic.category))];
  const invalid = (params.q !== undefined && (typeof params.q !== "string" || params.q.length > 160)) ||
    (params.category !== undefined && (typeof params.category !== "string" ||
      (params.category !== "" && !categories.includes(params.category))));
  const query = typeof params.q === "string" && params.q.length <= 160 ? params.q : "";
  const category = typeof params.category === "string" ? params.category : "";
  const selected = params.topic === undefined ? undefined : topics.find((topic) => topic.id === params.topic);
  if (params.topic !== undefined && !selected) notFound();
  const results = invalid ? [] : searchHelp(topics, query, category);
  const content = <>
    <h1 className="text-3xl font-semibold">Help Center</h1>
    <p className="mt-3 text-sm leading-6 text-muted">
      Task guidance for your current role. Access still depends on your business, venue and department permissions.
      These instructions do not certify production availability, award calculations or payroll compliance.
    </p>
    <form action="/help" className="mt-5 grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      {businessId && <input type="hidden" name="business" value={businessId} />}
      {contextVenueId && <input type="hidden" name="contextVenue" value={contextVenueId} />}
      <div className="min-w-0 text-sm font-medium">
        <label htmlFor="help-query" className="block">Search help</label>
        <input id="help-query" type="search" name="q" maxLength={160} defaultValue={query}
          className="mt-1 block min-h-11 w-full rounded-lg border border-line p-2" />
      </div>
      <div className="min-w-0 text-sm font-medium">
        <label htmlFor="help-category" className="block">Category</label>
        <select id="help-category" name="category" defaultValue={categories.includes(category) ? category : ""}
          className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-white p-2">
          <option value="">All categories</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white">Search</button>
    </form>
    {invalid ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-900">
      Enter a single search of up to 160 characters and choose an available category.
    </p> : <section aria-labelledby="help-results-heading" className="mt-6">
      <h2 id="help-results-heading" className="text-lg font-semibold">Browse tasks</h2>
      <p role="status" className="mt-2 text-sm text-muted">{results.length} {results.length === 1 ? "task" : "tasks"} found.</p>
      {results.length ? <nav aria-label="Help topics" className="mt-3">
        <ul className="grid gap-3 sm:grid-cols-2">
          {results.map((topic) => <li key={topic.id} className="min-w-0 rounded-lg border border-line bg-white p-4">
            <p className="text-xs text-muted">{topic.category}</p>
            <Link href={helpHref(topic.id, businessId, contextVenueId)} className="mt-1 inline-flex min-h-11 items-center font-semibold text-ocean underline">
              {topic.title}
            </Link>
          </li>)}
        </ul>
      </nav> : <p className="mt-3 rounded-lg border border-line bg-white p-4 text-sm">
        No help topics match your search. Try another keyword or choose All categories.
      </p>}
    </section>}
    {selected && <article aria-labelledby={selected.anchor}
      className="mt-6 min-w-0 rounded-xl border border-line bg-white p-5 leading-7 [overflow-wrap:anywhere] [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_table]:w-full [&_table]:text-left [&_td]:border [&_td]:border-line [&_td]:p-2 [&_th]:border [&_th]:border-line [&_th]:p-2 [&_ul]:list-disc [&_ul]:pl-6">
      <h2 id={selected.anchor} className="text-xl font-semibold">{selected.title}</h2>
      <Markdown {...helpMarkdownOptions(topics, businessId, contextVenueId)} remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => href
            ? <Link href={href} className="font-semibold text-ocean underline">{children}</Link>
            : <span>{children}</span>,
          h3: ({ children }) => <h3 id={typeof children === "string" ? helpAnchor(children) : undefined}>{children}</h3>,
          h4: ({ children }) => <h3 id={typeof children === "string" ? helpAnchor(children) : undefined}>{children}</h3>,
        }}>
        {selected.markdown}
      </Markdown>
      <Link href={helpHref(undefined, businessId, contextVenueId)} className="mt-5 inline-flex min-h-11 items-center font-semibold text-ocean underline">All help topics</Link>
    </article>}
    <aside aria-label="Help limitations" className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6">
      External notification channels, live payroll adapters and independent Award Central calculations are not generally available.
      Contact your owner for access problems. Never change recorded time or send payroll merely because a help article describes a control.
    </aside>
  </>;
  return ready ? <AppShell businessName={workspace.business.name} businessId={businessId}
    businessCount={workspace.businesses.length} venueId={workspace.venue.id} venueName={workspace.venue.name}
    email={workspace.user.email ?? ""} role={workspace.membership.role}>{content}</AppShell>
    : <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/setup" className="mb-5 inline-block font-semibold text-ocean underline">Back to setup</Link>
      {content}
    </main>;
}

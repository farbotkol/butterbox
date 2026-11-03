const managers = ["owner", "admin", "general_manager", "foh_manager", "boh_manager", "department_manager"];
const members = [...managers, "employee"];
const allRoles = [...members, "new_owner"];

type TopicDefinition = {
  id: string;
  title: string;
  heading: string;
  category: string;
  roles: readonly string[];
  leadOnly?: boolean;
  showcase?: boolean;
};

const definitions: readonly TopicDefinition[] = [
  { id: "onboarding", title: "Getting started", heading: "Getting started — owners", category: "Onboarding", roles: ["owner", "new_owner"], leadOnly: true },
  { id: "accounts", title: "Accounts and business access", heading: "Accounts and business access", category: "Onboarding", roles: allRoles },
  { id: "permissions", title: "Delegating access", heading: "Delegate access and select a venue", category: "People", roles: ["owner"] },
  { id: "people", title: "People and qualifications", heading: "People and availability", category: "People", roles: managers },
  { id: "availability", title: "Availability, leave and preferences", heading: "Maintain availability, leave and preferences", category: "People", roles: members },
  { id: "rosters", title: "Building and publishing rosters", heading: "Rostering", category: "Rosters", roles: managers },
  { id: "shifts", title: "Open shifts and swaps", heading: "Open shifts and swaps", category: "Rosters", roles: members },
  { id: "attendance", title: "Clocking and corrections", heading: "Clock, review location and correct reported time", category: "Attendance", roles: members },
  { id: "offline", title: "Offline attendance", heading: "Use the offline fallback safely", category: "Attendance", roles: members },
  { id: "kiosk", title: "Setting up a QR kiosk", heading: "Set up a QR clock kiosk", category: "Attendance", roles: ["owner"] },
  { id: "alerts", title: "Attendance alerts", heading: "Configure and review attendance alerts", category: "Attendance", roles: managers },
  { id: "timesheets", title: "Reviewing and approving timesheets", heading: "Review, approve and finalise time", category: "Timesheets and payroll", roles: managers },
  { id: "payroll", title: "Preparing and reconciling payroll CSV", heading: "Timesheets and payroll preparation", category: "Timesheets and payroll", roles: ["owner", "admin", "general_manager"] },
  { id: "hours", title: "Hours and labour", heading: "Hours and labour — owners", category: "Timesheets and payroll", roles: ["owner"] },
  { id: "exceptions", title: "Overtime and exceptions", heading: "Overtime and exceptions — managers", category: "Timesheets and payroll", roles: managers },
  { id: "audit", title: "Audit history", heading: "Audit history", category: "Business", roles: ["owner"] },
  { id: "announcements", title: "Announcements", heading: "Announcements", category: "Business", roles: members },
  { id: "employee", title: "Employee self-service", heading: "For employees", category: "Employee", roles: members },
  { id: "troubleshooting", title: "Troubleshooting", heading: "Troubleshooting", category: "Getting help", roles: allRoles },
  { id: "privacy", title: "Privacy and cancellation", heading: "Data privacy and cancellation", category: "Business", roles: allRoles },
  { id: "unavailable", title: "Unavailable capabilities", heading: "Features not yet generally available or accepted", category: "Getting help", roles: allRoles },
  { id: "using-help", title: "Using the Help Center", heading: "Getting help and improving this guide", category: "Getting help", roles: allRoles, leadOnly: true },
  { id: "showcase-owner", title: "Owner showcase walkthrough", heading: "Guided owner and payroll-preparation review", category: "Internal showcase", roles: ["owner"], showcase: true },
  { id: "showcase-manager", title: "Manager showcase walkthrough", heading: "Guided FOH or BOH manager review", category: "Internal showcase", roles: managers, showcase: true },
  { id: "showcase-employee", title: "Employee showcase walkthrough", heading: "Guided employee mobile review", category: "Internal showcase", roles: members, showcase: true },
];

export type HelpTopic = {
  id: string;
  title: string;
  category: string;
  anchor: string;
  anchors: readonly string[];
  markdown: string;
};

export function helpAnchor(heading: string): string {
  return heading.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");
}

function guideSection(source: string, heading: string, leadOnly = false) {
  const lines = source.split(/\r?\n/);
  const matches = lines.flatMap((line, index) => {
    const match = /^(#{2,6}) (.+)$/.exec(line);
    return match?.[2] === heading ? [{ index, level: match[1].length }] : [];
  });
  if (matches.length !== 1) throw new Error(`Help source must contain exactly one "${heading}" section.`);
  const start = matches[0];
  let end = start.index + 1;
  for (; end < lines.length; end++) {
    const next = /^(#{2,6}) /.exec(lines[end]);
    if (next && (leadOnly || next[1].length <= start.level)) break;
  }
  const markdown = lines.slice(start.index + 1, end).join("\n").trim();
  if (!markdown) throw new Error(`Help source section "${heading}" is empty.`);
  const anchors = [helpAnchor(heading), ...markdown.split("\n").flatMap((line) => {
    const match = /^#{2,6} (.+)$/.exec(line);
    return match ? [helpAnchor(match[1])] : [];
  })];
  return { markdown, anchors };
}

export function helpTopics(source: string, role: string, showcase = false): readonly HelpTopic[] {
  if (!allRoles.includes(role)) throw new Error("Unsupported help membership role.");
  return definitions.filter((topic) => topic.roles.includes(role) && (!topic.showcase || showcase))
    .map((topic) => ({
      id: topic.id, title: topic.title, category: topic.category, anchor: helpAnchor(topic.heading),
      ...guideSection(source, topic.heading, topic.leadOnly),
    }));
}

export function searchHelp(topics: readonly HelpTopic[], query: string, category = ""): readonly HelpTopic[] {
  const terms = query.toLocaleLowerCase("en-AU").trim().split(/\s+/).filter(Boolean);
  return topics.filter((topic) => (!category || category === topic.category) &&
    terms.every((term) => `${topic.title} ${topic.category} ${topic.markdown}`.toLocaleLowerCase("en-AU").includes(term)));
}

export function helpHref(topic?: string, businessId?: string, contextVenueId?: string): string {
  const params = new URLSearchParams();
  if (businessId) params.set("business", businessId);
  if (contextVenueId) params.set("contextVenue", contextVenueId);
  if (topic) params.set("topic", topic);
  return `/help${params.size ? `?${params}` : ""}`;
}

export function helpContentHref(href: string, topics: readonly HelpTopic[], businessId?: string, contextVenueId?: string): string | null {
  if (!/^#[a-z0-9-]+$/.test(href)) return null;
  const anchor = href.slice(1);
  const target = topics.find((topic) => topic.anchors.includes(anchor));
  return target ? `${helpHref(target.id, businessId, contextVenueId)}#${anchor}` : null;
}

export function helpMarkdownOptions(topics: readonly HelpTopic[], businessId?: string, contextVenueId?: string) {
  return {
    skipHtml: true,
    disallowedElements: ["img"],
    urlTransform: (url: string) => helpContentHref(url, topics, businessId, contextVenueId) ?? "",
  };
}

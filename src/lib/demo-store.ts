import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  canManage, shiftSchema, validateShift,
  type Session, type Shift, type ShiftInput, type Workspace,
} from "./domain.ts";

const id = (value: string) => {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const demoAccounts = ["owner", "foh", "boh", "employee"] as const;
type DemoAccount = typeof demoAccounts[number];

export function demoEnabled() {
  return process.env.BUTTERBOX_DEMO === "true" &&
    process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

export function createDemoWorkspace(now = new Date()): Workspace {
  const businessId = id("business");
  const venueId = id("venue");
  const departments = [
    { id: id("foh"), venue_id: venueId, name: "Front of House" },
    { id: id("boh"), venue_id: venueId, name: "Back of House" },
  ];
  const jobRoles = departments.map((d, index) => ({
    id: id(`role-${index}`), department_id: d.id, name: index ? "Kitchen team" : "Café team",
  }));
  const names = [
    "Alex", "Blair", "Casey", "Drew", "Ellis", "Frankie", "Georgie", "Harper",
    "Indigo", "Jamie", "Kai", "Logan", "Morgan", "Noel", "Oakley", "Parker",
    "Quinn", "Riley", "Sage", "Taylor", "Val", "Winter", "Wren", "Zion",
  ];
  const employees = names.map((name, i) => ({
    id: id(`employee-${i}`), business_id: businessId,
    user_id: i === 0 ? id("employee-user") : null,
    display_name: `${name} Demo`,
    department_ids: [departments[i < 12 ? 0 : 1].id],
    role_ids: [jobRoles[i < 12 ? 0 : 1].id],
  }));
  // Sample dates are generated in Sydney's local calendar, then expressed as UTC.
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const monday = new Date(`${localDate}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const shifts: Shift[] = [];
  for (let day = 0; day < 7; day++) {
    for (let slot = 0; slot < 6; slot++) {
      const start = new Date(monday);
      // 22:00 UTC is 08:00/09:00 Sydney, including around DST transitions.
      start.setUTCDate(start.getUTCDate() + day - 1);
      start.setUTCHours(22 + slot % 2, 0, 0, 0);
      const dept = slot < 3 ? 0 : 1;
      const employee = employees[dept * 12 + (day * 3 + slot % 3) % 12];
      shifts.push({
        id: id(`shift-${day}-${slot}`), business_id: businessId, venue_id: venueId,
        department_id: departments[dept].id, role_id: jobRoles[dept].id,
        employee_id: slot === 2 && day > 3 ? null : employee.id,
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + 7 * 3600000).toISOString(),
        break_minutes: 30, status: day < 3 ? "published" : "draft", version: 1,
      });
    }
  }
  return {
    business: { id: businessId, name: "Little Wattle Café" },
    venues: [{ id: venueId, business_id: businessId, name: "Carlton", timezone: "Australia/Sydney" }],
    departments, jobRoles, employees, shifts,
  };
}

export function demoSession(account: DemoAccount): Session {
  const data = createDemoWorkspace();
  return {
    userId: id(`${account}-user`), businessId: data.business.id,
    employeeId: account === "employee" ? data.employees[0].id : null,
    displayName: `${account === "owner" ? "Owner" : account.toUpperCase()} Demo`,
    role: account === "owner" ? "owner" : account === "employee" ? "employee" : "department_manager",
    venueIds: [data.venues[0].id],
    departmentIds: account === "foh" ? [id("foh")] : account === "boh" ? [id("boh")] : [],
    permissions: account === "employee" ? [] : ["manage_roster", "publish_roster", ...(account === "owner" ? ["manage_employees" as const] : [])],
  };
}

export function scopeWorkspace(session: Session, data: Workspace): Workspace {
  if (session.businessId !== data.business.id) throw new Error("Business access denied.");
  const venues = data.venues.filter(v => session.role === "owner" || session.venueIds.includes(v.id));
  const departments = data.departments.filter(d => venues.some(v => v.id === d.venue_id) &&
    (session.role === "owner" || session.role === "general_manager" ||
      session.departmentIds.includes(d.id) ||
      (session.role === "employee" && data.employees.some(e => e.id === session.employeeId && e.department_ids.includes(d.id)))));
  return {
    business: data.business, venues, departments,
    jobRoles: data.jobRoles.filter(r => departments.some(d => d.id === r.department_id)),
    employees: data.employees.filter(e => session.role === "employee" ? e.id === session.employeeId :
      e.department_ids.some(d => departments.some(visible => visible.id === d))),
    shifts: data.shifts.filter(s => departments.some(d => d.id === s.department_id) &&
      (session.role !== "employee" || (s.employee_id === session.employeeId && s.status === "published"))),
  };
}

/** Persistent local test double. Production always uses Supabase and RLS. */
export class DemoStore {
  private db: DatabaseSync;
  private passwordSalt = randomBytes(16);
  private passwordHash = scryptSync("butterbox-demo", this.passwordSalt, 32);
  constructor(path = resolve(process.cwd(), ".local/butterbox.sqlite")) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, before_value TEXT, after_value TEXT, created_at TEXT NOT NULL);
    `);
    this.db.prepare("INSERT OR IGNORE INTO workspace VALUES (1, ?)").run(JSON.stringify(createDemoWorkspace()));
  }
  close() { this.db.close(); }
  private read(): Workspace {
    return JSON.parse((this.db.prepare("SELECT body FROM workspace WHERE id=1").get() as { body: string }).body);
  }
  workspace(session: Session) { return scopeWorkspace(session, this.read()); }
  login(email: string, password: string): string | null {
    const key = digest(email.toLowerCase());
    const now = Date.now();
    this.db.prepare("DELETE FROM login_attempts WHERE expires < ?").run(now);
    this.db.prepare("DELETE FROM sessions WHERE expires < ?").run(now);
    const attempts = this.db.prepare("SELECT attempts FROM login_attempts WHERE key=?").get(key) as { attempts: number } | undefined;
    if (attempts && attempts.attempts >= 10) return null;
    this.db.prepare("INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1").run(key, now + 15 * 60000);
    const account = demoAccounts.find(a => email === `${a}@demo.butterbox.test`);
    const correct = timingSafeEqual(scryptSync(password, this.passwordSalt, 32), this.passwordHash);
    if (!account || !correct) return null;
    const token = randomBytes(32).toString("hex");
    this.db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(digest(token), account, now + 8 * 3600000);
    return token;
  }
  session(token: string): Session | null {
    const row = this.db.prepare("SELECT account FROM sessions WHERE token_hash=? AND expires>?").get(digest(token), Date.now()) as { account: DemoAccount } | undefined;
    return row ? demoSession(row.account) : null;
  }
  logout(token: string) { this.db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token)); }
  private mutate(session: Session, action: string, run: (data: Workspace) => void) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const data = this.read();
      scopeWorkspace(session, data);
      const before = JSON.stringify(data.shifts);
      run(data);
      this.db.prepare("UPDATE workspace SET body=? WHERE id=1").run(JSON.stringify(data));
      this.db.prepare("INSERT INTO audit_logs(actor,action,before_value,after_value,created_at) VALUES (?,?,?,?,?)")
        .run(session.userId, action, before, JSON.stringify(data.shifts), new Date().toISOString());
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  saveShift(session: Session, raw: ShiftInput) {
    const input = shiftSchema.parse(raw);
    this.mutate(session, "save_shift", data => {
      validateShift(session, data, input);
      const existing = input.id ? data.shifts.find(s => s.id === input.id) : null;
      if (input.id && (!existing || existing.version !== input.version))
        throw new Error("This shift changed. Refresh and try again.");
      if (existing) {
        const source = data.departments.find(d => d.id === existing.department_id);
        if (!source || !canManage(session, source)) throw new Error("Shift access denied.");
      }
      if (existing?.status === "published") throw new Error("Published shifts cannot be edited in this release.");
      const shift: Shift = {
        ...input, id: existing?.id ?? crypto.randomUUID(), business_id: session.businessId,
        status: "draft", version: (existing?.version ?? 0) + 1,
      };
      if (existing) data.shifts[data.shifts.indexOf(existing)] = shift;
      else data.shifts.push(shift);
    });
  }
  deleteShift(session: Session, shiftId: string, version: number) {
    this.mutate(session, "delete_shift", data => {
      const shift = data.shifts.find(s => s.id === shiftId);
      const department = data.departments.find(d => d.id === shift?.department_id);
      if (!shift || !department || !canManage(session, department)) throw new Error("Shift access denied.");
      if (shift.status !== "draft" || shift.version !== version) throw new Error("Only unchanged draft shifts can be deleted.");
      data.shifts = data.shifts.filter(s => s.id !== shiftId);
    });
  }
  publish(session: Session, venueId: string, departmentId: string, start: string, end: string) {
    const from = Date.parse(start), to = Date.parse(end);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 8 * 86400000)
      throw new Error("Choose a valid roster week.");
    this.mutate(session, "publish_roster", data => {
      const department = data.departments.find(d => d.id === departmentId && d.venue_id === venueId);
      if (!department || !canManage(session, department) || !session.permissions.includes("publish_roster"))
        throw new Error("You cannot publish this department.");
      for (const shift of data.shifts) {
        if (shift.department_id === departmentId && shift.status === "draft" &&
            Date.parse(shift.starts_at) >= from && Date.parse(shift.starts_at) < to) {
          shift.status = "published";
          shift.version++;
        }
      }
    });
  }
}

let store: DemoStore | undefined;
export function getDemoStore() {
  if (!demoEnabled()) throw new Error("Local demo mode is disabled.");
  return store ??= new DemoStore();
}

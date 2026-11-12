import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const manifestPath = fileURLToPath(new URL('./components.json', import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const knownComponents = new Set(manifest.components.map(component => component.id));
const dynamicPrefixes = ['application:', 'ci:', 'database:', 'docs:', 'evidence:', 'governance:', 'test:'];
const identifier = /^[a-z][a-z0-9-]{0,63}$/;
const databaseIdentifier = /^[a-z][a-z0-9-]{0,20}:[a-z0-9_$."()-]{1,128}$/;
const sqlObjectPattern = /\b(?:create|alter|drop)\s+(?:or\s+replace\s+)?(?:(?:temporary|temp|unlogged)\s+)?(materialized\s+view|table|function|procedure|view|index|sequence|type|domain|trigger|policy)\s+(?:if\s+(?:not\s+)?exists\s+)?("[^"]+"|[a-z_][\w$]*(?:\s*\.\s*(?:"[^"]+"|[a-z_][\w$]*))?)/gi;
const sqlTargetPattern = /\b(?:policy|trigger)\s+("[^"]+"|[a-z_][\w$]*)\s+on\s+("[^"]+"|[a-z_][\w$]*(?:\s*\.\s*(?:"[^"]+"|[a-z_][\w$]*))?)/gi;
const sqlIndexTargetPattern = /\b(?:create|drop)\s+(?:unique\s+)?index(?:\s+(?:if\s+not\s+exists\s+)?("[^"]+"|[a-z_][\w$]*))?\s+on\s+(?:only\s+)?("[^"]+"|[a-z_][\w$]*(?:\s*\.\s*(?:"[^"]+"|[a-z_][\w$]*))?)/gi;

export function normalizeComponents(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20 ||
    value.some(item => typeof item !== 'string' || !(
      knownComponents.has(item) || dynamicPrefixes.some(prefix => {
        if (!item.startsWith(prefix)) return false;
        const suffix = item.slice(prefix.length);
        return prefix === 'database:' ? databaseIdentifier.test(suffix) : identifier.test(suffix);
      })
    ))) return null;
  return [...new Set(value)].sort();
}

function normalizedPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') ||
    value.split('/').includes('..')) return null;
  return path.posix.normalize(value);
}

function migrationComponents(content) {
  const found = new Set();
  for (const match of content.matchAll(sqlObjectPattern)) {
    const [, kind, rawName] = match;
    const name = rawName.replaceAll('"', '').replace(/\s*\.\s*/g, '.').toLowerCase();
    found.add(`database:${kind.replaceAll(' ', '-')}:${name}`);
  }
  for (const match of content.matchAll(sqlTargetPattern)) {
    const [, kind, rawName, rawTarget] = match;
    const name = rawName.replaceAll('"', '').toLowerCase();
    const target = rawTarget.replaceAll('"', '').replace(/\s*\.\s*/g, '.').toLowerCase();
    found.add(`database:${kind}:${name}`);
    found.add(`database:table:${target}`);
  }
  for (const match of content.matchAll(sqlIndexTargetPattern)) {
    const rawIndex = match[1];
    const target = match[2].replaceAll('"', '').replace(/\s*\.\s*/g, '.').toLowerCase();
    if (rawIndex) found.add(`database:index:${rawIndex.replaceAll('"', '').toLowerCase()}`);
    found.add(`database:table:${target}`);
  }
  return found.size ? found : new Set(['database-schema']);
}

export function componentsForFiles(files) {
  const components = new Set();
  for (const file of files) {
    const name = normalizedPath(typeof file === 'string' ? file : file?.path);
    if (!name) return ['repository-wide'];

    if (name.startsWith('docs/agent-status/')) {
      components.add('governance:status');
      continue;
    }
    if (name === 'AGENTS.md') {
      components.add('governance:agents');
      continue;
    }
    if (name === 'docs/DECISION_LOG.md') {
      components.add('governance:decisions');
      continue;
    }
    if (name === 'docs/github-issues-workflow.md') {
      components.add('governance:workflow');
      continue;
    }
    if (['BACKLOG_INDEX.csv', 'BUTTERBOX_PRODUCT_BACKLOG.md', 'IMPLEMENTATION_PROGRESS.md'].includes(name)) {
      components.add('governance:archive');
      continue;
    }

    const evidence = name.match(/^docs\/agent-work\/issues\/issue-(\d+)\//);
    if (evidence) {
      components.add(`evidence:issue-${evidence[1]}`);
      continue;
    }

    const migration = name.startsWith('supabase/migrations/') &&
      (typeof file === 'object' && typeof file.content === 'string');
    if (migration) {
      for (const component of migrationComponents(file.content)) components.add(component);
      continue;
    }
    if (name.startsWith('supabase/migrations/')) {
      components.add('database-schema');
      continue;
    }

    const app = name.match(/^src\/(?:app|components|lib)\/([^/]+)/);
    if (app) {
      const area = (app[1] === 'page.tsx' ? 'shared' : app[1])
        .replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      components.add(`application:${area}`);
      continue;
    }
    if (name.startsWith('src/')) {
      components.add('application');
      continue;
    }

    if (name.startsWith('.github/workflows/')) {
      components.add(`ci:${path.posix.basename(name).replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`);
      continue;
    }
    if (name.startsWith('tests/')) {
      components.add(name.startsWith('tests/helpers/') ? 'tests' :
        `test:${path.posix.basename(name).replace(/\.test\.[^.]+$/, '').toLowerCase()}`);
      continue;
    }
    if (name.startsWith('docs/')) {
      components.add(name.startsWith('docs/agent-work/issues/') ? 'agent-evidence' :
        `docs:${(name.split('/')[1] ?? 'root').replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`);
      continue;
    }

    const mapping = manifest.components.find(component =>
      component.paths?.includes(name) || (component.prefix && name.startsWith(component.prefix))
    );
    components.add(mapping?.id ?? 'repository-wide');
  }
  return [...components].sort();
}

export function databaseObjectsForFiles(files) {
  const result = new Set();
  for (const file of files) {
    const name = normalizedPath(file?.path);
    if (!name?.startsWith('supabase/migrations/')) continue;
    for (const component of migrationComponents(typeof file.content === 'string' ? file.content : '')) {
      result.add(component);
    }
  }
  return [...result].sort();
}

export function declaredComponents(body) {
  if (typeof body !== 'string') return [];
  const match = body.match(/<!-- butterbox-components: (\[[\s\S]*?\]) -->/);
  if (!match) return [];
  try { return normalizeComponents(JSON.parse(match[1])); } catch { return null; }
}

export function componentOverlap(left, right) {
  const a = normalizeComponents(left);
  const b = normalizeComponents(right);
  if (!a || !b) return ['invalid_component_metadata'];
  const conflicts = [];
  for (const first of a) for (const second of b) {
    if (first === 'repository-wide' || second === 'repository-wide' || first === second ||
      (first === 'database-schema' && second.startsWith('database:')) ||
      (second === 'database-schema' && first.startsWith('database:')) ||
      (first === 'application' && second.startsWith('application:')) ||
      (second === 'application' && first.startsWith('application:')) ||
      (first === 'ci' && second.startsWith('ci:')) ||
      (second === 'ci' && first.startsWith('ci:')) ||
      (first === 'tests' && second.startsWith('test:')) ||
      (second === 'tests' && first.startsWith('test:')) ||
      (first === 'governance' && second.startsWith('governance:')) ||
      (second === 'governance' && first.startsWith('governance:')) ||
      (first === 'docs' && second.startsWith('docs:')) ||
      (second === 'docs' && first.startsWith('docs:'))) conflicts.push(first === second ? first : `${first} / ${second}`);
  }
  return [...new Set(conflicts)].sort();
}

export function filesWithinComponents(components, files) {
  const declared = normalizeComponents(components);
  if (!declared) return false;
  const actual = componentsForFiles(files);
  return actual.every(component => componentOverlap(declared, [component]).length > 0);
}

export function findOverlaps(candidate, other) {
  const candidatePaths = new Set(candidate.files.map(file => file.path));
  const otherPaths = new Set(other.files.map(file => file.path));
  const paths = [...candidatePaths].filter(file => otherPaths.has(file)).sort();
  const components = componentOverlap(
    [...(candidate.components ?? []), ...componentsForFiles(candidate.files)],
    [...(other.components ?? []), ...componentsForFiles(other.files)],
  );
  const database = candidate.databaseObjects && other.databaseObjects
    ? componentOverlap(candidate.databaseObjects, other.databaseObjects)
    : [];
  return { paths, components, database, conflicts: paths.length > 0 || components.length > 0 || database.length > 0 };
}

export function pullRequestConflicts(candidate, others) {
  const declared = declaredComponents(candidate.body);
  if (declared === null) return [{ pullRequest: candidate.number, reason: 'invalid_component_metadata' }];
  const left = { components: [...declared, ...(candidate.components ?? [])], files: candidate.files ?? [] };
  const conflicts = [];
  for (const other of others) {
    const otherDeclared = declaredComponents(other.body);
    if (otherDeclared === null) {
      conflicts.push({ pullRequest: other.number, reason: 'invalid_component_metadata' });
      continue;
    }
    const overlap = findOverlaps(left, {
      components: [...otherDeclared, ...(other.components ?? [])],
      files: other.files ?? [],
    });
    if (overlap.conflicts) conflicts.push({ pullRequest: other.number, ...overlap });
  }
  return conflicts;
}

export function leaseConflicts(leases, candidate, now = Date.now()) {
  const conflicts = [];
  for (const lease of leases) {
    if (!Number.isSafeInteger(lease.issue) || !Array.isArray(lease.components) ||
      typeof lease.expiresAt !== 'string' || !Number.isFinite(Date.parse(lease.expiresAt))) {
      return [{ issue: lease.issue ?? null, reason: 'invalid_lease_state' }];
    }
    if (lease.issue === candidate.issue) {
      if (lease.digest !== candidate.digest) return [{ issue: lease.issue, reason: 'issue_digest_changed' }];
      continue;
    }
    const overlap = componentOverlap(lease.components, candidate.components);
    if (overlap.length) conflicts.push({
      issue: lease.issue,
      reason: Date.parse(lease.expiresAt) <= now ? 'expired_unreconciled_lease' : 'active_reservation',
      components: overlap,
      pullRequest: lease.pullRequest ?? null,
      expiresAt: lease.expiresAt,
    });
  }
  return conflicts;
}

export function canReleaseLease(lease, state) {
  if (!lease || !state || state.verified !== true) return false;
  if (state.runActive === true || state.pullRequestOpen === true || state.branchExists === true) return false;
  return state.pullRequestMerged === true || state.safeCancellation === true;
}

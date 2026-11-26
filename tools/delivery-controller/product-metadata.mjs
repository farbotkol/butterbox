import { autonomousDevelopmentMarker } from '../agent-evidence/evidence.mjs';

const target = '(?:https://github\\.com/([\\w.-]+/[\\w.-]+)/issues/|([\\w.-]+/[\\w.-]+)#|#)([1-9]\\d*)';
const directive = new RegExp('\\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\\s*:?\\s*' + target, 'gi');
const reference = new RegExp('\\b(?:refs?|related to|related github issue|canonical issue)\\s*:?\\s*' + target, 'gi');

export function reconcileProductMetadata(pr, issue, repository) {
  const body = pr.body ?? '';
  const title = pr.title ?? '';
  const assertTarget = (remote, qualified, number) => {
    if ((remote ?? qualified ?? repository).toLowerCase() !== repository.toLowerCase() || Number(number) !== issue)
      throw new Error('PR names a conflicting issue');
  };
  const rewrite = value => {
    for (const match of value.matchAll(reference)) assertTarget(...match.slice(1, 4));
    const standalone = new RegExp('^(?:[-*] +)?(?:<' + target + '>|' + target + ')$', 'gim');
    for (const match of value.matchAll(standalone)) {
      assertTarget(...(match[3] ? match.slice(1, 4) : match.slice(4, 7)));
    }
    return value.replace(directive, (_, remote, qualified, number) => {
      assertTarget(remote, qualified, number);
      return 'Refs #' + issue;
    });
  };
  const cleaned = body.replace(/<!--\s*butterbox-issue\s*:\s*([^>]*?)-->/gi, (_, value) => {
    if (/^\d+$/.test(value.trim()) && Number(value.trim()) !== issue) throw new Error('PR names a conflicting issue');
    return '';
  }).split(/\r?\n/).filter(line => !/^\s*<!--\s*butterbox-(?:issue|delivery)\s*:/i.test(line)).join('\n');
  const text = rewrite(cleaned).trimEnd();
  const suffix = ['<!-- butterbox-issue: ' + issue + ' -->', autonomousDevelopmentMarker].join('\n');
  const normalized = rewrite(title);
  const related = new RegExp('\\bRefs #' + issue + '(?!\\d)', 'i').test(text);
  const next = [text, related ? '' : 'Refs #' + issue, suffix].filter(Boolean).join('\n\n');
  if (next.length > 60000) throw new Error('PR description exceeds GitHub safety bound');
  return { body: next, title: normalized, changed: next !== body || normalized !== title };
}

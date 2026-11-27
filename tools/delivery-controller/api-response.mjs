// Only recognize provider messages and structured fields that are safe to report.
export function githubDiagnostic(body) {
  const text = typeof body?.message === 'string' ? body.message : '';
  const messages = [
    [/pull request is not mergeable/i, 'Pull Request is not mergeable'],
    [/required status check.*(?:expected|pending|required|not successful)/i, 'Required status check is missing or pending'],
    [/approv.*(?:workflow|maintainer)|(?:workflow|maintainer).*approv/i, 'Workflow requires maintainer approval'],
    [/protected branch|branch protection|repository rule/i, 'Protected branch or repository rule rejected the request'],
    [/head (?:sha|branch).*modif|sha.*(?:match|changed)/i, 'Pull request head changed'],
    [/merge conflict/i, 'Merge conflict'],
    [/squash merg.*(?:disabl|not allowed)/i, 'Squash merging is disabled or disallowed'],
    [/resource not accessible by integration/i, 'Resource not accessible by integration'],
    [/bad credentials|requires authentication|invalid token/i, 'GitHub credential rejected'],
    [/secondary rate limit|primary rate limit|api rate limit/i, 'GitHub API rate limit exceeded'],
    [/validation failed/i, 'Validation Failed'],
    [/method not allowed/i, 'Method Not Allowed'],
  ];
  const message = messages.find(([pattern]) => pattern.test(text))?.[1] ?? (text ? 'unrecognized provider message (withheld)' : 'no provider message');
  const allowed = new Set(['PullRequest', 'PullRequestMerge', 'sha', 'merge_method', 'base', 'head', 'missing',
    'missing_field', 'invalid', 'already_exists', 'unprocessable', 'custom', 'protected']);
  const details = Array.isArray(body?.errors) ? body.errors.slice(0, 5).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const labels = [item.resource, item.field, item.code].filter(value => allowed.has(value));
    return labels.length ? [labels.join('/')] : [];
  }) : [];
  return message + (details.length ? ' · details ' + details.join(', ') : '');
}

export function responseFailure(response, { operation, endpoint }, stage, classification) {
  const header = name => response.headers?.get(name);
  const status = response.status;
  const limited = status === 429 || (status === 403 &&
    (header('x-ratelimit-remaining') === '0' || header('retry-after')));
  const category = limited || status === 408 || status >= 500 || response.ok
    ? 'integration' : status === 401 || status === 403 ? 'permission' : 'request';
  const safe = (value, pattern) => pattern.test(value ?? '') ? value : 'unknown';
  const type = safe(header('content-type')?.split(';')[0]?.trim(), /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i);
  const id = safe(header('x-github-request-id'), /^[a-z0-9:-]{1,100}$/i);
  const error = new Error(operation + ' HTTP ' + status + ' for ' + endpoint +
    ' · ' + stage + '/' + classification + ' · content-type ' + type + ' · request ' + id +
    ' · category ' + category);
  error.code = 'CONTROLLER_API';
  error.category = category;
  error.status = status;
  if (limited || status === 408 || status >= 500) error.retryAfter = header('retry-after');
  if (limited && header('x-ratelimit-remaining') === '0')
    error.rateLimitReset = header('x-ratelimit-reset');
  return error;
}

export async function apiResponse(response, contract) {
  if (!response.ok) {
    const error = responseFailure(response, contract, 'http', 'unsuccessful');
    if (contract.endpoint.startsWith('/') && contract.operation.startsWith('GitHub ')) {
      let payload;
      try { payload = JSON.parse(await response.text()); } catch { /* Keep HTTP diagnostics. */ }
      const diagnostic = githubDiagnostic(payload);
      error.message += ' · ' + diagnostic;
      if (error.status === 403 && diagnostic.startsWith('GitHub API rate limit exceeded')) {
        error.category = 'integration';
        error.retryAfter = response.headers?.get('retry-after');
        error.message = error.message.replace('category permission', 'category integration');
      }
      if (error.status === 403 && /repository rule rejected|maintainer approval/.test(diagnostic) &&
          /^\/pulls\/\d+\/merge$/.test(contract.endpoint) && error.category !== 'integration')
        error.nativeRestriction = true;
    }
    throw error;
  }
  let body;
  try {
    body = await response.text();
  } catch {
    throw responseFailure(response, contract, 'outer-body', 'unreadable');
  }
  const trimmed = body.trim();
  if (contract.ack && (!trimmed || (response.status === 200 && trimmed === 'OK'))) return null;
  try {
    const value = JSON.parse(trimmed);
    if (value !== null && typeof value === 'object') return value;
  } catch {
    // Never include the body or a JSON parser exception in diagnostics.
  }
  const classification = !trimmed ? 'empty' : trimmed === 'OK' ? 'plain-ok' : 'invalid-json';
  throw responseFailure(response, contract, 'outer-json', classification);
}

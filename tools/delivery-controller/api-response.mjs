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
  if (!response.ok) throw responseFailure(response, contract, 'http', 'unsuccessful');
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

// GitHub's job-log endpoint returns a 302 to a short-lived signed log URL.
// Authenticate only to api.github.com; NEVER forward the token to the redirect.
const maxBytes = 10 * 1024 * 1024;
const permittedHost = host =>
  host.endsWith('.blob.core.windows.net') ||
  host.endsWith('.actions.githubusercontent.com') ||
  host.endsWith('.githubusercontent.com');

export async function downloadJobLog({ repository, jobId, token, request = fetch }) {
  if (repository !== 'farbotkol/butterbox' || !Number.isSafeInteger(jobId) || jobId < 1 ||
      typeof token !== 'string' || !token) throw new Error('Invalid job log request');
  const apiUrl = 'https://api.github.com/repos/' + repository + '/actions/jobs/' + jobId + '/logs';
  const response = await request(apiUrl, {
    method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (response.status !== 302) throw new Error('GitHub job log redirect HTTP ' + response.status);
  const location = response.headers.get('location');
  let signed;
  try { signed = new URL(location); } catch { throw new Error('Invalid GitHub job log redirect'); }
  if (signed.protocol !== 'https:' || signed.username || signed.password ||
      signed.port || !permittedHost(signed.hostname.toLowerCase())) {
    throw new Error('Untrusted GitHub job log redirect');
  }
  const file = await request(signed.href, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  if (!file.ok) throw new Error('Signed GitHub job log HTTP ' + file.status);
  const length = Number(file.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) throw new Error('Job log exceeds size limit');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > maxBytes || !bytes.byteLength) throw new Error('Empty or oversized GitHub job log');
  const output = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!output.trim()) throw new Error('Empty GitHub job log');
  return output;
}

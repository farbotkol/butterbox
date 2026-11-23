import assert from 'node:assert/strict';
import { test } from 'node:test';
import { downloadJobLog } from '../tools/delivery-controller/job-log-download.mjs';

const repo = 'farbotkol/butterbox';
const redirect = 'https://pipelines.actions.githubusercontent.com/signed/log?token=secret';
const token = 'test-only-token';
const text = '2026-11-23T06:02:51.5412874Z LEASE_ACQUIRED for #305 by actions_45121500090_1\n';

test('job log download follows one trusted signed redirect without leaking GitHub token', async () => {
 const calls = [];
 const request = async (url, options) => {
  calls.push({ url, options });
  if (calls.length === 1) return { status: 302, headers: new Headers({ location: redirect }) };
  return { ok: true, status: 200, headers: new Headers(),
   arrayBuffer: async () => new TextEncoder().encode(text).buffer };
 };
 assert.equal(await downloadJobLog({ repository: repo, jobId: 137516122071, token, request }), text);
 assert.equal(calls.length, 2);
 assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + token);
 assert.equal(calls[0].options.redirect, 'manual');
 assert.equal(calls[1].url, redirect);
 assert.equal(calls[1].options.redirect, 'error');
 assert.equal(calls[1].options.headers, undefined);
});

test('job log download fails closed on nonredirect and untrusted locations', async () => {
 for (const location of [
  'http://pipelines.actions.githubusercontent.com/log', 'https://example.com/log',
  'https://pipelines.actions.githubusercontent.com.evil.com/log',
  'https://user:pw@pipelines.actions.githubusercontent.com/log',
  'https://api.github.com/another/path',
 ]) {
  let count = 0;
  await assert.rejects(downloadJobLog({ repository: repo, jobId: 123, token,
   request: async () => { count++; return { status: 302,
    headers: new Headers({ location }) }; } }), /Untrusted/);
  assert.equal(count, 1);
 }
 await assert.rejects(downloadJobLog({ repository: repo, jobId: 123, token,
  request: async () => ({ status: 403, headers: new Headers() }) }), /HTTP 403/);
});

test('job log download refuses failed, empty, oversized, or redirected signed payloads', async () => {
 for (const value of [
  { ok: false, status: 403, headers: new Headers() },
  { ok: true, status: 200, headers: new Headers({ 'content-length': '11000000' }) },
  { ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => new Uint8Array(0).buffer },
 ]) {
  let step = 0;
  await assert.rejects(downloadJobLog({ repository: repo, jobId: 123, token,
   request: async () => ++step === 1 ?
    { status: 302, headers: new Headers({ location: redirect }) } : value }));
 }
});

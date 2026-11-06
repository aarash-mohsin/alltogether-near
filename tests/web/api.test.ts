import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../../web/src/api.ts';

test('claim adapter preserves fixed credit identity, actor and idempotency boundary', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let seenUrl = ''; let seenOptions: RequestInit | undefined;
  globalThis.fetch = async (url, options) => {
    seenUrl = String(url); seenOptions = options;
    return Response.json({ ok: true, data: { evidence: { kind: 'local', reference: 'local-9' } }, source: { mode: 'local', network: 'local', stale: false, observedAt: '1800000000000' } });
  };
  const credit = '42:withdrawal:alice.alltogether.testnet:-';
  const result = await api.claim(credit, { actor: 'alice.alltogether.testnet', idempotencyKey: 'retry-this-exact-operation' });
  assert.equal(result.ok, true);
  assert.equal(seenUrl, `/api/credits/${encodeURIComponent(credit)}/claims`);
  assert.equal(seenOptions?.method, 'POST');
  assert.deepEqual(seenOptions?.headers, { 'Content-Type': 'application/json', 'X-Demo-Actor': 'alice.alltogether.testnet', 'Idempotency-Key': 'retry-this-exact-operation' });
  assert.equal(seenOptions?.body, '{}');
});

test('sponsor adapter transmits exact integer amounts and hash without numeric conversion', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let body: unknown;
  globalThis.fetch = async (_url, options) => { body = JSON.parse(String(options?.body)); return Response.json({ ok: false, error: { code: 'HASH_MISMATCH', message: 'The published terms changed.', retryable: false }, source: { mode: 'local', network: 'local', stale: false, observedAt: '1800000000000' } }); };
  const amount = '90071992547409931234567890123456789';
  const result = await api.fundSponsor('42', amount, 'abc123', { actor: 'community.alltogether.testnet', idempotencyKey: 'exact-sponsor-deposit' });
  assert.deepEqual(body, { amount, termsHash: 'abc123' });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'HASH_MISMATCH');
});

test('an unavailable service never falls back to fabricated local success', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => { throw new TypeError('Network unavailable'); };
  await assert.rejects(api.campaign('42'), /Network unavailable/);
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';

const base = process.env.ALLTOGETHER_URL || 'http://127.0.0.1:8787';
const organizer = 'organizer.alltogether.testnet';
const dao = 'community.alltogether.testnet';
const alice = 'alice.alltogether.testnet';
const equipment = 'equipment.alltogether.testnet';
async function read(path) { const response = await fetch(base + path); const value = await response.json(); if (!value.ok) throw new Error(`${value.error.code}: ${value.error.message}`); return value.data; }
async function command(path, body, actor, expectedError) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-Actor': actor, 'Idempotency-Key': randomUUID() }, body: JSON.stringify(body) });
  const value = await response.json();
  if (expectedError) { assert.equal(value.ok, false); assert.equal(value.error.code, expectedError); return value; }
  if (!value.ok) throw new Error(`${path}: ${value.error.code}: ${value.error.message}`);
  assert.equal(value.source.mode, 'local');
  return value.data;
}
async function resolved(id, creditId) {
  for (let tries = 0; tries < 100; tries++) {
    const campaign = await read(`/api/campaigns/${id}`);
    const credit = campaign.credits.find(value => value.id === creditId);
    if (credit && credit.pending === '0') return credit;
    await pause(100);
  }
  throw new Error('Local payout did not resolve within ten seconds.');
}

await command('/api/demo/seed', { scenario: 'accounts' }, organizer);
const legs = [
  { title: 'Venue', purpose: 'A place for the complete workshop', beneficiary: 'venue.alltogether.testnet', budget: '600000000', declaredSponsorCap: '200000000' },
  { title: 'Equipment', purpose: 'Tools for every participant', beneficiary: equipment, budget: '250000000', declaredSponsorCap: '125000000' },
  { title: 'Accessibility', purpose: 'Access support is essential', beneficiary: 'access.alltogether.testnet', budget: '150000000', declaredSponsorCap: '75000000' },
];

for (const successful of [false, true]) {
  const deadline = Date.now() + 6000;
  const published = await command('/api/campaigns', { title: `Verified ${successful ? 'complete' : 'incomplete'} plan`, summary: 'Live local command walkthrough', detail: 'Created and settled using the actual persistent local API.', deadlineMs: String(deadline), legs }, organizer);
  const id = published.campaign.id;
  const proposalResult = await command(`/api/campaigns/${id}/sponsor-proposal`, {}, organizer);
  await command(`/api/demo/proposals/${proposalResult.proposal.id}/decision`, { decision: 'Approved' }, dao);
  const hash = published.campaign.termsHash;
  await command(`/api/demo/campaigns/${id}/fund`, { amount: '400000000', termsHash: hash }, dao);
  for (const [legId, amount] of ['400000000', '125000000', successful ? '75000000' : '50000000'].entries()) {
    await command(`/api/campaigns/${id}/pledges`, { legId, amount, termsHash: hash }, alice);
  }
  await command(`/api/campaigns/${id}/pledges`, { legId: 0, amount: '1', termsHash: hash }, alice, 'LEG_FULL');
  await command(`/api/campaigns/${id}/finalize`, {}, alice, 'DEADLINE_NOT_REACHED');
  await pause(Math.max(0, deadline - Date.now()) + 30);
  const final = await command(`/api/campaigns/${id}/finalize`, {}, alice);
  assert.equal(final.campaign.state, successful ? 'Succeeded' : 'Failed');
  if (!successful) {
    assert.equal(final.campaign.credits.filter(value => value.kind === 'beneficiary').length, 0);
    await command(`/api/campaigns/${id}/refunds`, {}, alice);
    const campaign = await read(`/api/campaigns/${id}`);
    for (const credit of campaign.credits) {
      if (credit.available === '0') continue;
      await command(`/api/credits/${encodeURIComponent(credit.id)}/claims`, {}, credit.owner);
      assert.equal((await resolved(id, credit.id)).paid, credit.available);
    }
  } else {
    assert.deepEqual(final.campaign.credits.filter(value => value.kind === 'beneficiary').map(value => value.available).sort(), ['150000000', '250000000', '600000000']);
    const credit = final.campaign.credits.find(value => value.owner === equipment);
    const account = await read(`/api/accounts/${equipment}`);
    if (!account.registered) {
      await command(`/api/credits/${encodeURIComponent(credit.id)}/claims`, {}, equipment);
      assert.equal((await resolved(id, credit.id)).available, '250000000');
      await command('/api/demo/register-token', { accountId: equipment }, equipment);
    }
    for (const payout of final.campaign.credits.filter(value => value.kind === 'beneficiary')) {
      await command(`/api/credits/${encodeURIComponent(payout.id)}/claims`, {}, payout.owner);
      assert.equal((await resolved(id, payout.id)).paid, payout.available);
    }
  }
  const custody = await read('/api/custody');
  assert.equal(custody.bookReconciled, true);
  assert.equal(custody.tokenReconciliation, 'Matched');
  console.log(`PASS local campaign ${id}: ${successful ? 'all three beneficiary entitlements and payouts' : 'zero beneficiary entitlements and exact refunds'}; custody reconciled.`);
}
console.log('PASS actual local API scenario. These are local ledger transactions, not NEAR transactions.');

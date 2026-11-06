import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Account, Campaign, Credit } from '../../shared/types.ts';
import { latestAttemptError, reclaimablePrincipal } from '../../web/src/format.ts';

test('a successfully retried payment does not keep showing the older registration failure', () => {
  const credit = { id: '42:beneficiary:equipment.testnet:1' } as Credit;
  const failure = { id: '3', creditId: credit.id, status: 'Failed', errorCode: 'TOKEN_NOT_REGISTERED' };
  const success = { id: '5', creditId: credit.id, status: 'Succeeded' };
  for (const attempts of [[success, failure], [failure, success]]) {
    assert.equal(latestAttemptError({ attempts } as Campaign, credit), undefined);
  }
  assert.equal(latestAttemptError({ attempts: [failure] } as Campaign, credit), 'TOKEN_NOT_REGISTERED');
});

test('failed principal remains discoverable when terminal views project active principal to zero', () => {
  const account: Account = {
    id: 'alice.alltogether.testnet', roles: ['contributor'], registered: true,
    positions: [{ campaignId: '5', accountId: 'alice.alltogether.testnet', legId: 0, active: '0', acceptedTotal: '400000000', refundConsumed: false }],
    credits: [],
  };
  assert.equal(reclaimablePrincipal(account, '5'), '400000000');
  assert.equal(reclaimablePrincipal(account, '99'), '0');
});

test('refund discovery excludes withdrawn principal across available, pending and already-paid credits', () => {
  const account: Account = {
    id: 'alice.testnet', roles: ['contributor'], registered: true,
    positions: [
      { campaignId: '5', accountId: 'alice.testnet', legId: 0, active: '0', acceptedTotal: '400000000', refundConsumed: false },
      { campaignId: '5', accountId: 'alice.testnet', legId: 1, active: '0', acceptedTotal: '125000000', refundConsumed: false },
    ],
    credits: [{ id: '5:withdrawal:alice.testnet:-', campaignId: '5', kind: 'withdrawal', owner: 'alice.testnet', recipient: 'alice.testnet', available: '10000000', pending: '20000000', paid: '15000000' }],
  };
  assert.equal(reclaimablePrincipal(account, '5'), '480000000');
  account.credits.push({ id: '5:refund:alice.testnet:-', campaignId: '5', kind: 'refund', owner: 'alice.testnet', recipient: 'alice.testnet', available: '480000000', pending: '0', paid: '0' });
  assert.equal(reclaimablePrincipal(account, '5'), '0');
  account.positions.forEach(position => { position.refundConsumed = true; });
  assert.equal(reclaimablePrincipal(account, '5'), '0');
});

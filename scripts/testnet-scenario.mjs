import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { Account, JsonRpcProvider, KeyPairSigner } from 'near-api-js';
import { view, rpc, record } from './near/common.mjs';
const config = JSON.parse(readFileSync(new URL('../docs/testnet-config.json', import.meta.url), 'utf8'));
const provider = new JsonRpcProvider({ url: config.rpc });
function account(file) { const value = JSON.parse(readFileSync(new URL(`../.secrets/${file}.json`, import.meta.url), 'utf8')); return new Account(value.accountId, provider, KeyPairSigner.fromSecretKey(value.privateKey)); }
const owner = account('contracts-root');
const council = account('demo-root');
const observations = [];
const read = async (id, method, args = {}) => (await view(id, method, args, config)).value;
function publicReceipt(label, result) {
  const value = { label, transactionHash: result.transaction?.hash, status: result.status,
    receipts: result.receipts_outcome?.map(entry => ({ id: entry.id, executor: entry.outcome.executor_id, status: entry.outcome.status, logs: entry.outcome.logs })) };
  observations.push(value); return value;
}
function returned(result) { const encoded = result.status?.SuccessValue; return encoded ? JSON.parse(Buffer.from(encoded, 'base64').toString()) : null; }
async function call(who, id, method, args, deposit = 0n, gas = 150000000000000n) {
  const value = await who.callFunctionRaw({ contractId: id, methodName: method, args, deposit, gas, waitUntil: 'FINAL' });
  publicReceipt(`${id}.${method}`, value); return value;
}
async function balance(id) { return BigInt(await read(config.tokenId, 'ft_balance_of', { account_id: id })); }
if ((await rpc('status', [], config)).chain_id !== 'testnet') throw new Error('Testnet only.');
const tokenMetadata = await read(config.tokenId, 'ft_metadata');
assert.equal(tokenMetadata.symbol, 'testUSD'); assert.equal(tokenMetadata.decimals, 6);
const storage = await read(config.tokenId, 'storage_balance_bounds');
async function register(id) { if (!(await read(config.tokenId, 'storage_balance_of', { account_id: id }))) await call(owner, config.tokenId, 'storage_deposit', { account_id: id, registration_only: true }, BigInt(storage.min)); }
for (const id of [config.daoId, config.escrowId, config.beneficiaries[0], config.beneficiaries[2]]) await register(id);
const policy = await read(config.daoId, 'get_policy');
const escrowConfig = await read(config.escrowId, 'get_config');
assert.equal(escrowConfig.dao_id, config.daoId); assert.equal(escrowConfig.token_id, config.tokenId);
const storageQuote = await read(config.escrowId, 'quote_campaign_storage', { leg_count: 3 });
const legs = [
  { title: 'Venue', purpose: 'Workshop space', beneficiary: config.beneficiaries[0], budget: '600000000', declared_sponsor_cap: '200000000' },
  { title: 'Equipment', purpose: 'Shared tools', beneficiary: config.beneficiaries[1], budget: '250000000', declared_sponsor_cap: '125000000' },
  { title: 'Accessibility', purpose: 'Essential access', beneficiary: config.beneficiaries[2], budget: '150000000', declared_sponsor_cap: '75000000' },
];
const scenarios = [];
for (const success of [false, true]) {
  const deadline = Date.now() + 90000;
  const created = await call(owner, config.escrowId, 'create_campaign', { input: { title: success ? 'Complete accessible maker day' : 'Incomplete accessible maker day', summary: 'Genuine NEAR testnet verification', detail: 'One missing essential budget prevents all allocations.', deadline_ms: String(deadline), legs } }, BigInt(storageQuote.required_yocto));
  const campaign = returned(created);
  assert.ok(campaign?.id, 'Creation returned an actual campaign.');
  const id = campaign.id;
  const reserve = campaign.terms.legs.reduce((sum, leg) => sum + BigInt(leg.sponsorAllocation), 0n);
  await call(owner, config.tokenId, 'ft_transfer', { receiver_id: config.daoId, amount: String(reserve), memo: 'Dedicated testnet sponsor reserve' }, 1n);
  const proposalId = await read(config.daoId, 'get_last_proposal_id');
  const sponsorMessage = JSON.stringify({ v: 1, action: 'sponsor', campaign_id: id, terms_hash: campaign.terms_hash });
  const tokenArgs = { receiver_id: config.escrowId, amount: String(reserve), memo: `AllTogether campaign ${id}`, msg: sponsorMessage };
  await call(council, config.daoId, 'add_proposal', { proposal: { description: `AllTogether ${id}: all three essential budgets; immutable terms ${campaign.terms_hash}`, kind: { FunctionCall: { receiver_id: config.tokenId, actions: [{ method_name: 'ft_transfer_call', args: Buffer.from(JSON.stringify(tokenArgs)).toString('base64'), deposit: '1', gas: '100000000000000' }] } } } }, BigInt(policy.proposal_bond));
  await call(council, config.daoId, 'act_proposal', { id: proposalId, action: 'VoteApprove' }, 0n, 280000000000000n);
  const approved = await read(config.daoId, 'get_proposal', { id: proposalId });
  assert.equal(approved.status, 'Approved');
  assert.equal((await read(config.escrowId, 'get_campaign', { campaign_id: id })).state, 'Open');
  for (const [leg, amount] of ['400000000', '125000000', success ? '75000000' : '50000000'].entries()) {
    await call(owner, config.tokenId, 'ft_transfer_call', { receiver_id: config.escrowId, amount, msg: JSON.stringify({ v: 1, action: 'pledge', campaign_id: id, leg_id: leg, terms_hash: campaign.terms_hash }) }, 1n);
  }
  const beforeReject = await balance(owner.accountId);
  const rejected = await call(owner, config.tokenId, 'ft_transfer_call', { receiver_id: config.escrowId, amount: '1', msg: JSON.stringify({ v: 1, action: 'pledge', campaign_id: id, leg_id: 0, terms_hash: campaign.terms_hash }) }, 1n);
  assert.equal(await balance(owner.accountId), beforeReject, 'Overfill principal returned through actual token resolver.');
  assert.equal(String(returned(rejected)), '0', 'Token reports zero used on rejected transfer.');
  console.log(`Testnet campaign ${id} funded and overfill refunded; waiting for its actual deadline.`);
  while (Date.now() < deadline + 2000) await pause(Math.min(20000, deadline + 2000 - Date.now()));
  const beforeLate = await balance(owner.accountId);
  await call(owner, config.tokenId, 'ft_transfer_call', { receiver_id: config.escrowId, amount: '1', msg: JSON.stringify({ v: 1, action: 'pledge', campaign_id: id, leg_id: 2, terms_hash: campaign.terms_hash }) }, 1n);
  assert.equal(await balance(owner.accountId), beforeLate, 'Late principal returned.');
  await call(owner, config.escrowId, 'finalize', { campaign_id: id });
  const final = await read(config.escrowId, 'get_campaign', { campaign_id: id });
  assert.equal(final.state, success ? 'Succeeded' : 'Failed');
  const prefix = kind => `${id}:${kind}`;
  if (!success) {
    for (let leg = 0; leg < 3; leg++) assert.equal(await read(config.escrowId, 'get_credit', { credit_key: `${prefix('beneficiary')}:${config.beneficiaries[leg]}:${leg}` }), null);
    await call(owner, config.escrowId, 'materialize_refund', { campaign_id: id });
    const ownerCredit = `${prefix('refund')}:${owner.accountId}:-`;
    const daoCredit = `${prefix('sponsor_refund')}:${config.daoId}:-`;
    assert.equal((await read(config.escrowId, 'get_credit', { credit_key: ownerCredit })).available, '575000000');
    assert.equal((await read(config.escrowId, 'get_credit', { credit_key: daoCredit })).available, '400000000');
    for (const key of [ownerCredit, daoCredit]) await call(owner, config.escrowId, 'claim_credit', { credit_key: key }, 1n);
  } else {
    for (let leg = 0; leg < 3; leg++) {
      const key = `${prefix('beneficiary')}:${config.beneficiaries[leg]}:${leg}`;
      const credit = await read(config.escrowId, 'get_credit', { credit_key: key });
      assert.equal(credit.available, legs[leg].budget);
      const registered = await read(config.tokenId, 'storage_balance_of', { account_id: config.beneficiaries[leg] });
      if (!registered) {
        await call(owner, config.escrowId, 'claim_credit', { credit_key: key }, 1n);
        const failedCredit = await read(config.escrowId, 'get_credit', { credit_key: key });
        assert.equal(failedCredit.available, legs[leg].budget); assert.equal(failedCredit.pending, '0');
        assert.equal(failedCredit.last_attempt.status, 'Failed');
        await register(config.beneficiaries[leg]);
      }
      await call(owner, config.escrowId, 'claim_credit', { credit_key: key }, 1n);
      const paid = await read(config.escrowId, 'get_credit', { credit_key: key });
      assert.equal(paid.available, '0'); assert.equal(paid.paid, legs[leg].budget);
    }
  }
  const books = await read(config.escrowId, 'get_accounting', { campaign_id: null });
  assert.equal(BigInt(books.accepted_inflows) - BigInt(books.confirmed_paid), await balance(config.escrowId));
  scenarios.push({ campaignId: id, success, proposalId, final, accountingAfterPayouts: books });
  record('testnet-scenario-progress.json', { config, scenarios, observations });
  console.log(`PASS genuine testnet campaign ${id}: ${success ? 'all beneficiary payouts and failed-registration retry' : 'no beneficiary allocation; exact contributor and DAO refunds'}.`);
}
record('testnet-scenario.json', { config, tokenMetadata, daoPolicy: policy, escrowConfig, storageQuote, scenarios, observations });
writeFileSync(new URL('../docs/integration-status.json', import.meta.url), JSON.stringify({ sourceWritten: true, unitTested: true, wasmBuilt: true, sandboxVerified: false, deployedTestnet: true, liveFlowVerified: true,
  detail: `Actual NEAR testnet flows verified on ${config.escrowId}, token ${config.tokenId}, Sputnik DAO ${config.daoId}. UI remains an explicit local simulator; testnet receipts and CLI flow are recorded separately. Dedicated testnet upgrade keys are retained.`, evidencePath: 'docs/testnet-scenario.json' }, null, 2));
console.log('PASS full testnet flow. Public receipts: docs/testnet-scenario.json');

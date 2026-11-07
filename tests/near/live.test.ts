// Offline tests for the live verifier, board and contributor records. They run against the recorded snapshot
// (site/public/snapshot.json), then tamper with it to make sure each check can fail.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {codeHashOf,contributorRecords,planCsv,runChecks,EXPECTED_ESCROW_HASH,EXPECTED_TOKEN_HASH} from '../../shared/live.ts';
import type {LiveState} from '../../shared/live.ts';

const snapshot:LiveState=JSON.parse(readFileSync('site/public/snapshot.json','utf8'));
const config=JSON.parse(readFileSync('docs/testnet-config.json','utf8'));
const escrowWasm=new Uint8Array(readFileSync(config.artifacts.escrow.path));
const tokenWasm=new Uint8Array(readFileSync(config.artifacts.token.path));
const NOW=Date.UTC(2026,10,10);
const clone=():LiveState=>structuredClone(snapshot);
const run=async(state:LiveState)=>Object.fromEntries((await runChecks(state,{escrowWasm,tokenWasm,wasm_source:'test',now_ms:NOW})).map(c=>[c.id,c.status]));
const plan=(s:LiveState,id:string)=>s.plans.find(p=>p.campaign.id===id)!;

test('the committed WASMs have the deployed code hashes',async()=>{
  assert.equal(await codeHashOf(escrowWasm),EXPECTED_ESCROW_HASH);
  assert.equal(await codeHashOf(tokenWasm),EXPECTED_TOKEN_HASH);
});

test('every check passes on the recorded live state',async()=>{
  const result=await run(clone());
  assert.ok(Object.keys(result).length>=18);
  for(const [id,status] of Object.entries(result))assert.equal(status,'PASS',id);
});

test('a key on the escrow or the token fails the keyless checks',async()=>{
  const s=clone();s.escrow.keys=[{public_key:'ed25519:x'}];s.token.keys=[{public_key:'ed25519:y'}];
  const r=await run(s);assert.equal(r['keyless-escrow'],'FAIL');assert.equal(r['keyless-token'],'FAIL');
});

test('a different deployed code hash fails the code check',async()=>{
  const s=clone();s.escrow.code_hash='11111111111111111111111111111111';
  assert.equal((await run(s))['code-escrow'],'FAIL');
});

test('an escrow bound to another DAO fails the binding check',async()=>{
  const s=clone();s.escrow.config.dao_id='someone-else.sputnikv2.testnet';
  assert.equal((await run(s)).binding,'FAIL');
});

test('books that do not balance, or custody that does not match, fail',async()=>{
  const s=clone();s.escrow.accounting.active_principal=(BigInt(s.escrow.accounting.active_principal)+1n).toString();
  assert.equal((await run(s)).books,'FAIL');
  const t=clone();t.escrow.token_balance=(BigInt(t.escrow.token_balance)-1n).toString();
  assert.equal((await run(t)).custody,'FAIL');
});

test('a changed term fails the terms-hash check',async()=>{
  const s=clone();plan(s,'4').campaign.terms.legs[0].beneficiary='mallory.testnet';
  assert.equal((await run(s)).terms,'FAIL');
});

test('a plan opened without an approved, matching DAO proposal fails the DAO check',async()=>{
  const s=clone();plan(s,'4').proposal!.status='Rejected';
  assert.equal((await run(s)).dao,'FAIL');
  const t=clone();plan(t,'4').proposal!.amount='1';
  assert.equal((await run(t)).dao,'FAIL');
});

test('a successful plan with an underpaid beneficiary fails',async()=>{
  const s=clone();const credit=plan(s,'2').beneficiary_credits[0]!;credit.paid=(BigInt(credit.paid)-1n).toString();
  assert.equal((await run(s)).success,'FAIL');
});

test('a failed plan that paid a beneficiary, or shorted a refund, fails',async()=>{
  const s=clone();const p=plan(s,'1');p.beneficiary_credits[0]={...plan(s,'2').beneficiary_credits[0]!};
  assert.equal((await run(s)).failure,'FAIL');
  const t=clone();const refund=plan(t,'1').contributors[0].credits.find(c=>c.kind==='refund')!;refund.paid=(BigInt(refund.paid)-1n).toString();
  assert.equal((await run(t)).failure,'FAIL');
});

test('money in must match the funds_accepted events',async()=>{
  const s=clone();s.events=s.events.filter(e=>!(e.event==='funds_accepted'&&e.data.action==='pledge'&&e.data.campaign_id==='4'));
  assert.equal((await run(s)).inflows,'FAIL');
});

test('a payout recorded twice fails the retry check',async()=>{
  const s=clone();const paid=s.events.find(e=>e.event==='transfer_resolved'&&e.data.success&&e.data.credit_id==='2:beneficiary:equipment.at-rel-owner-mw4f9xmq.testnet:1')!;
  s.events.push({...paid});
  assert.equal((await run(s)).retry,'FAIL');
});

test('contributor records add up per named account',()=>{
  const records=contributorRecords(clone());
  const alice=records.find(r=>r.account_id==='alice.at-rel-owner-mw4f9xmq.testnet')!;
  // Plan 1 failed (alice refunded 525), plan 2 succeeded (400 reached the venue), plan 4 is open (500).
  assert.equal(alice.backed,3);assert.equal(alice.succeeded,1);assert.equal(alice.failed,1);assert.equal(alice.open,1);
  assert.equal(alice.paid_to_beneficiaries,'400000000');assert.equal(alice.refunded,'525000000');
  for(const r of records)assert.ok(r.contributions.every(c=>/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(c.tx)));
});

test('the plan CSV lists every pledge, the DAO match, the outcome and the payouts',()=>{
  const lines=planCsv(clone(),'2').trim().split('\n');
  assert.equal(lines[0],'time_utc,event,account,budget,amount_testUSD,transaction');
  const kinds=lines.slice(1).map(l=>l.split(',')[1]);
  assert.ok(kinds.includes('dao_match'));assert.ok(kinds.includes('pledge'));assert.ok(kinds.includes('finalized_succeeded'));
  assert.ok(kinds.includes('payout_failed_beneficiary'));assert.equal(kinds.filter(k=>k==='paid_beneficiary').length,3);
});

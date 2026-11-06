import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Account, JsonRpcProvider, KeyPairSigner } from 'near-api-js';
const rpc = 'https://test.rpc.fastnear.com';
const credentials = JSON.parse(readFileSync(new URL('../.secrets/demo-root.json', import.meta.url), 'utf8'));
const provider = new JsonRpcProvider({ url: rpc });
const root = new Account(credentials.accountId, provider, KeyPairSigner.fromSecretKey(credentials.privateKey));
async function request(method, params) {
  const response = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'alltogether-dao', method, params }), signal: AbortSignal.timeout(20000) });
  const value = await response.json(); if (value.error) throw new Error(JSON.stringify(value.error)); return value.result;
}
async function view(account, method, args = {}) {
  const value = await request('query', { request_type: 'call_function', finality: 'final', account_id: account, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
  return JSON.parse(Buffer.from(value.result).toString());
}
if ((await request('status', [])).chain_id !== 'testnet') throw new Error('Only testnet is permitted.');
const name = `alltogether-${credentials.accountId.split('.')[0].replace(/^at-/, '')}`;
const daoId = `${name}.sputnikv2.testnet`;
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
let policy;
try { policy = await view(daoId, 'get_policy'); }
catch (error) {
  if (!String(error.message).includes('UNKNOWN_ACCOUNT')) throw error;
  const args = Buffer.from(JSON.stringify({ config: { name: 'AllTogether demo community', purpose: 'Dedicated NEAR testnet funding demonstration; test assets only.', metadata: '' }, policy: [credentials.accountId] })).toString('base64');
  const transaction = await root.callFunctionRaw({ contractId: 'sputnikv2.testnet', methodName: 'create', args: { name, args }, deposit: 6000000000000000000000000n, gas: 150000000000000n, waitUntil: 'FINAL' });
  writeFileSync(new URL('../docs/testnet-dao-creation.json', import.meta.url), JSON.stringify(transaction, null, 2));
  policy = await view(daoId, 'get_policy');
}
const state = await request('query', { request_type: 'view_account', finality: 'final', account_id: daoId });
const config = await view(daoId, 'get_config');
const record = { network: 'testnet', rpc, rootAccount: credentials.accountId, daoId, factory: 'sputnikv2.testnet', codeHash: state.code_hash, policy, config, observedAt: new Date().toISOString(), note: 'Dedicated single-member demo council; no real funds or user wallets.' };
writeFileSync(new URL('../docs/testnet-dao.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ network: 'testnet', daoId, codeHash: state.code_hash, proposalBond: policy.proposal_bond, council: credentials.accountId }, null, 2));

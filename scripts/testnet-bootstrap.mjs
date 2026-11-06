// Dedicated, valueless testnet demo account only. Never loads an existing user wallet.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { KeyPair } from 'near-api-js';
import { setTimeout as pause } from 'node:timers/promises';
const rpc = 'https://test.rpc.fastnear.com';
async function query(method, params) {
  const response = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'alltogether-bootstrap', method, params }), signal: AbortSignal.timeout(20000) });
  const value = await response.json();
  if (value.error) throw new Error(JSON.stringify(value.error));
  return value.result;
}
const status = await query('status', []);
if (status.chain_id !== 'testnet') throw new Error('Refusing a network other than testnet.');
mkdirSync(new URL('../.secrets/', import.meta.url), { recursive: true });
const slot = process.argv[2] || 'demo-root';
if (!['demo-root', 'contracts-root'].includes(slot)) throw new Error('Unknown dedicated testnet slot.');
const file = new URL(`../.secrets/${slot}.json`, import.meta.url);
let dedicated;
if (existsSync(file)) dedicated = JSON.parse(readFileSync(file, 'utf8'));
else {
  const key = KeyPair.fromRandom('ed25519');
  dedicated = { purpose: 'AllTogether generated testnet demo only', accountId: `at-${Date.now().toString(36)}.testnet`, publicKey: key.getPublicKey().toString(), privateKey: key.toString() };
  writeFileSync(file, JSON.stringify(dedicated, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
let account;
try { account = await query('query', { request_type: 'view_account', finality: 'final', account_id: dedicated.accountId }); }
catch (error) {
  if (!String(error.message).includes('UNKNOWN_ACCOUNT')) throw error;
  const response = await fetch('https://helper.nearprotocol.com/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newAccountId: dedicated.accountId, newAccountPublicKey: dedicated.publicKey }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Testnet faucet returned HTTP ${response.status}; no deployment claimed.`);
  const faucetResult = await response.json();
  writeFileSync(new URL('../.secrets/faucet-result.json', import.meta.url), JSON.stringify(faucetResult, null, 2));
  for (let tries = 0; tries < 12; tries++) {
    try { account = await query('query', { request_type: 'view_account', finality: 'final', account_id: dedicated.accountId }); break; }
    catch (pending) { if (!String(pending.message).includes('UNKNOWN_ACCOUNT')) throw pending; await pause(1000); }
  }
  if (!account) throw new Error(`Faucet has not produced a confirmed account. Public result: ${JSON.stringify(faucetResult).slice(0, 1000)}`);
}
console.log(JSON.stringify({ network: 'testnet', accountId: dedicated.accountId, balanceYocto: account.amount, storageUsage: account.storage_usage, credentialLocation: `.secrets/${slot}.json`, note: 'Generated dedicated testnet key is not printed.' }, null, 2));
